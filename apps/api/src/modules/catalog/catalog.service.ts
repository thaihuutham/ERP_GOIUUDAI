import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GenericStatus, Prisma } from '@prisma/client';
import {
  buildCursorListResponse,
  resolvePageLimit,
  resolveSortQuery,
  sliceCursorItems
} from '../../common/pagination/pagination-response';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import {
  ArchiveProductDto,
  CatalogListQueryDto,
  CreateProductDto,
  SetPricePolicyDto,
  UpdateProductDto
} from './dto/catalog.dto';

type ProductImportError = {
  rowIndex: number;
  identifier?: string;
  message: string;
};

type ProductImportSummary = {
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errors: ProductImportError[];
};

type ProductImportRowResult = {
  operation: 'create' | 'update';
  productId: string;
};

@Injectable()
export class CatalogService {
  private readonly productSortableFields = [
    'createdAt',
    'sku',
    'name',
    'productType',
    'unitPrice',
    'status',
    'id'
  ] as const;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SearchService) private readonly search: SearchService
  ) {}

  async listProducts(query: CatalogListQueryDto, entityIds?: string[]) {
    const take = resolvePageLimit(query.limit, 25, 100);
    const keyword = query.q?.trim();
    const { sortBy, sortDir, sortableFields } = resolveSortQuery(query, {
      sortableFields: this.productSortableFields,
      defaultSortBy: 'createdAt',
      defaultSortDir: 'desc',
      errorLabel: 'catalog/products'
    });
    const orderBy = this.buildProductSortOrderBy(sortBy, sortDir);
    const where: Prisma.ProductWhereInput = {
      ...(Array.isArray(entityIds) ? { id: { in: entityIds } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.category
        ? {
            categoryPath: {
              contains: query.category,
              mode: 'insensitive'
            }
          }
        : {}),
      ...(query.variantOfProductId ? { variantOfProductId: query.variantOfProductId } : {}),
      ...(!query.includeArchived ? { archivedAt: null } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword, mode: 'insensitive' } },
              { sku: { contains: keyword, mode: 'insensitive' } },
              { categoryPath: { contains: keyword, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const baseInclude = {
      variantOf: {
        select: {
          id: true,
          sku: true,
          name: true
        }
      },
      variants: {
        where: query.includeArchived ? {} : { archivedAt: null },
        select: {
          id: true,
          sku: true,
          name: true,
          unitPrice: true,
          status: true,
          archivedAt: true
        },
        orderBy: { createdAt: 'asc' as const }
      }
    };

    if (keyword && sortBy === 'createdAt' && await this.search.shouldUseHybridSearch(keyword, query.cursor)) {
      const rankedIds = await this.search.searchProductIds(
        keyword,
        this.prisma.getTenantId(),
        Math.min((take + 1) * 5, 500),
        {
          status: query.status,
          includeArchived: query.includeArchived
        }
      );

      if (rankedIds !== null) {
        const cursorIndex = query.cursor ? rankedIds.findIndex((id) => id === query.cursor) : -1;
        const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
        const lookupIds = rankedIds.slice(startIndex, startIndex + take + 1);
        const rankedRows = rankedIds.length > 0
          ? await this.prisma.client.product.findMany({
              where: {
                ...where,
                id: { in: lookupIds }
              },
              include: baseInclude
            })
          : [];
        const orderedRows = this.rankByIds(rankedRows, lookupIds);
        const { items, hasMore, nextCursor } = sliceCursorItems(orderedRows, take);
        return buildCursorListResponse(items, {
          limit: take,
          hasMore,
          nextCursor,
          sortBy,
          sortDir,
          sortableFields,
          consistency: 'snapshot'
        });
      }
    }

    const rows = await this.prisma.client.product.findMany({
      where,
      include: baseInclude,
      orderBy,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });
    const { items, hasMore, nextCursor } = sliceCursorItems(rows, take);
    return buildCursorListResponse(items, {
      limit: take,
      hasMore,
      nextCursor,
      sortBy,
      sortDir,
      sortableFields,
      consistency: 'snapshot'
    });
  }

  async getProduct(id: string) {
    return this.ensureProduct(id);
  }

  async listVariants(id: string) {
    await this.ensureProduct(id);
    return this.prisma.client.product.findMany({
      where: {
        variantOfProductId: id,
        archivedAt: null
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  async createProduct(body: CreateProductDto) {
    if (body.variantOfProductId) {
      await this.ensureProduct(body.variantOfProductId);
    }

    const status = body.status ?? GenericStatus.ACTIVE;
    const archivedAt = status === GenericStatus.ARCHIVED ? new Date() : null;

    const created = await this.prisma.client.product.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        sku: body.sku ?? null,
        name: body.name,
        productType: body.productType,
        categoryPath: body.categoryPath ?? null,
        attributesJson:
          body.attributesJson !== undefined ? (body.attributesJson as Prisma.InputJsonValue) : Prisma.DbNull,
        variantOfProductId: body.variantOfProductId ?? null,
        pricePolicyCode: body.pricePolicyCode ?? null,
        unitPrice: new Prisma.Decimal(body.unitPrice),
        status,
        archivedAt
      }
    });
    await this.search.syncProductUpsert(created);
    return created;
  }

  async updateProduct(id: string, body: UpdateProductDto) {
    const existing = await this.ensureProduct(id);
    if (body.variantOfProductId === id) {
      throw new BadRequestException('Sản phẩm không thể là biến thể của chính nó.');
    }

    if (body.variantOfProductId) {
      await this.ensureProduct(body.variantOfProductId);
    }

    const nextStatus = body.status ?? existing.status;
    const archivedAt = nextStatus === GenericStatus.ARCHIVED
      ? (existing.archivedAt ?? new Date())
      : body.status
        ? null
        : undefined;

    await this.prisma.client.product.updateMany({
      where: { id },
      data: {
        sku: body.sku,
        name: body.name,
        productType: body.productType,
        categoryPath: body.categoryPath,
        attributesJson: body.attributesJson !== undefined ? (body.attributesJson as Prisma.InputJsonValue) : undefined,
        variantOfProductId: body.variantOfProductId,
        pricePolicyCode: body.pricePolicyCode,
        unitPrice: body.unitPrice !== undefined ? new Prisma.Decimal(body.unitPrice) : undefined,
        status: body.status,
        archivedAt
      }
    });

    const product = await this.ensureProduct(id);
    await this.search.syncProductUpsert(product);
    return product;
  }

  async archiveProduct(id: string, _body: ArchiveProductDto) {
    const product = await this.ensureProduct(id);
    if (product.archivedAt) {
      return product;
    }

    await this.prisma.client.product.updateMany({
      where: { id },
      data: {
        status: GenericStatus.ARCHIVED,
        archivedAt: new Date()
      }
    });

    const archived = await this.ensureProduct(id);
    await this.search.syncProductUpsert(archived);
    return archived;
  }

  async setPricePolicy(id: string, body: SetPricePolicyDto) {
    await this.ensureProduct(id);

    await this.prisma.client.product.updateMany({
      where: { id },
      data: {
        pricePolicyCode: body.policyCode,
        unitPrice: body.unitPrice !== undefined ? new Prisma.Decimal(body.unitPrice) : undefined
      }
    });

    const product = await this.ensureProduct(id);
    await this.search.syncProductUpsert(product);
    return product;
  }

  async importProducts(payload: Record<string, unknown>): Promise<ProductImportSummary> {
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (rows.length === 0) {
      throw new BadRequestException('Thiếu dữ liệu rows để import sản phẩm.');
    }

    const maxRows = 2_000;
    const slicedRows = rows.slice(0, maxRows);
    const importedProductIds = new Set<string>();
    const errors: ProductImportError[] = [];
    let importedCount = 0;

    for (let index = 0; index < slicedRows.length; index += 1) {
      const rowIndex = index + 1;
      const row = this.ensureRecord(slicedRows[index]);
      const identifier = this.cleanString(row.sku) || this.cleanString(row.name) || undefined;

      try {
        const result = await this.upsertImportProductRow(row);
        importedProductIds.add(result.productId);
        importedCount += 1;
      } catch (error) {
        errors.push({
          rowIndex,
          identifier,
          message: this.mapImportErrorMessage(error)
        });
      }
    }

    if (importedProductIds.size > 0) {
      const products = await this.prisma.client.product.findMany({
        where: {
          id: {
            in: [...importedProductIds]
          }
        }
      });
      for (const product of products) {
        await this.search.syncProductUpsert(product);
      }
    }

    return {
      totalRows: slicedRows.length,
      importedCount,
      skippedCount: slicedRows.length - importedCount,
      errors
    };
  }

  private async upsertImportProductRow(row: Record<string, unknown>): Promise<ProductImportRowResult> {
    const sku = this.requiredString(row.sku, 'Thiếu SKU.');
    const existing = await this.prisma.client.product.findFirst({
      where: { sku }
    });

    const status = this.hasOwn(row, 'status')
      ? this.parseImportStatus(row.status)
      : undefined;
    const parsedPrice = this.hasOwn(row, 'unitPrice')
      ? this.parseImportUnitPrice(row.unitPrice)
      : undefined;

    if (existing) {
      const nextStatus = status ?? existing.status;
      const archivedAt = nextStatus === GenericStatus.ARCHIVED
        ? (existing.archivedAt ?? new Date())
        : status
          ? null
          : undefined;

      await this.prisma.client.product.updateMany({
        where: { id: existing.id },
        data: {
          name: this.hasOwn(row, 'name')
            ? this.requiredString(row.name, 'Thiếu tên sản phẩm.')
            : undefined,
          productType: this.hasOwn(row, 'productType')
            ? this.parseImportProductType(row.productType)
            : undefined,
          categoryPath: this.hasOwn(row, 'categoryPath')
            ? (this.optionalString(row.categoryPath) ?? null)
            : undefined,
          pricePolicyCode: this.hasOwn(row, 'pricePolicyCode')
            ? (this.optionalString(row.pricePolicyCode) ?? null)
            : undefined,
          unitPrice: parsedPrice !== undefined ? new Prisma.Decimal(parsedPrice) : undefined,
          status,
          archivedAt
        }
      });
      return {
        operation: 'update',
        productId: existing.id
      };
    }

    const name = this.requiredString(row.name, 'Thiếu tên sản phẩm cho dòng tạo mới.');
    const productType = this.parseImportProductType(row.productType);
    const unitPrice = this.parseImportUnitPrice(row.unitPrice, { required: true });
    if (unitPrice === undefined) {
      throw new BadRequestException('Thiếu đơn giá sản phẩm.');
    }
    const nextStatus = status ?? GenericStatus.ACTIVE;
    const archivedAt = nextStatus === GenericStatus.ARCHIVED ? new Date() : null;

    const created = await this.prisma.client.product.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        sku,
        name,
        productType,
        categoryPath: this.optionalString(row.categoryPath) ?? null,
        pricePolicyCode: this.optionalString(row.pricePolicyCode) ?? null,
        unitPrice: new Prisma.Decimal(unitPrice),
        status: nextStatus,
        archivedAt
      }
    });

    return {
      operation: 'create',
      productId: created.id
    };
  }

  private async ensureProduct(id: string) {
    const product = await this.prisma.client.product.findFirst({
      where: { id },
      include: {
        variantOf: true,
        variants: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });
    if (!product) {
      throw new NotFoundException(`Product not found: ${id}`);
    }
    return product;
  }

  private buildProductSortOrderBy(
    sortBy: string,
    sortDir: 'asc' | 'desc'
  ): Prisma.ProductOrderByWithRelationInput[] {
    if (sortBy === 'id') {
      return [{ id: sortDir }];
    }

    return [
      { [sortBy]: sortDir },
      { id: sortDir }
    ] as Prisma.ProductOrderByWithRelationInput[];
  }

  private rankByIds<T extends { id: string }>(rows: T[], orderedIds: string[]) {
    const rankMap = new Map(orderedIds.map((id, index) => [id, index]));
    return [...rows].sort((left, right) => {
      const leftRank = rankMap.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rankMap.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank;
    });
  }

  private parseImportStatus(value: unknown): GenericStatus {
    const normalized = this.cleanString(value).toUpperCase();
    if (!normalized) {
      throw new BadRequestException('Trạng thái sản phẩm không hợp lệ.');
    }

    const status = Object.values(GenericStatus).find((candidate) => candidate === normalized);
    if (!status) {
      throw new BadRequestException(`Trạng thái sản phẩm không hợp lệ: ${normalized}.`);
    }
    return status;
  }

  private parseImportProductType(value: unknown): string {
    const normalized = this.cleanString(value).toUpperCase();
    if (!normalized) {
      throw new BadRequestException('Thiếu loại sản phẩm (PRODUCT hoặc SERVICE).');
    }

    if (normalized === 'PRODUCT' || normalized === 'SERVICE') {
      return normalized;
    }

    if (normalized === 'HANG_HOA' || normalized === 'HANGHOA') {
      return 'PRODUCT';
    }
    if (normalized === 'DICH_VU' || normalized === 'DICHVU') {
      return 'SERVICE';
    }

    throw new BadRequestException(`Loại sản phẩm không hợp lệ: ${normalized}.`);
  }

  private parseImportUnitPrice(
    value: unknown,
    options: { required?: boolean } = {}
  ) {
    const required = options.required === true;
    if (value === null || value === undefined || value === '') {
      if (required) {
        throw new BadRequestException('Thiếu đơn giá sản phẩm.');
      }
      return undefined;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new BadRequestException('Đơn giá sản phẩm không hợp lệ.');
    }
    if (required && numeric <= 0) {
      throw new BadRequestException('Đơn giá sản phẩm phải lớn hơn 0.');
    }
    return numeric;
  }

  private mapImportErrorMessage(error: unknown) {
    if (error instanceof BadRequestException || error instanceof NotFoundException) {
      const response = error.getResponse();
      if (typeof response === 'string' && response.trim()) {
        return response;
      }
      if (response && typeof response === 'object' && 'message' in response) {
        const message = (response as { message?: unknown }).message;
        if (Array.isArray(message)) {
          return message.map((item) => String(item)).join('; ');
        }
        if (typeof message === 'string' && message.trim()) {
          return message;
        }
      }
      return error.message;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return 'SKU đã tồn tại ở bản ghi khác.';
      }
      return `Lỗi dữ liệu Prisma (${error.code}).`;
    }

    return error instanceof Error ? error.message : 'Không thể import dòng dữ liệu sản phẩm.';
  }

  private ensureRecord(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private hasOwn(record: Record<string, unknown>, key: string) {
    return Object.prototype.hasOwnProperty.call(record, key);
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }

  private optionalString(value: unknown) {
    const normalized = this.cleanString(value);
    return normalized || undefined;
  }

  private requiredString(value: unknown, message: string) {
    const normalized = this.cleanString(value);
    if (!normalized) {
      throw new BadRequestException(message);
    }
    return normalized;
  }
}
