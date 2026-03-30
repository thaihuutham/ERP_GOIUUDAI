'use client';

import { getModuleDefinition } from '../lib/module-definitions';
import { canAccessModule } from '../lib/rbac';
import { ModuleWorkbench } from './module-workbench';
import { useUserRole } from './user-role-context';

export function ModuleScreen({ moduleKey }: { moduleKey: string }) {
  const { role } = useUserRole();
  if (!canAccessModule(role, moduleKey)) {
    return (
      <article className="module-workbench">
        <header className="module-header">
          <div>
            <h1>Truy cập bị giới hạn</h1>
            <p>Vai trò hiện tại không có quyền vào phân hệ `{moduleKey}`.</p>
          </div>
          <ul>
            <li>Vai trò hiện tại: {role}</li>
            <li>Đổi vai trò ở thanh công cụ để kiểm thử theo RBAC.</li>
          </ul>
        </header>
      </article>
    );
  }

  const module = getModuleDefinition(moduleKey);
  return <ModuleWorkbench module={module} />;
}
