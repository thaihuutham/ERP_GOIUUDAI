import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './auth.constants';
import { resolveModuleKeyFromPath } from './permission.util';
import { RuntimeSettingsService } from '../settings/runtime-settings.service';

@Injectable()
export class ModuleAvailabilityGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ url?: string; originalUrl?: string }>();
    const path = String(request.originalUrl ?? request.url ?? '');
    const moduleKey = resolveModuleKeyFromPath(path);
    if (!moduleKey) {
      return true;
    }

    const enabled = await this.runtimeSettings.isModuleEnabled(moduleKey);
    if (!enabled) {
      throw new ForbiddenException(`Phân hệ '${moduleKey}' đang bị tắt trong Settings Center Enterprise.`);
    }
    return true;
  }
}

