import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { SearchModule } from '../search/search.module';
import { SettingsModule } from '../settings/settings.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { SalesCheckoutController, SalesPaymentIntegrationController } from './sales-checkout.controller';
import { SalesFileUploadController } from './sales-file-upload.controller';
import { PaymentCallbackRateLimitGuard } from './guards/payment-callback-rate-limit.guard';
import { SalesCheckoutService } from './sales-checkout.service';
import { SalesDraftCleanupService } from './sales-draft-cleanup.service';
import { SalesFileUploadService } from './sales-file-upload.service';
import { SalesOcrService } from './sales-ocr.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [SearchModule, SettingsModule, WorkflowsModule, IamModule],
  controllers: [SalesController, SalesCheckoutController, SalesPaymentIntegrationController, SalesFileUploadController],
  providers: [SalesService, SalesCheckoutService, SalesFileUploadService, SalesOcrService, SalesDraftCleanupService, PaymentCallbackRateLimitGuard]
})
export class SalesModule {}
