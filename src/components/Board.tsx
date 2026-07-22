import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { COLUMNS } from '../board'
import { useBoard } from '../hooks/useBoard'
import { Column } from './Column'

export function Board() {
  const { board, addTask, removeTask, changePriority, moveCardOver, dropCard } = useBoard()

  const sensors = useSensors(
    // A small distance so clicks on the card's buttons still register.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    moveCardOver(String(active.id), String(over.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    dropCard(String(active.id), String(over.id))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="board">
        {COLUMNS.map((column) => (
          <Column
            key={column.id}
            id={column.id}
            title={column.title}
            tasks={board[column.id]}
            onAdd={(title) => addTask(column.id, title)}
            onDelete={removeTask}
            onCyclePriority={changePriority}
          />
        ))}
      </div>
    </DndContext>
  )
}
