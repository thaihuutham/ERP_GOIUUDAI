# 1. Add Badge import
sed -i '' "s/import { useUserRole } from '.\/user-role-context';/import { useUserRole } from '.\/user-role-context';\nimport { Badge, statusToBadge } from '.\/ui';/" apps/web/components/crm-operations-board.tsx

# 2. Replace the renderCustomerCell status render
sed -i '' "s/<span className={statusClass(customer.status)}>{customer.status || '--'}<\/span>/<Badge variant={statusToBadge(customer.status)}>{customer.status || '--'}<\/Badge>/g" apps/web/components/crm-operations-board.tsx

# 3. Replace other status rendering
sed -i '' "s/<span className={statusClass(item.status)}>{item.status || '--'}<\/span>/<Badge variant={statusToBadge(item.status)}>{item.status || '--'}<\/Badge>/g" apps/web/components/crm-operations-board.tsx
