import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  AllocateAssetDto,
  AssetLifecycleTransitionDto,
  AssetsListQueryDto,
  CreateAssetDto,
  CreateMaintenanceScheduleDto,
  DepreciationPreviewQueryDto,
  PostDepreciationDto,
  ReturnAssetDto,
  UpdateAssetDto
} from './dto/assets.dto';
import { AssetsService } from './assets.service';

@Controller('assets')
export class AssetsController {
  constructor(@Inject(AssetsService) private readonly assetsService: AssetsService) {}

  @Get()
  @Roles(UserRole.USER, UserRole.ADMIN)
  listAssets(@Query() query: AssetsListQueryDto) {
    return this.assetsService.listAssets(query);
  }

  @Post()
  @Roles(UserRole.USER, UserRole.ADMIN)
  createAsset(@Body() body: CreateAssetDto) {
    return this.assetsService.createAsset(body);
  }

  @Patch(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  updateAsset(@Param('id') id: string, @Body() body: UpdateAssetDto) {
    return this.assetsService.updateAsset(id, body);
  }

  @Post(':id/lifecycle')
  @Roles(UserRole.USER, UserRole.ADMIN)
  transitionLifecycle(@Param('id') id: string, @Body() body: AssetLifecycleTransitionDto) {
    return this.assetsService.transitionLifecycle(id, body);
  }

  @Get('allocations')
  @Roles(UserRole.USER, UserRole.ADMIN)
  listAllocations(@Query() query: PaginationQueryDto, @Query('assetId') assetId?: string) {
    return this.assetsService.listAllocations(query, assetId);
  }

  @Get(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  getAsset(@Param('id') id: string) {
    return this.assetsService.getAsset(id);
  }

  @Post(':id/allocate')
  @Roles(UserRole.USER, UserRole.ADMIN)
  allocate(@Param('id') id: string, @Body() body: AllocateAssetDto) {
    return this.assetsService.allocateAsset(id, body);
  }

  @Post(':id/return')
  @Roles(UserRole.USER, UserRole.ADMIN)
  returnAsset(@Param('id') id: string, @Body() body: ReturnAssetDto) {
    return this.assetsService.returnAsset(id, body);
  }

  @Get(':id/maintenance-schedules')
  @Roles(UserRole.USER, UserRole.ADMIN)
  listMaintenanceSchedules(@Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.assetsService.listMaintenanceSchedules(id, query);
  }

  @Post(':id/maintenance-schedules')
  @Roles(UserRole.USER, UserRole.ADMIN)
  createMaintenanceSchedule(@Param('id') id: string, @Body() body: CreateMaintenanceScheduleDto) {
    return this.assetsService.createMaintenanceSchedule(id, body);
  }

  @Post('maintenance-schedules/:scheduleId/complete')
  @Roles(UserRole.USER, UserRole.ADMIN)
  completeMaintenanceSchedule(@Param('scheduleId') scheduleId: string) {
    return this.assetsService.completeMaintenanceSchedule(scheduleId);
  }

  @Get(':id/depreciation/preview')
  @Roles(UserRole.USER, UserRole.ADMIN)
  depreciationPreview(@Param('id') id: string, @Query() query: DepreciationPreviewQueryDto) {
    return this.assetsService.depreciationPreview(id, query);
  }

  @Get(':id/depreciation/entries')
  @Roles(UserRole.USER, UserRole.ADMIN)
  listDepreciationEntries(@Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.assetsService.listDepreciationEntries(id, query);
  }

  @Post(':id/depreciation/post')
  @Roles(UserRole.USER, UserRole.ADMIN)
  postDepreciation(@Param('id') id: string, @Body() body: PostDepreciationDto) {
    return this.assetsService.postDepreciation(id, body);
  }
}
