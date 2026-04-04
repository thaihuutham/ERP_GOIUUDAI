import { SettingsPositionDetailPage } from '../../../../../components/settings-position-detail-page';

export default async function SettingsPositionPage({
  params
}: {
  params: Promise<{ positionId: string }>;
}) {
  const { positionId } = await params;
  return <SettingsPositionDetailPage positionId={positionId} />;
}
