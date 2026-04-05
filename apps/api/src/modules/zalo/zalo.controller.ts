import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { Public } from '../../common/auth/auth.decorators';
import { ZaloService } from './zalo.service';

@Controller('zalo')
export class ZaloController {
  constructor(@Inject(ZaloService) private readonly zaloService: ZaloService) {}

  @Get('accounts')
  listAccounts(@Query('accountType') accountType?: 'PERSONAL' | 'OA' | 'ALL') {
    return this.zaloService.listAccounts(accountType);
  }

  @Post('accounts')
  createAccount(@Body() body: Record<string, unknown>) {
    return this.zaloService.createAccount(body);
  }

  @Patch('accounts/:id')
  updateAccount(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.zaloService.updateAccount(id, body);
  }

  @Post('accounts/:id/personal/login')
  startPersonalLogin(@Param('id') id: string) {
    return this.zaloService.startPersonalLogin(id);
  }

  @Get('accounts/:id/personal/qr')
  getPersonalQr(@Param('id') id: string) {
    return this.zaloService.getPersonalQr(id);
  }

  @Post('accounts/:id/personal/reconnect')
  reconnectPersonal(@Param('id') id: string) {
    return this.zaloService.reconnectPersonal(id);
  }

  @Post('accounts/:id/personal/disconnect')
  disconnectPersonal(@Param('id') id: string) {
    return this.zaloService.disconnectPersonal(id);
  }

  @Post('accounts/:id/personal/messages/send')
  sendPersonalMessage(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.zaloService.sendPersonalMessage(id, body);
  }

  @Post('accounts/:id/oa/messages/send')
  sendOaMessage(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.zaloService.sendOaMessage(id, body);
  }

  @Get('accounts/:id/assignments')
  listAccountAssignments(@Param('id') id: string) {
    return this.zaloService.listAccountAssignments(id);
  }

  @Put('accounts/:id/assignments/:userId')
  upsertAccountAssignment(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.zaloService.upsertAccountAssignment(id, userId, body);
  }

  @Delete('accounts/:id/assignments/:userId')
  revokeAccountAssignment(@Param('id') id: string, @Param('userId') userId: string) {
    return this.zaloService.revokeAccountAssignment(id, userId);
  }

  @Get('operations/metrics')
  getOperationalMetrics() {
    return this.zaloService.getOperationalMetrics();
  }

  @Public()
  @Post('oa/webhook/messages')
  ingestOaWebhook(
    @Body() body: Record<string, unknown>,
    @Req() req: { rawBody?: Buffer },
    @Headers('x-zalo-signature') signature?: string
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(body ?? {});
    return this.zaloService.ingestOaWebhook(body, rawBody, signature);
  }
}
