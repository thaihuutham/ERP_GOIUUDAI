export const dynamic = 'force-dynamic';

import { ZaloAutomationCampaignsWorkbench } from '../../../../../components/zalo-automation-campaigns-workbench';

type CampaignDetailPageProps = {
  params: Promise<{
    campaignId: string;
  }>;
};

export default async function ZaloAutomationCampaignDetailPage(props: CampaignDetailPageProps) {
  const { campaignId } = await props.params;
  return <ZaloAutomationCampaignsWorkbench campaignId={campaignId} />;
}
