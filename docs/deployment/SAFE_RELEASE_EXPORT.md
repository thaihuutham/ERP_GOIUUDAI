# Safe Release Export

## Mục tiêu
Đảm bảo bundle bàn giao/release **không chứa** dữ liệu nhạy cảm hoặc artifact nội bộ:
- `.env`, `apps/**/.env`
- `.git`, metadata VCS
- `.agent`, session/memory nội bộ
- `node_modules`, `dist`, `.next`, cache local
- `test-results`, `playwright-report`, coverage

## Cách dùng
```bash
npm run release:export:safe
```

Tuỳ chọn output thư mục:
```bash
npm run release:export:safe -- /absolute/path/to/output
```

## Cơ chế
- Script: `scripts/release/export-safe-bundle.sh`
- Pattern exclude: `.releaseignore`
- Đầu ra: `release/erp-retail-safe-<timestamp>.tar.gz`

## Ghi chú bảo mật
- Script không xóa repo local và không đụng `.git` hiện tại.
- Chỉ tạo bản export sạch để phát hành/chia sẻ.
