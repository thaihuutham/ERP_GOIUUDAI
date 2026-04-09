# Checkout Test Matrix v1 (2026-04-09)

## Mục tiêu
- Đóng hạng mục deferred về test matrix checkout chuyên sâu.
- Map rõ acceptance criteria -> test tự động -> trạng thái chạy.

## Matrix
| ID | Nhóm | Kịch bản | Kỳ vọng | Test tự động |
|---|---|---|---|---|
| CKO-CB-01 | Callback Idempotency | Cùng `idempotencyKey/transactionRef` callback 2 lần | Không cộng tiền lần 2, trả `duplicate=true` | `apps/api/test/sales-checkout.service.test.ts` |
| CKO-CB-02 | Callback Partial | UNPAID nhận partial payment | Intent -> `PARTIALLY_PAID`, order -> `PARTIALLY_PAID`, QR còn active | `apps/api/test/sales-checkout.service.test.ts` |
| CKO-CB-03 | Callback Full | Sau partial nhận phần còn lại | Intent -> `PAID`, order -> `PAID`, QR inactive, trigger invoice re-evaluate ON_PAID | `apps/api/test/sales-checkout.service.test.ts` |
| CKO-RL-01 | Callback Rate Limit | Burst cùng `ip+intent` > threshold | Trả HTTP 429 | `apps/api/test/payment-callback-rate-limit.guard.test.ts` |
| CKO-RL-02 | Callback Rate Limit | Tổng callback theo IP vượt threshold | Trả HTTP 429 | `apps/api/test/payment-callback-rate-limit.guard.test.ts` |
| CKO-RL-03 | Callback Rate Limit | Lấy IP theo `x-forwarded-for` | Áp dụng rate-limit đúng IP client | `apps/api/test/payment-callback-rate-limit.guard.test.ts` |
| CKO-PERM-01 | Permission | Staff/Sale gọi payment override | Bị chặn `ForbiddenException` | `apps/api/test/sales-checkout.service.test.ts` |
| CKO-PERM-02 | Permission + Audit | Admin gọi payment override | Được phép, có log override, cập nhật intent status | `apps/api/test/sales-checkout.service.test.ts` |
| CKO-EFF-01 | Effective Mapping | Complete activation line có `effectiveFrom/effectiveTo` | Sync sang `ServiceContract.startsAt/endsAt` và field legacy mapping | `apps/api/test/sales-checkout.service.test.ts` |
| CKO-INV-01 | Invoice Trigger | TELECOM trigger `ON_PAID` | Tạo hóa đơn khi paid | `apps/api/test/sales-checkout.service.test.ts` |
| CKO-INV-02 | Invoice Trigger | INSURANCE trigger `ON_ACTIVATED` nhưng chưa activated | Không trigger (TRIGGER_CONDITION_NOT_MET) | `apps/api/test/sales-checkout.service.test.ts` |
| CKO-INV-03 | Invoice Trigger | Rule `requireFullPayment=true` nhưng mới partial | Không trigger (FULL_PAYMENT_REQUIRED) | `apps/api/test/sales-checkout.service.test.ts` |

## Kết quả chạy hiện tại
- `npm run test --workspace @erp/api -- test/payment-callback-rate-limit.guard.test.ts test/sales-checkout.service.test.ts`
- Kết quả: **11/11 tests passed**.
