import type { ModuleDefinition } from './module-ui';
import { crmModule } from './module-definitions/crm';
import { catalogModule } from './module-definitions/catalog';
import { salesModule } from './module-definitions/sales';
import { hrModule } from './module-definitions/hr';
import { financeModule } from './module-definitions/finance';
import { scmModule } from './module-definitions/scm';
import { assetsModule } from './module-definitions/assets';
import { projectsModule } from './module-definitions/projects';
import { workflowsModule } from './module-definitions/workflows';
import { reportsModule } from './module-definitions/reports';
import { settingsModule } from './module-definitions/settings';
import { notificationsModule } from './module-definitions/notifications';

export function getModuleDefinition(key: string): ModuleDefinition | undefined {
  return moduleDefinitions[key];
}

export const moduleDefinitions: Record<string, ModuleDefinition> = {
  crm: crmModule,
  catalog: catalogModule,
  sales: salesModule,
  hr: hrModule,
  finance: financeModule,
  scm: scmModule,
  assets: assetsModule,
  projects: projectsModule,
  workflows: workflowsModule,
  reports: reportsModule,
  settings: settingsModule,
  notifications: notificationsModule
};
