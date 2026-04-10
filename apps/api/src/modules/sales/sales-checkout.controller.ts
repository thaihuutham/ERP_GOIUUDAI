import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuditAction } from '../../common/audit/audit.decorators';
import { Public } from '../../common/auth/auth.decorators';
import {
  ActivationLineCompleteDto,
  CreateSalesCheckoutOrderDto,
  PaymentBankEventDto,
  PaymentOverrideDto,
  ReEvaluateInvoiceActionDto,
  SubmitCheckoutOrderDto,
  UpdateDraftCheckoutOrderDto
} from './dto/sales-checkout.dto';
import { PaymentCallbackRateLimitGuard } from './guards/payment-callback-rate-limit.guard';
import { SalesCheckoutService } from './sales-checkout.service';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
};

@Controller('sales/checkout')
export class SalesCheckoutController {
  constructor(@Inject(SalesCheckoutService) private readonly checkoutService: SalesCheckoutService) {}

  @Post('orders')
  @AuditAction({ action: 'CREATE_CHECKOUT_ORDER', entityType: 'Order' })
  createCheckoutOrder(@Body() body: CreateSalesCheckoutOrderDto) {
    return this.checkoutService.createCheckoutOrder(body);
  }

  @Patch('orders/:id')
  @AuditAction({ action: 'UPDATE_DRAFT_CHECKOUT_ORDER', entityType: 'Order', entityIdParam: 'id' })
  updateDraftOrder(@Param('id') orderId: string, @Body() body: UpdateDraftCheckoutOrderDto) {
    return this.checkoutService.updateDraftOrder(orderId, body);
  }

  @Post('orders/:id/submit')
  @AuditAction({ action: 'SUBMIT_CHECKOUT_ORDER', entityType: 'Order', entityIdParam: 'id' })
  submitCheckoutOrder(@Param('id') orderId: string, @Body() body: SubmitCheckoutOrderDto) {
    return this.checkoutService.submitCheckoutOrder(orderId, body);
  }

  @Get('orders/:id')
  getCheckoutOrder(@Param('id') orderId: string) {
    return this.checkoutService.getCheckoutOrder(orderId);
  }

  @Get('orders/:id/payment-intent')
  getCheckoutPaymentIntent(@Param('id') orderId: string) {
    return this.checkoutService.getCheckoutPaymentIntent(orderId);
  }

  @Get('config')
  getCheckoutConfig() {
    return this.checkoutService.getCheckoutConfig();
  }

  @Post('orders/:id/payment-overrides')
  @AuditAction({ action: 'CHECKOUT_PAYMENT_OVERRIDE', entityType: 'PaymentIntent', entityIdParam: 'id' })
  createPaymentOverride(@Param('id') orderId: string, @Body() body: PaymentOverrideDto) {
    return this.checkoutService.createPaymentOverride(orderId, body);
  }

  @Post('orders/:id/activation-lines/:lineId/complete')
  @AuditAction({ action: 'CHECKOUT_ACTIVATION_COMPLETE', entityType: 'OrderItem', entityIdParam: 'lineId' })
  completeActivationLine(
    @Param('id') orderId: string,
    @Param('lineId') lineId: string,
    @Body() body: ActivationLineCompleteDto
  ) {
    return this.checkoutService.completeActivationLine(orderId, lineId, body);
  }

  @Post('orders/:id/invoice-actions/re-evaluate')
  @AuditAction({ action: 'CHECKOUT_INVOICE_REEVALUATE', entityType: 'Order', entityIdParam: 'id' })
  reEvaluateInvoice(@Param('id') orderId: string, @Body() body: ReEvaluateInvoiceActionDto) {
    return this.checkoutService.reEvaluateInvoiceAction(orderId, body);
  }
}

@Controller('integrations/payments')
export class SalesPaymentIntegrationController {
  constructor(@Inject(SalesCheckoutService) private readonly checkoutService: SalesCheckoutService) {}

  @Public()
  @UseGuards(PaymentCallbackRateLimitGuard)
  @Post('bank-events')
  @AuditAction({ action: 'CHECKOUT_BANK_EVENT', entityType: 'PaymentIntent' })
  processBankEvent(@Body() body: PaymentBankEventDto, @Req() req: RequestLike) {
    return this.checkoutService.processBankEvent(body, {
      signature: this.readHeader(req.headers, 'x-signature') || this.readHeader(req.headers, 'x-hmac-signature'),
      timestamp: this.readHeader(req.headers, 'x-timestamp') || this.readHeader(req.headers, 'x-webhook-timestamp'),
      idempotencyKey: this.readHeader(req.headers, 'idempotency-key') || this.readHeader(req.headers, 'x-idempotency-key'),
      rawBody: Buffer.isBuffer(req.rawBody) ? req.rawBody : undefined
    });
  }

  private readHeader(headers: RequestLike['headers'], key: string) {
    if (!headers) {
      return '';
    }
    const value = headers[key];
    if (Array.isArray(value)) {
      return String(value[0] ?? '').trim();
    }
    return String(value ?? '').trim();
  }
}
