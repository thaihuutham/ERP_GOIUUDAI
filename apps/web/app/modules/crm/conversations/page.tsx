export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';

export default function CrmConversationsPage() {
  redirect('/modules/zalo-automation/messages');
}
