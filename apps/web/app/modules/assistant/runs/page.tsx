import { AssistantRunsBoard } from '../../../../components/assistant/assistant-runs-board';
import { AssistantShell } from '../../../../components/assistant/assistant-shell';

export default function AssistantRunsPage() {
  return (
    <AssistantShell>
      <AssistantRunsBoard />
    </AssistantShell>
  );
}
