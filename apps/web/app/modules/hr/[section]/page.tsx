export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { HrSectionScreen } from '../../../../components/hr-section-screen';
import { isHrSectionKey } from '../../../../lib/hr-sections';

export default async function HrSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isHrSectionKey(section)) {
    notFound();
  }

  return <HrSectionScreen sectionKey={section} />;
}
