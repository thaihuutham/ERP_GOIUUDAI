import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

type ZaloAutomationServerEvent =
  | 'zalo:qr'
  | 'zalo:scanned'
  | 'zalo:connected'
  | 'zalo:disconnected'
  | 'zalo:error'
  | 'zalo:qr-expired'
  | 'zalo:reconnect-failed'
  | 'chat:message'
  | 'chat:deleted';

type UnknownPayload = Record<string, unknown>;

@Injectable()
export class ZaloAutomationRealtimeService {
  private server: Server | null = null;

  bindServer(server: Server) {
    this.server = server;
  }

  emitToOrg(orgId: string | null | undefined, event: ZaloAutomationServerEvent, payload: UnknownPayload) {
    if (!this.server) {
      return;
    }
    const normalizedOrgId = String(orgId ?? '').trim();
    if (!normalizedOrgId) {
      return;
    }
    this.server.to(`org:${normalizedOrgId}`).emit(event, payload);
  }

  emitToAccount(accountId: string | null | undefined, event: ZaloAutomationServerEvent, payload: UnknownPayload) {
    if (!this.server) {
      return;
    }
    const normalizedAccountId = String(accountId ?? '').trim();
    if (!normalizedAccountId) {
      return;
    }
    this.server.to(`account:${normalizedAccountId}`).emit(event, payload);
  }

  emitScoped(
    args: {
      orgId?: string | null;
      accountId?: string | null;
      event: ZaloAutomationServerEvent;
      payload: UnknownPayload;
    }
  ) {
    const payload = args.payload;
    this.emitToOrg(args.orgId, args.event, payload);
    this.emitToAccount(args.accountId, args.event, payload);
  }
}
