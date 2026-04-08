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
}
