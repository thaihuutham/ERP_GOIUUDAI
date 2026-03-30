# ADR-001: Stateless Codex Structure

## Status
Accepted

## Context
Dự án cần tiếp tục được bởi bất kỳ AI session mới nào mà không dựa vào chat memory.

## Decision
Áp dụng cấu trúc chuẩn gồm `AGENTS.md`, `planning/`, `.agent/`, `docs/`, và quy trình handoff bắt buộc.

## Consequences
- Dễ bàn giao và khôi phục ngữ cảnh.
- Chi phí cập nhật docs tăng nhẹ nhưng giảm mạnh rủi ro lệch context.
