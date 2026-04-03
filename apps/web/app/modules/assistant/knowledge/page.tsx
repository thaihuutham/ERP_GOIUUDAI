import { AssistantKnowledgeBoard } from '../../../../components/assistant/assistant-knowledge-board';
import { AssistantShell } from '../../../../components/assistant/assistant-shell';

export default function AssistantKnowledgePage() {
  return (
    <AssistantShell>
      <AssistantKnowledgeBoard />
    </AssistantShell>
  );
}
