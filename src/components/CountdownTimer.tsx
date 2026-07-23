import { useEffect, useState } from 'react'
import type { CurrentReminder } from '../hooks/useReminderEngine'

type CountdownTimerProps = {
  nextFireAt: number | null
  running: boolean
  current: CurrentReminder | null
}

function format(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function CountdownTimer({ nextFireAt, running, current }: CountdownTimerProps) {
  const live = !current && nextFireAt != null
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!live) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [live, nextFireAt])

  let text: string
  if (current != null) text = 'Respond to the reminder'
  else if (nextFireAt != null) text = format(nextFireAt - now)
  else if (running) text = 'Waiting for schedule…'
  else text = 'Paused / press Start'

  return (
    <div className="countdown" role="status" aria-label="Next reminder">
      {text}
    </div>
  )
}
