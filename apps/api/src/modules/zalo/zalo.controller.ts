import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { Public } from '../../common/auth/auth.decorators';
import { ZaloCampaignService } from './zalo-campaign.service';
import { ZaloService } from './zalo.service';

@Controller('zalo')
export class ZaloController {
  constructor(
    @Inject(ZaloService) private readonly zaloService: ZaloService,
    @Inject(ZaloCampaignService) private readonly zaloCampaignService: ZaloCampaignService
  ) {}

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

  @Delete('accounts/:id')
  softDeleteAccount(@Param('id') id: string) {
    return this.zaloService.softDeleteAccount(id);
  }

  @Post('accounts/:id/sync-contacts')
  syncContacts(@Param('id') id: string) {
    return this.zaloService.syncContacts(id);
  }

  @Post('accounts/:id/personal/login')
  startPersonalLogin(@Param('id') id: string) {
    return this.zaloService.startPersonalLogin(id);
  }

  @Get('accounts/:id/personal/qr')
  getPersonalQr(@Param('id') id: string) {
    return this.zaloService.getPersonalQr(id);
  }

  @Get('accounts/:id/personal/listener-debug')
  getPersonalListenerDebug(@Param('id') id: string) {
    return this.zaloService.getPersonalListenerDebug(id);
  }

  @Post('accounts/:id/personal/request-old-messages')
  requestPersonalOldMessages(@Param('id') id: string) {
    return this.zaloService.requestPersonalOldMessages(id);
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

  @Get('campaigns')
  listCampaigns() {
    return this.zaloCampaignService.listCampaigns();
  }

  @Post('campaigns')
  createCampaign(@Body() body: Record<string, unknown>) {
    return this.zaloCampaignService.createCampaign(body);
  }

  @Get('campaigns/:id')
  getCampaignById(@Param('id') id: string) {
    return this.zaloCampaignService.getCampaignById(id);
  }

  @Patch('campaigns/:id')
  updateCampaign(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.zaloCampaignService.updateCampaign(id, body);
  }

  @Post('campaigns/:id/start')
  startCampaign(@Param('id') id: string) {
    return this.zaloCampaignService.startCampaign(id);
  }

  @Post('campaigns/:id/pause')
  pauseCampaign(@Param('id') id: string) {
    return this.zaloCampaignService.pauseCampaign(id);
  }

  @Post('campaigns/:id/resume')
  resumeCampaign(@Param('id') id: string) {
    return this.zaloCampaignService.resumeCampaign(id);
  }

  @Post('campaigns/:id/cancel')
  cancelCampaign(@Param('id') id: string) {
    return this.zaloCampaignService.cancelCampaign(id);
  }

  @Delete('campaigns/:id')
  deleteCampaign(@Param('id') id: string) {
    return this.zaloCampaignService.deleteCampaign(id);
  }

  @Put('campaigns/:id/operators/:userId')
  assignCampaignOperator(@Param('id') id: string, @Param('userId') userId: string) {
    return this.zaloCampaignService.assignOperator(id, userId);
  }

  @Delete('campaigns/:id/operators/:userId')
  revokeCampaignOperator(@Param('id') id: string, @Param('userId') userId: string) {
    return this.zaloCampaignService.revokeOperator(id, userId);
  }

  @Get('campaigns/:id/recipients')
  listCampaignRecipients(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('limit') limitRaw?: string
  ) {
    const limit = Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : undefined;
    return this.zaloCampaignService.listRecipients(id, { status, limit });
  }

  @Get('campaigns/:id/attempts')
  listCampaignAttempts(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('limit') limitRaw?: string
  ) {
    const limit = Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : undefined;
    return this.zaloCampaignService.listAttempts(id, { status, limit });
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
