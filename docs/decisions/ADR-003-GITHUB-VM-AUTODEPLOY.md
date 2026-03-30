# ADR-003: GitHub -> VM Auto Deploy

## Status
Accepted

## Context
Yêu cầu deploy không SSH thủ công mỗi lần.

## Decision
Sử dụng GitHub Actions + self-hosted runner trên VM (`vm-prod`) để deploy tự động khi push `main`.

## Consequences
- Deploy nhất quán và audit được qua GitHub.
- Cần bảo trì runner và secrets trên VM/GitHub.
