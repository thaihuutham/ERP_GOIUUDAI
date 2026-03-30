import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ListOptions = {
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  take?: number;
  skip?: number;
};

@Injectable()
export class PrismaCrudService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(model: string, options: ListOptions = {}): Promise<unknown[]> {
    const { where, orderBy, take, skip } = options;
    return this.prisma.getDelegate(model).findMany({
      where,
      orderBy: orderBy ?? { createdAt: 'desc' },
      take: take ?? 100,
      skip
    });
  }

  async detail(model: string, id: string): Promise<unknown | null> {
    return this.prisma.getDelegate(model).findFirst({ where: { id } });
  }

  async create(model: string, data: object): Promise<unknown> {
    return this.prisma.getDelegate(model).create({ data });
  }

  async update(model: string, id: string, data: object): Promise<unknown | null> {
    await this.prisma.getDelegate(model).updateMany({ where: { id }, data });
    return this.detail(model, id);
  }

  async remove(model: string, id: string): Promise<{ deleted: number }> {
    const res = await this.prisma.getDelegate(model).deleteMany({ where: { id } });
    return { deleted: res.count };
  }
}
