export type Priority = 'low' | 'medium' | 'high'

export type ColumnId = 'todo' | 'doing' | 'done'

export type Task = {
  id: string
  title: string
  priority: Priority
}

/** The whole board: each column id maps to its ordered list of tasks. */
export type Board = Record<ColumnId, Task[]>
