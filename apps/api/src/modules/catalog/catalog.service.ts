import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GenericStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ArchiveProductDto,
  CatalogListQueryDto,
  CreateProductDto,
  SetPricePolicyDto,
  UpdateProductDto
} from './dto/catalog.dto';

@Injectable()
export class CatalogService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listProducts(query: CatalogListQueryDto) {
    const where: Prisma.ProductWhereInput = {
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
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { sku: { contains: query.q, mode: 'insensitive' } },
              { categoryPath: { contains: query.q, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    return this.prisma.client.product.findMany({
      where,
      include: {
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
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
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

    return this.prisma.client.product.create({
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

    return this.ensureProduct(id);
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

    return this.ensureProduct(id);
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

    return this.ensureProduct(id);
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

  private take(limit?: number) {
    if (!limit || limit <= 0) {
      return 100;
    }
    return Math.min(limit, 250);
  }
}
