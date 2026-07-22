import type { Exercise, ReminderAction } from './types'
import { formatTarget } from './catalog'

/** Priority order for reminder actions; the first N (N = usable slots) are shown. */
const ACTION_PRIORITY: readonly ReminderAction[] = ['done', 'snooze', 'skip', 'shuffle'] as const

const ACTION_LABELS: Record<ReminderAction, string> = {
  done: 'Done',
  snooze: 'Snooze',
  skip: 'Skip',
  shuffle: 'Shuffle',
}

/** Notification actions/image live on the extended (SW) options, absent from lib.dom's base type. */
type NotificationAction = { action: string; title: string; icon?: string }
type RichNotificationOptions = NotificationOptions & {
  image?: string
  actions?: NotificationAction[]
}

/**
 * Ask for notification permission. Returns 'denied' when the API is absent
 * (jsdom, non-secure contexts) or the request throws; otherwise the granted
 * permission. Only prompts when the current permission is still 'default'.
 */
export async function requestPermission(): Promise<NotificationPermission | 'denied'> {
  if (typeof Notification === 'undefined') return 'denied'
  try {
    if (Notification.permission === 'default') return await Notification.requestPermission()
    return Notification.permission
  } catch {
    return 'denied'
  }
}

/** How many inline actions the platform allows (0 when unsupported → fallback path). */
export function maxInlineActions(): number {
  if (typeof Notification === 'undefined') return 0
  const ctor = Notification as { maxActions?: number }
  return typeof ctor.maxActions === 'number' ? ctor.maxActions : 0
}

/** The first `min(4, max)` actions in priority order; `[]` for max <= 0. */
export function orderedActions(max: number): ReminderAction[] {
  const count = Math.max(0, Math.min(4, max))
  return ACTION_PRIORITY.slice(0, count)
}

/**
 * Fire an exercise reminder. Uses the rich service-worker notification (with
 * inline actions and imagery) when a registration and action slots are
 * available; otherwise falls back to a plain Notification when permission is
 * granted. Feature-detected and wrapped so it never throws.
 */
export async function fireReminder(
  reg: ServiceWorkerRegistration | null,
  exercise: Exercise,
  occurrenceId: string,
): Promise<void> {
  if (typeof Notification === 'undefined') return
  const body = `${formatTarget(exercise.target)} — ${exercise.instructions}`
  const max = maxInlineActions()
  try {
    if (reg && max > 0) {
      const options: RichNotificationOptions = {
        body,
        icon: exercise.image,
        image: exercise.image,
        actions: orderedActions(max).map((a) => ({ action: a, title: ACTION_LABELS[a] })),
        data: { occurrenceId, exerciseId: exercise.id },
      }
      await reg.showNotification(exercise.name, options)
      return
    }
    if (Notification.permission === 'granted') {
      new Notification(exercise.name, { body })
    }
  } catch {
    // Never let a reminder crash the caller.
  }
}
