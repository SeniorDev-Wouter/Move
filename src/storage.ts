import type { Board, Priority, Task } from './types'
import { COLUMN_IDS, PRIORITIES, createEmptyBoard } from './board'

const STORAGE_KEY = 'taskflow.board'

/** Guard so corrupt or outdated stored entries can't poison the board. */
function isTask(value: unknown): value is Task {
  if (!value || typeof value !== 'object') return false
  const task = value as Partial<Task>
  return (
    typeof task.id === 'string' &&
    typeof task.title === 'string' &&
    PRIORITIES.includes(task.priority as Priority)
  )
}

/** Read the saved board from localStorage, tolerating missing or partial data. */
export function loadBoard(): Board {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createEmptyBoard()

    const parsed = JSON.parse(raw) as Partial<Board>
    const board = createEmptyBoard()
    for (const columnId of COLUMN_IDS) {
      const column = parsed[columnId]
      if (Array.isArray(column)) board[columnId] = column.filter(isTask)
    }
    return board
  } catch {
    return createEmptyBoard()
  }
}

/** Persist the board so it survives a page reload. */
export function saveBoard(board: Board): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(board))
}
