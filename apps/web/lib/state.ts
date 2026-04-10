/**
 * Centralized state management barrel export.
 * Import from here instead of individual files to ensure consistent patterns.
 *
 * Contexts (global, provided once in layout.tsx):
 *   - UserRoleProvider / useUserRole — auth, roles, login/logout
 *   - AccessPolicyProvider / useAccessPolicy — permissions, module access
 *   - ToastProvider / useToast — global notifications
 *
 * Hooks (per-component, instantiate where needed):
 *   - useAsyncOperation — wraps loading/error/result for any async op
 *   - useModuleData — shared data fetching with search/filter/sort/paginate
 *   - useCursorTableState — cursor-based pagination state machine
 *   - useSmartPolling — adaptive polling for real-time data
 */

// Context hooks (require respective Provider in tree)
export { useUserRole } from '../components/user-role-context';
export { useAccessPolicy } from '../components/access-policy-context';
export { useToast } from '../components/toast-context';

// Standalone hooks
export { useAsyncOperation, type AsyncOperationState } from './use-async-operation';
export { useModuleData, type UseModuleDataOptions, type UseModuleDataReturn } from './use-module-data';
export { useCursorTableState } from './use-cursor-table-state';
export { useSmartPolling } from './use-smart-polling';
