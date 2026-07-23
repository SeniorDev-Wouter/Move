import type { ReminderAction } from '../types'
import type { ActionPayload, CurrentReminder } from '../hooks/useReminderEngine'
import { ReminderBubble } from './ReminderBubble'

type AssistantProps = {
  current: CurrentReminder | null
  notice: string | null
  onAction: (payload: ActionPayload) => void
}

/**
 * The Clippy-style character that always hosts the in-app reminder. Shows the
 * ReminderBubble when `current` is set, the empty-pool notice when the assistant
 * has one, and an idle greeting otherwise.
 */
export function Assistant({ current, notice, onAction }: AssistantProps) {
  const handle = (action: ReminderAction): void => {
    if (!current) return
    onAction({ action, occurrenceId: current.occurrenceId, exerciseId: current.exercise.id })
  }

  return (
    <div className="assistant">
      <span className="assistant__character" aria-hidden="true">
        📎
      </span>
      {current ? (
        <ReminderBubble exercise={current.exercise} onAction={handle} />
      ) : (
        <div className="balloon" role="status" aria-label="Assistant">
          <p>{notice ?? "It looks like you're working hard. Press Start when you're ready to move!"}</p>
        </div>
      )}
    </div>
  )
}
