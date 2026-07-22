import type { CSSProperties } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '../types'

type TaskCardProps = {
  task: Task
  onDelete: () => void
  onCyclePriority: () => void
}

export function TaskCard({ task, onDelete, onCyclePriority }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`card card--${task.priority}`}
      {...attributes}
      {...listeners}
    >
      <p className="card__title">{task.title}</p>
      <div className="card__footer">
        <button
          type="button"
          className={`card__priority card__priority--${task.priority}`}
          onClick={onCyclePriority}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          aria-label={`Priority: ${task.priority}. Activate to change.`}
          title="Click to change priority"
        >
          {task.priority}
        </button>
        <button
          type="button"
          className="card__delete"
          onClick={onDelete}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          aria-label={`Delete "${task.title}"`}
        >
          ×
        </button>
      </div>
    </article>
  )
}
