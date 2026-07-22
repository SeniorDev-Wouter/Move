import type { Board, ColumnId, Priority, Task } from './types'

export const COLUMNS: { id: ColumnId; title: string }[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'doing', title: 'In Progress' },
  { id: 'done', title: 'Done' },
]

export const COLUMN_IDS: ColumnId[] = COLUMNS.map((column) => column.id)

export const PRIORITIES: Priority[] = ['low', 'medium', 'high']

export function createEmptyBoard(): Board {
  return { todo: [], doing: [], done: [] }
}

export function createTask(title: string, priority: Priority = 'medium'): Task {
  return { id: crypto.randomUUID(), title: title.trim(), priority }
}

/**
 * Which column holds the given id. dnd-kit hands us either a task id (when
 * hovering a card) or a column id (when hovering an empty column), so we
 * accept both.
 */
export function findColumn(board: Board, id: string): ColumnId | undefined {
  if (COLUMN_IDS.includes(id as ColumnId)) return id as ColumnId
  return COLUMN_IDS.find((columnId) => board[columnId].some((task) => task.id === id))
}

/**
 * Move a task from one column to another, inserting it just before the card it
 * was dropped on (or at the end when dropped on the column itself). Pure.
 */
export function moveBetween(
  board: Board,
  activeId: string,
  overId: string,
  from: ColumnId,
  to: ColumnId,
): Board {
  const moved = board[from].find((task) => task.id === activeId)
  if (!moved) return board

  const toItems = board[to]
  let overIndex = toItems.findIndex((task) => task.id === overId)
  if (overIndex === -1) overIndex = toItems.length

  return {
    ...board,
    [from]: board[from].filter((task) => task.id !== activeId),
    [to]: [...toItems.slice(0, overIndex), moved, ...toItems.slice(overIndex)],
  }
}

/** Cycle a task's priority low -> medium -> high -> low. Pure. */
export function cyclePriority(board: Board, taskId: string): Board {
  const next = createEmptyBoard()
  for (const columnId of COLUMN_IDS) {
    next[columnId] = board[columnId].map((task) => {
      if (task.id !== taskId) return task
      const nextIndex = (PRIORITIES.indexOf(task.priority) + 1) % PRIORITIES.length
      return { ...task, priority: PRIORITIES[nextIndex] }
    })
  }
  return next
}
