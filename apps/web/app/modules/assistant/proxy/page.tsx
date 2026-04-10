export const dynamic = 'force-dynamic';

import { AssistantProxyBoard } from '../../../../components/assistant/assistant-proxy-board';
import { AssistantShell } from '../../../../components/assistant/assistant-shell';

export default function AssistantProxyPage() {
  return (
    <AssistantShell>
      <AssistantProxyBoard />
    </AssistantShell>
  );
}
