import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConversationChannel, ConversationSenderType } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ZaloOaOutboundWorkerService } from './zalo-oa-outbound.worker';
import { ZaloPersonalPoolService } from './zalo-personal.pool.service';

type AccountType = 'PERSONAL' | 'OA';

@Injectable()
export class ZaloService {
  private readonly oaOutboundWorker = new ZaloOaOutboundWorkerService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly conversationsService: ConversationsService,
    private readonly personalPool: ZaloPersonalPoolService
  ) {}

  async listAccounts(accountType?: AccountType | 'ALL') {
    return this.prisma.client.zaloAccount.findMany({
      where: {
        ...(accountType && accountType !== 'ALL' ? { accountType } : {})
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  async createAccount(payload: Record<string, unknown>) {
    const accountType = this.parseAccountType(payload.accountType, 'PERSONAL');
    const displayName = this.optionalString(payload.displayName) ?? null;
    const zaloUid = this.optionalString(payload.zaloUid) ?? null;

    const created = await this.prisma.client.zaloAccount.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        accountType,
        displayName,
        zaloUid,
        phone: this.optionalString(payload.phone) ?? null,
        ownerUserId: this.optionalString(payload.ownerUserId) ?? null,
        status: 'DISCONNECTED',
        metadataJson: (payload.metadataJson as any) ?? undefined
      }
    });

    return created;
  }

  async updateAccount(id: string, payload: Record<string, unknown>) {
    const account = await this.prisma.client.zaloAccount.findFirst({ where: { id } });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản Zalo.');
    }

    await this.prisma.client.zaloAccount.updateMany({
      where: { id },
      data: {
        accountType: payload.accountType ? this.parseAccountType(payload.accountType, account.accountType as AccountType) : undefined,
        displayName: payload.displayName !== undefined ? this.optionalString(payload.displayName) ?? null : undefined,
        zaloUid: payload.zaloUid !== undefined ? this.optionalString(payload.zaloUid) ?? null : undefined,
        phone: payload.phone !== undefined ? this.optionalString(payload.phone) ?? null : undefined,
        ownerUserId: payload.ownerUserId !== undefined ? this.optionalString(payload.ownerUserId) ?? null : undefined,
        status: payload.status !== undefined ? this.optionalString(payload.status)?.toUpperCase() : undefined,
        metadataJson: payload.metadataJson !== undefined ? (payload.metadataJson as any) : undefined
      }
    });

    return this.prisma.client.zaloAccount.findFirst({ where: { id } });
  }

  async startPersonalLogin(id: string) {
    const account = await this.requirePersonalAccount(id);
    void this.personalPool.startQrLogin(account.id);
    return {
      message: 'Đã khởi tạo đăng nhập QR cho Zalo cá nhân.',
      accountId: account.id
    };
  }

  async getPersonalQr(id: string) {
    await this.requirePersonalAccount(id);
    const qrImage = this.personalPool.getQrImage(id);
    return {
      accountId: id,
      status: this.personalPool.getStatus(id),
      qrImage
    };
  }

  async reconnectPersonal(id: string) {
    const account = await this.requirePersonalAccount(id);
    const session = (account.sessionData ?? null) as { cookie?: unknown; imei?: string; userAgent?: string } | null;

    if (!session?.imei) {
      throw new BadRequestException('Không có session đã lưu. Hãy đăng nhập QR trước.');
    }

    void this.personalPool.reconnectWithSavedSession(id, session);
    return {
      message: 'Đã khởi tạo reconnect cho Zalo cá nhân.',
      accountId: id
    };
  }

  async disconnectPersonal(id: string) {
    await this.requirePersonalAccount(id);
    await this.personalPool.disconnect(id);
    return {
      message: 'Đã ngắt kết nối tài khoản Zalo cá nhân.',
      accountId: id
    };
  }

  async sendPersonalMessage(id: string, payload: Record<string, unknown>) {
    await this.requirePersonalAccount(id);

    const externalThreadId = this.requiredString(payload.externalThreadId, 'Thiếu externalThreadId.');
    const content = this.requiredString(payload.content, 'Thiếu nội dung tin nhắn.');
    const threadType = this.optionalString(payload.threadType)?.toLowerCase() === 'group' ? 'group' : 'user';

    return this.personalPool.sendMessage(id, externalThreadId, content, threadType);
  }

  async sendOaMessage(id: string, payload: Record<string, unknown>) {
    const account = await this.requireOaAccount(id);

    const externalThreadId = this.requiredString(payload.externalThreadId, 'Thiếu externalThreadId.');
    const content = this.requiredString(payload.content, 'Thiếu nội dung tin nhắn.');

    const delivery = await this.oaOutboundWorker.sendTextMessage({
      account: {
        id: account.id,
        accessTokenEnc: account.accessTokenEnc,
        metadataJson: account.metadataJson
      },
      externalThreadId,
      content,
      recipientId: this.optionalString(payload.recipientId)
    });

    const message = await this.conversationsService.ingestExternalMessage({
      channel: ConversationChannel.ZALO_OA,
      channelAccountId: account.id,
      externalThreadId,
      externalMessageId: delivery.externalMessageId,
      senderType: ConversationSenderType.AGENT,
      senderExternalId: this.optionalString(payload.senderExternalId) ?? account.zaloUid ?? undefined,
      senderName: this.optionalString(payload.senderName) ?? account.displayName ?? 'Staff',
      content,
      contentType: this.optionalString(payload.contentType) ?? 'TEXT',
      sentAt: payload.sentAt ? this.parseDate(payload.sentAt, 'sentAt') : new Date(),
      customerId: this.optionalString(payload.customerId),
      customerDisplayName: this.optionalString(payload.customerDisplayName),
      metadataJson: (payload.metadataJson as any) ?? undefined,
      attachmentsJson: (payload.attachmentsJson as any) ?? undefined
    });

    return {
      success: true,
      messageId: delivery.externalMessageId ?? message.id,
      message,
      delivery
    };
  }

  async ingestOaWebhook(
    payload: Record<string, unknown>,
    rawBody: string,
    signatureHeader?: string
  ) {
    this.verifyOaWebhookSignature(rawBody, signatureHeader);

    const accountId = this.requiredString(payload.zaloAccountId, 'Thiếu zaloAccountId.');
    const account = await this.prisma.client.zaloAccount.findFirst({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản OA.');
    }
    if (String(account.accountType).toUpperCase() !== 'OA') {
      throw new BadRequestException('zaloAccountId không thuộc loại OA.');
    }

    const externalThreadId = this.requiredString(payload.externalThreadId, 'Thiếu externalThreadId.');
    const senderType = this.parseSenderType(payload.senderType, ConversationSenderType.CUSTOMER);

    const message = await this.conversationsService.ingestExternalMessage({
      channel: ConversationChannel.ZALO_OA,
      channelAccountId: accountId,
      externalThreadId,
      externalMessageId: this.optionalString(payload.externalMessageId),
      senderType,
      senderExternalId: this.optionalString(payload.senderExternalId),
      senderName: this.optionalString(payload.senderName),
      content: this.optionalString(payload.content) ?? '',
      contentType: this.optionalString(payload.contentType) ?? 'TEXT',
      sentAt: payload.sentAt ? this.parseDate(payload.sentAt, 'sentAt') : new Date(),
      customerId: this.optionalString(payload.customerId),
      customerDisplayName: this.optionalString(payload.customerDisplayName),
      metadataJson: (payload.metadataJson as any) ?? undefined,
      attachmentsJson: (payload.attachmentsJson as any) ?? undefined
    });

    return {
      success: true,
      message
    };
  }

  private verifyOaWebhookSignature(rawBody: string, signatureHeader?: string) {
    const secret = this.config.get<string>('ZALO_OA_WEBHOOK_SECRET', '').trim();
    if (!secret) {
      throw new UnauthorizedException('Thiếu cấu hình ZALO_OA_WEBHOOK_SECRET. Không thể xác thực webhook.');
    }

    if (!signatureHeader) {
      throw new UnauthorizedException('Thiếu chữ ký webhook.');
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (expected !== signatureHeader.trim()) {
      throw new UnauthorizedException('Chữ ký webhook không hợp lệ.');
    }
  }

  private async requirePersonalAccount(id: string) {
    const account = await this.prisma.client.zaloAccount.findFirst({ where: { id } });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản Zalo.');
    }

    if (String(account.accountType).toUpperCase() !== 'PERSONAL') {
      throw new BadRequestException('Tài khoản không phải loại PERSONAL.');
    }

    return account;
  }

  private async requireOaAccount(id: string) {
    const account = await this.prisma.client.zaloAccount.findFirst({ where: { id } });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản Zalo.');
    }

    if (String(account.accountType).toUpperCase() !== 'OA') {
      throw new BadRequestException('Tài khoản không phải loại OA.');
    }

    return account;
  }

  private parseAccountType(input: unknown, fallback: AccountType): AccountType {
    const candidate = String(input ?? '').trim().toUpperCase();
    if (candidate === 'PERSONAL' || candidate === 'OA') {
      return candidate;
    }
    return fallback;
  }

  private parseSenderType(input: unknown, fallback: ConversationSenderType): ConversationSenderType {
    const candidate = String(input ?? '').trim().toUpperCase();
    if ((Object.values(ConversationSenderType) as string[]).includes(candidate)) {
      return candidate as ConversationSenderType;
    }
    return fallback;
  }

  private requiredString(input: unknown, message: string) {
    const value = this.optionalString(input);
    if (!value) {
      throw new BadRequestException(message);
    }
    return value;
  }

  private optionalString(input: unknown) {
    if (input === null || input === undefined) {
      return undefined;
    }

    const value = String(input).trim();
    return value || undefined;
  }

  private parseDate(input: unknown, fieldName: string) {
    const parsed = new Date(String(input));
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} không hợp lệ.`);
    }
    return parsed;
  }
}
