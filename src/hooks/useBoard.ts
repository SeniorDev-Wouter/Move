import { useEffect, useState } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import type { Board, ColumnId } from '../types'
import { createTask, cyclePriority, findColumn, moveBetween } from '../board'
import { loadBoard, saveBoard } from '../storage'

/**
 * Owns the board state and every operation on it (add / remove / change
 * priority) plus the two drag handlers the DndContext needs.
 */
export function useBoard() {
  const [board, setBoard] = useState<Board>(() => loadBoard())

  useEffect(() => {
    saveBoard(board)
  }, [board])

  function addTask(columnId: ColumnId, title: string) {
    if (!title.trim()) return
    const task = createTask(title)
    setBoard((prev) => ({ ...prev, [columnId]: [...prev[columnId], task] }))
  }

  function removeTask(taskId: string) {
    setBoard((prev) => {
      const from = findColumn(prev, taskId)
      if (!from) return prev
      return { ...prev, [from]: prev[from].filter((task) => task.id !== taskId) }
    })
  }

  function changePriority(taskId: string) {
    setBoard((prev) => cyclePriority(prev, taskId))
  }

  // While dragging across columns: move the card into the column under the
  // pointer so it shows up there live. No-op while staying in one column.
  function moveCardOver(activeId: string, overId: string) {
    setBoard((prev) => {
      const from = findColumn(prev, activeId)
      const to = findColumn(prev, overId)
      if (!from || !to || from === to) return prev
      return moveBetween(prev, activeId, overId, from, to)
    })
  }

  // On drop: commit the final order within the (now current) column.
  function dropCard(activeId: string, overId: string) {
    setBoard((prev) => {
      const from = findColumn(prev, activeId)
      const to = findColumn(prev, overId)
      if (!from || !to) return prev

      if (from === to) {
        const items = prev[from]
        const oldIndex = items.findIndex((task) => task.id === activeId)
        const newIndex = items.findIndex((task) => task.id === overId)
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev
        return { ...prev, [from]: arrayMove(items, oldIndex, newIndex) }
      }

      return moveBetween(prev, activeId, overId, from, to)
    })
  }

  return { board, addTask, removeTask, changePriority, moveCardOver, dropCard }
}
