import { Body, Controller, Get, Inject, Put, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settingsService: SettingsService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  listRawSettings() {
    return this.settingsService.listRawSettings();
  }

  @Get('config')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  getConfig() {
    return this.settingsService.getConfig();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  upsertSetting(@Body() body: Record<string, unknown>) {
    return this.settingsService.upsertSetting(body);
  }

  @Put('config')
  @Roles(UserRole.ADMIN)
  saveConfig(@Body() body: Record<string, unknown>) {
    return this.settingsService.saveConfig(body);
  }

  @Get('bhtot/sync/config')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  getBhtotSyncConfig() {
    return this.settingsService.getBhtotSyncConfig();
  }

  @Put('bhtot/sync/config')
  @Roles(UserRole.ADMIN)
  saveBhtotSyncConfig(@Body() body: Record<string, unknown>) {
    return this.settingsService.saveBhtotSyncConfig(body);
  }

  @Get('bhtot/sync/status')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  getBhtotSyncStatus() {
    return this.settingsService.getBhtotSyncStatus();
  }

  @Post('bhtot/sync/run')
  @Roles(UserRole.ADMIN)
  runBhtotSync() {
    return this.settingsService.runBhtotOneWaySync();
  }
}
