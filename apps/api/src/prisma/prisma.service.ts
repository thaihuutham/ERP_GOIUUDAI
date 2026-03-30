import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { PrismaClient } from '@prisma/client';
import { TENANT_CONTEXT_KEY } from '../common/tenant/tenant.constants';
import { createTenantPrismaExtension } from './tenant-prisma.extension';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly baseClient: PrismaClient;
  private isConnected = false;
  readonly client: PrismaClient;

  constructor(
    @Inject(ClsService) private readonly cls: ClsService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {
    this.baseClient = new PrismaClient({
      datasourceUrl: this.config.get<string>('DATABASE_URL')
    });

    this.client = this.baseClient.$extends(
      createTenantPrismaExtension(() =>
        this.cls.get(TENANT_CONTEXT_KEY) ?? this.config.get<string>('DEFAULT_TENANT_ID', 'tenant_demo_company')
      )
    ) as PrismaClient;
  }

  async onModuleInit(): Promise<void> {
    if (this.shouldSkipConnect()) {
      return;
    }

    await this.baseClient.$connect();
    this.isConnected = true;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    await this.baseClient.$disconnect();
  }

  getTenantId(): string {
    return this.cls.get(TENANT_CONTEXT_KEY) ?? this.config.get<string>('DEFAULT_TENANT_ID', 'tenant_demo_company');
  }

  getDelegate(model: string): any {
    const delegate = (this.client as any)[model];
    if (!delegate) {
      throw new Error(`Unknown Prisma delegate: ${model}`);
    }
    return delegate;
  }

  private shouldSkipConnect(): boolean {
    const rawFlag = this.config.get<string>('PRISMA_SKIP_CONNECT');
    if (!rawFlag) {
      return false;
    }

    const normalizedFlag = rawFlag.trim().toLowerCase();
    return normalizedFlag === '1' || normalizedFlag === 'true' || normalizedFlag === 'yes';
  }
}
