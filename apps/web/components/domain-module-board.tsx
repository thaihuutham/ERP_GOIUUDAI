'use client';

import { getModuleDefinition } from '../lib/module-definitions';
import { decideModuleAccess } from '../lib/access-policy';
import { useAccessPolicy } from './access-policy-context';
import { ModuleAccessBlocked } from './module-access-blocked';
import { ModuleWorkbench } from './module-workbench';

export function DomainModuleBoard({ moduleKey }: { moduleKey: string }) {
  const { snapshot } = useAccessPolicy();
  const module = getModuleDefinition(moduleKey);
  const moduleDecision = decideModuleAccess(snapshot, moduleKey);

  if (!moduleDecision.allowed) {
    return <ModuleAccessBlocked moduleTitle={module.title} reason={moduleDecision.reason} />;
  }

  return <ModuleWorkbench module={module} />;
}
