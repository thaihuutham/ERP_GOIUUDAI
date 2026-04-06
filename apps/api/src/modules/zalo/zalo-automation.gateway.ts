import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ZaloAutomationRealtimeService } from './zalo-automation-realtime.service';

type OrgJoinPayload = {
  orgId?: string;
};

type AccountSubscriptionPayload = {
  accountId?: string;
};

@WebSocketGateway({
  namespace: '/zalo-automation',
  cors: {
    origin: true,
    credentials: true
  }
})
export class ZaloAutomationGateway implements OnGatewayInit {
  private readonly logger = new Logger(ZaloAutomationGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly realtime?: ZaloAutomationRealtimeService) {}

  afterInit(server: Server) {
    if (!this.realtime) {
      this.logger.warn('Realtime service unavailable during gateway init; socket binding skipped.');
      return;
    }
    this.realtime.bindServer(server);
  }

  @SubscribeMessage('org:join')
  handleOrgJoin(@ConnectedSocket() socket: Socket, @MessageBody() payload: OrgJoinPayload) {
    const orgId = String(payload?.orgId ?? '').trim();
    if (!orgId) {
      return;
    }
    socket.join(`org:${orgId}`);
    this.logger.debug(`socket ${socket.id} joined org:${orgId}`);
  }

  @SubscribeMessage('zalo:subscribe')
  handleZaloSubscribe(@ConnectedSocket() socket: Socket, @MessageBody() payload: AccountSubscriptionPayload) {
    const accountId = String(payload?.accountId ?? '').trim();
    if (!accountId) {
      return;
    }
    socket.join(`account:${accountId}`);
    this.logger.debug(`socket ${socket.id} joined account:${accountId}`);
  }

  @SubscribeMessage('zalo:unsubscribe')
  handleZaloUnsubscribe(@ConnectedSocket() socket: Socket, @MessageBody() payload: AccountSubscriptionPayload) {
    const accountId = String(payload?.accountId ?? '').trim();
    if (!accountId) {
      return;
    }
    socket.leave(`account:${accountId}`);
    this.logger.debug(`socket ${socket.id} left account:${accountId}`);
  }
}
