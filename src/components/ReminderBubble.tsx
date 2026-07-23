import type { Exercise, ReminderAction } from '../types'
import { formatTarget } from '../catalog'

type ReminderBubbleProps = {
  exercise: Exercise
  onAction: (action: ReminderAction) => void
}

const ACTIONS: ReminderAction[] = ['done', 'skip', 'snooze', 'shuffle']
const LABELS: Record<ReminderAction, string> = {
  done: 'Done',
  skip: 'Skip',
  snooze: 'Snooze',
  shuffle: 'Shuffle',
}

/** The yellow retro speech balloon: image, name, target, instructions, actions. */
export function ReminderBubble({ exercise, onAction }: ReminderBubbleProps) {
  return (
    <div className="balloon" role="status" aria-label="Current reminder">
      <img className="balloon__image" src={exercise.image} alt="" />
      <p className="balloon__name">{exercise.name}</p>
      <p>
        <span className="balloon__target">{formatTarget(exercise.target)}</span> —{' '}
        {exercise.instructions}
      </p>
      <div className="balloon__actions">
        {ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            className="btn"
            onClick={() => onAction(action)}
          >
            {LABELS[action]}
          </button>
        ))}
      </div>
    </div>
  )
}
