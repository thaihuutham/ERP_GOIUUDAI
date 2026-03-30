# Task Plan: Migrate Retail ERP to Stateless Codex Template

## Goal
Restructure the unfinished Retail ERP project into the AI stateless template, keep existing functional behavior, and deliver updated architecture/deployment design docs for current company scale and workflow.

## Current Phase
Completed

## Phases
### Phase 1: Requirements & Discovery
- [x] Locate source zip and template zip
- [x] Inspect project and template structures
- [x] Record key constraints and assumptions
- **Status:** complete

### Phase 2: Target Architecture & Mapping
- [x] Define target folder structure based on template
- [x] Map old files to new locations without function changes
- [x] Define technology and scale adjustments for 2M customers / 50 staff / mostly guest customers
- [x] Define deployment workflow: MacBook -> GitHub -> Auto VM (no SSH each deploy)
- **Status:** complete

### Phase 3: Implementation (Restructure + Content)
- [x] Extract ERP source into workspace
- [x] Create final folder structure
- [x] Move/refactor files into new structure
- [x] Add official docs: architecture, operations, deployment, runbooks
- [x] Add CI/CD automation files for VM auto-deploy
- **Status:** complete

### Phase 4: Verification
- [x] Install dependencies
- [x] Run build/typecheck/lint if available
- [x] Verify key paths and docs exist
- [x] Record test results
- **Status:** complete

### Phase 5: Delivery
- [x] Summarize changes and assumptions
- [x] Provide key file references
- [x] Suggest next rollout steps
- **Status:** complete

## Key Questions
1. Which parts are strict "do not change behavior" versus "may improve internal implementation"?
2. Is VM deploy target using Docker Compose or direct Node runtime?
3. Should Firebase remain backend of record in current stage?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use template-first project root with docs + .agent memory files | Matches stateless agent requirement across sessions/models |
| Keep app stack React+Vite+Firebase for now | Request says do not change project function |
| Deploy through GitHub Actions self-hosted runner on VM | Satisfies no-manual-SSH deployment requirement |
| Keep source module behavior unchanged and focus on structure/docs | User explicitly requested no functional change |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| rsync path used incorrect variable expansion (`$ROOT/_imports/...`) | 1 | Re-ran copy with absolute paths and completed migration |
