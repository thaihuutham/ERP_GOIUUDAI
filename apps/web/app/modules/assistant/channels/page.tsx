import { AssistantChannelsBoard } from '../../../../components/assistant/assistant-channels-board';
import { AssistantShell } from '../../../../components/assistant/assistant-shell';

export default function AssistantChannelsPage() {
  return (
    <AssistantShell>
      <AssistantChannelsBoard />
    </AssistantShell>
  );
}
