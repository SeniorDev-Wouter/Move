export type TagAxis = 'equipment' | 'context' | 'type' | 'intensity' | 'duration' | 'other'

export type TagDef = { name: string; axis: TagAxis; updatedAt: number }

export type ExerciseTarget = { kind: 'reps'; reps: number } | { kind: 'time'; seconds: number }

export type Exercise = {
  id: string
  name: string
  instructions: string
  target: ExerciseTarget
  image: string
  tags: string[]
  custom: boolean
  deleted?: boolean
  updatedAt: number
}

export type Loadout = {
  id: string
  name: string
  include: string[]
  requireAll: string[]
  exclude: string[]
  updatedAt: number
}

export type ReminderAction = 'done' | 'skip' | 'snooze' | 'shuffle'

export type HistoryEntry = {
  id: string
  occurrenceId: string
  exerciseId: string
  action: ReminderAction
  at: number
}

export type Rollup = {
  done: number
  ignored: number
  doneDayKeys: string[]
  trimmedThroughAt: number
}

export type Settings = {
  intervalMinutes: number
  snoozeMinutes: number
  activeContext: string
  ownedEquipment: string[]
  activeLoadoutId: string
  updatedAt: number
}

export type MoveState = {
  settings: Settings
  exercises: Exercise[]
  loadouts: Loadout[]
  history: HistoryEntry[]
  rollup: Rollup
  tags: TagDef[]
}

export type LoadoutBundle = {
  version: 1
  loadout: Loadout
  exercises: Exercise[]
  tags: TagDef[]
}

export type ImportResult = {
  state: MoveState
  warnings: { name: string; localAxis: TagAxis; bundleAxis: TagAxis }[]
}
