import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { SearchModule } from '../search/search.module';
import { SettingsModule } from '../settings/settings.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { SalesCheckoutController, SalesPaymentIntegrationController } from './sales-checkout.controller';
import { PaymentCallbackRateLimitGuard } from './guards/payment-callback-rate-limit.guard';
import { SalesCheckoutService } from './sales-checkout.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [SearchModule, SettingsModule, WorkflowsModule, IamModule],
  controllers: [SalesController, SalesCheckoutController, SalesPaymentIntegrationController],
  providers: [SalesService, SalesCheckoutService, PaymentCallbackRateLimitGuard]
})
export class SalesModule {}
