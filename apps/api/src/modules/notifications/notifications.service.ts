import { Injectable } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaginationQueryDto, userId?: string, unreadOnly?: string) {
    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (unreadOnly === 'true') where.isRead = false;

    return this.prisma.client.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(query.limit ?? 100, 1), 200)
    });
  }

  async create(payload: Record<string, unknown>) {
    const tenantId = this.prisma.getTenantId();

    return this.prisma.client.notification.create({
      data: {
        tenant_Id: tenantId,
        userId: payload.userId ? String(payload.userId) : null,
        title: String(payload.title ?? ''),
        content: payload.content ? String(payload.content) : payload.message ? String(payload.message) : null,
        isRead: false
      }
    });
  }

  async markRead(id: string) {
    await this.prisma.client.notification.updateMany({
      where: { id },
      data: { isRead: true }
    });
    return this.prisma.client.notification.findFirst({ where: { id } });
  }
}
