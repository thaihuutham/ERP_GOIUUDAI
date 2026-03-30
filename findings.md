# Findings & Decisions

## Requirements
- Unzip and analyze unfinished project: `retail-erp-(digital-products-&-services).zip`
- Adjust into template structure: `ai-project-template.zip`
- Ensure stateless continuity: all necessary context in files, not chat memory
- Update technology design for current scale: 2M customers, 50 employees, mostly walk-in/no login customers
- Update deployment flow: MacBook -> GitHub -> auto VM deploy, no repetitive SSH
- Change structure, do not change project functionality

## Research Findings
- Source ERP zip contains Vite + React + TypeScript + Firebase config/rules.
- `src/App.tsx` is very large (87,828 bytes), indicating monolithic routing/UI logic.
- Template provides: `.agent/`, `planning/`, `docs/specs/`, `docs/decisions/`, `config/`, `src/`, `tests/`, `scripts/`, `.github/`.
- Legacy app has 13 major module pages + core flows in `App.tsx` (Dashboard/CRM/Sales/Approvals/Auth shell).
- Firestore rules include many collection policies; one suspicious rule references `isOwner(...)` without visible definition.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Keep original UI/business logic files and progressively reorganize paths | Preserve behavior while improving maintainability |
| Add architecture/deployment docs as canonical source of truth | Enables stateless handover for any new agent/session |
| Add GitHub Actions deploy to VM over webhook/runner script | Meets no-manual-SSH deployment requirement |
| Move Firebase config files into `config/` and keep runtime behavior | Clearer structure while preserving app logic |
| Store Firestore rules/index assets under `firestore/` | Centralize data-layer artifacts for ops and scaling |
| Add Docker + Nginx runtime for VM deploy | Standardized repeatable deployment target |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Template zip includes strange brace-expanded placeholder folders | Ignore malformed placeholder folders and use clean canonical structure |
| Initial rsync command failed due variable path expansion | Re-ran with explicit absolute path constants |

## Resources
- `/Users/mrtao/Downloads/retail-erp-(digital-products-&-services).zip`
- `/Volumes/MR_TAOTHAM/NEXTCLOUD/VIBE CODE/ai-project-template.zip`
- `/Volumes/MR_TAOTHAM/NEXTCLOUD/VIBE CODE/ai-project-template`
- `/Volumes/MR_TAOTHAM/NEXTCLOUD/VIBE CODE/ERP-retail/docs/architecture/SCALING_DESIGN.md`
- `/Volumes/MR_TAOTHAM/NEXTCLOUD/VIBE CODE/ERP-retail/docs/deployment/VM_AUTODEPLOY.md`
- `/Volumes/MR_TAOTHAM/NEXTCLOUD/VIBE CODE/ERP-retail/docs/references/MIGRATION_MAPPING.md`

## Visual/Browser Findings
- N/A (no browser/image inspection yet)
