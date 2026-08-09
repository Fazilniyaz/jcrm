import { MessagesSquare } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";

/*
 * Communication.
 *
 * Projects and Tasks used to live here as static views; they are now
 * store-backed CRUD modules in project-management.tsx and task-management.tsx.
 * What was left was a fake thread list and a fake transcript.
 *
 * There is no messaging endpoint on the API — no threads, no messages, no
 * delivery — so this is a placeholder rather than a chat window that silently
 * drops what you type into it.
 */

export function Communication() {
  return (
    <Card>
      <EmptyState
        icon={MessagesSquare}
        title="Messaging isn't connected yet"
        desc="Conversations with your team and clients will appear here once the messaging service is wired up."
      />
    </Card>
  );
}
