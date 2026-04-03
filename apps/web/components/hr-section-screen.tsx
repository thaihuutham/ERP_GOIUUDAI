'use client';

import { getModuleDefinition } from '../lib/module-definitions';
import { canAccessModule } from '../lib/rbac';
import type { ModuleDefinition } from '../lib/module-ui';
import { HR_SECTION_MAP, type HrSectionKey } from '../lib/hr-sections';
import { HrAttendanceBoard } from './hr-attendance-board';
import { HrGoalsTrackingBoard } from './hr-goals-tracking-board';
import { HrRegulationBoard } from './hr-regulation-board';
import { HrRecruitmentPipelineBoard } from './hr-recruitment-pipeline-board';
import { ModuleWorkbench } from './module-workbench';
import { useUserRole } from './user-role-context';

export function HrSectionScreen({ sectionKey }: { sectionKey: HrSectionKey }) {
  const { role } = useUserRole();

  if (!canAccessModule(role, 'hr')) {
    return (
      <article className="module-workbench">
        <header className="module-header">
          <div>
            <h1>Truy cập bị giới hạn</h1>
            <p>Vai trò hiện tại không có quyền vào phân hệ nhân sự.</p>
          </div>
          <ul>
            <li>Vai trò hiện tại: {role}</li>
            <li>Đổi vai trò ở thanh công cụ để kiểm thử RBAC.</li>
          </ul>
        </header>
      </article>
    );
  }

  const section = HR_SECTION_MAP[sectionKey];
  if (sectionKey === 'recruitment') {
    return <HrRecruitmentPipelineBoard />;
  }
  if (sectionKey === 'goals') {
    return <HrGoalsTrackingBoard />;
  }
  if (sectionKey === 'attendance') {
    return <HrAttendanceBoard />;
  }
  if (sectionKey === 'regulation') {
    return <HrRegulationBoard />;
  }

  const hrModule = getModuleDefinition('hr');
  const sectionFeatures = section.featureKeys
    .map((featureKey) => hrModule.features.find((feature) => feature.key === featureKey))
    .filter((feature): feature is NonNullable<typeof feature> => Boolean(feature));

  if (!sectionFeatures.length) {
    return (
      <article className="module-workbench">
        <header className="module-header">
          <div>
            <h1>{section.title}</h1>
            <p>Chưa cấu hình feature cho trang con này.</p>
          </div>
        </header>
      </article>
    );
  }

  const sectionModule: ModuleDefinition = {
    key: 'hr',
    title: section.title,
    summary: section.description,
    highlights: section.highlights,
    features: sectionFeatures
  };

  return <ModuleWorkbench module={sectionModule} />;
}
