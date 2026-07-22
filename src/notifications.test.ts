import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Exercise } from './types'
import { fireReminder, orderedActions, requestPermission } from './notifications'

afterEach(() => vi.unstubAllGlobals())

const exercise: Exercise = {
  id: 'ex1',
  name: 'Neck rolls',
  instructions: 'Roll slowly.',
  target: { kind: 'reps', reps: 10 },
  image: 'data:image/png;base64,AAAA',
  tags: [],
  custom: false,
  updatedAt: 0,
}

describe('orderedActions', () => {
  it('truncates to the first N in priority order', () => {
    expect(orderedActions(2)).toEqual(['done', 'snooze'])
  })

  it('returns [] for zero or negative slots', () => {
    expect(orderedActions(0)).toEqual([])
    expect(orderedActions(-3)).toEqual([])
  })

  it('caps at four even when more slots are offered', () => {
    expect(orderedActions(10)).toEqual(['done', 'snooze', 'skip', 'shuffle'])
  })
})

describe('requestPermission', () => {
  it("returns 'denied' when Notification is absent", async () => {
    vi.stubGlobal('Notification', undefined)
    await expect(requestPermission()).resolves.toBe('denied')
  })

  it('prompts only when permission is still default', async () => {
    const requestPermissionSpy = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: requestPermissionSpy })
    await expect(requestPermission()).resolves.toBe('granted')
    expect(requestPermissionSpy).toHaveBeenCalledOnce()
  })
})

describe('fireReminder', () => {
  it('uses the rich service-worker notification with ordered actions and data', async () => {
    class FakeNotification {
      static permission: NotificationPermission = 'granted'
      static maxActions = 2
    }
    vi.stubGlobal('Notification', FakeNotification)
    const showNotification = vi.fn().mockResolvedValue(undefined)
    const reg = { showNotification } as unknown as ServiceWorkerRegistration

    await fireReminder(reg, exercise, 'occ1')

    expect(showNotification).toHaveBeenCalledTimes(1)
    const [title, options] = showNotification.mock.calls[0]
    expect(title).toBe('Neck rolls')
    expect(options.body).toContain('10 reps')
    expect(options.data).toEqual({ occurrenceId: 'occ1', exerciseId: 'ex1' })
    expect(options.actions).toEqual([
      { action: 'done', title: 'Done' },
      { action: 'snooze', title: 'Snooze' },
    ])
  })

  it('falls back to a plain Notification when there are no action slots', async () => {
    const fired: { title: string; options?: NotificationOptions }[] = []
    class FakeNotification {
      static permission: NotificationPermission = 'granted'
      constructor(title: string, options?: NotificationOptions) {
        fired.push({ title, options })
      }
    }
    vi.stubGlobal('Notification', FakeNotification)

    await fireReminder(null, exercise, 'occ1')

    expect(fired).toHaveLength(1)
    expect(fired[0].title).toBe('Neck rolls')
    expect(fired[0].options?.body).toContain('10 reps')
  })

  it('does nothing when Notification is unavailable', async () => {
    vi.stubGlobal('Notification', undefined)
    await expect(fireReminder(null, exercise, 'occ1')).resolves.toBeUndefined()
  })
})
