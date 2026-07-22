import { type FormEvent, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { ColumnId, Task } from '../types'
import { TaskCard } from './TaskCard'

type ColumnProps = {
  id: ColumnId
  title: string
  tasks: Task[]
  onAdd: (title: string) => void
  onDelete: (taskId: string) => void
  onCyclePriority: (taskId: string) => void
}

export function Column({ id, title, tasks, onAdd, onDelete, onCyclePriority }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const [draft, setDraft] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onAdd(draft)
    setDraft('')
  }

  return (
    <section className={`column ${isOver ? 'column--over' : ''}`}>
      <header className="column__header">
        <h2 className="column__title">{title}</h2>
        <span className="column__count">{tasks.length}</span>
      </header>

      <SortableContext
        items={tasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div ref={setNodeRef} className="column__list">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onDelete={() => onDelete(task.id)}
              onCyclePriority={() => onCyclePriority(task.id)}
            />
          ))}
          {tasks.length === 0 && <p className="column__empty">Drop tasks here</p>}
        </div>
      </SortableContext>

      <form className="column__add" onSubmit={handleSubmit}>
        <input
          className="column__add-input"
          type="text"
          placeholder="+ Add a task"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={`Add a task to ${title}`}
        />
      </form>
    </section>
  )
}
