export const dynamic = 'force-dynamic';

import { AssistantAccessBoard } from '../../../../components/assistant/assistant-access-board';
import { AssistantShell } from '../../../../components/assistant/assistant-shell';

export default function AssistantAccessPage() {
  return (
    <AssistantShell>
      <AssistantAccessBoard />
    </AssistantShell>
  );
}
