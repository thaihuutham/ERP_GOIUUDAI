'use client';

import { getModuleDefinition } from '../lib/module-definitions';
import { useAccessPolicy } from './access-policy-context';
import { ModuleWorkbench } from './module-workbench';

export function ModuleScreen({ moduleKey }: { moduleKey: string }) {
  const { canModule } = useAccessPolicy();
  if (!canModule(moduleKey)) {
    return null;
  }

  const module = getModuleDefinition(moduleKey);
  return <ModuleWorkbench module={module} />;
}
