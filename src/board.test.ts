import { describe, expect, it } from 'vitest'
import { createTask, cyclePriority, findColumn, moveBetween } from './board'
import type { Board } from './types'

function sampleBoard(): Board {
  return {
    todo: [
      { id: 'a', title: 'A', priority: 'low' },
      { id: 'b', title: 'B', priority: 'medium' },
    ],
    doing: [{ id: 'c', title: 'C', priority: 'high' }],
    done: [],
  }
}

describe('findColumn', () => {
  it('finds the column that holds a task', () => {
    expect(findColumn(sampleBoard(), 'b')).toBe('todo')
    expect(findColumn(sampleBoard(), 'c')).toBe('doing')
  })

  it('treats a column id as itself (an empty-column drop target)', () => {
    expect(findColumn(sampleBoard(), 'done')).toBe('done')
  })

  it('returns undefined for an unknown id', () => {
    expect(findColumn(sampleBoard(), 'nope')).toBeUndefined()
  })
})

describe('moveBetween', () => {
  it('moves a task before the card it is dropped on', () => {
    const next = moveBetween(sampleBoard(), 'a', 'c', 'todo', 'doing')
    expect(next.todo.map((task) => task.id)).toEqual(['b'])
    expect(next.doing.map((task) => task.id)).toEqual(['a', 'c'])
  })

  it('appends when dropped on an empty column', () => {
    const next = moveBetween(sampleBoard(), 'a', 'done', 'todo', 'done')
    expect(next.todo.map((task) => task.id)).toEqual(['b'])
    expect(next.done.map((task) => task.id)).toEqual(['a'])
  })
})

describe('cyclePriority', () => {
  it('cycles low -> medium -> high -> low', () => {
    let board = sampleBoard()
    board = cyclePriority(board, 'a')
    expect(board.todo[0].priority).toBe('medium')
    board = cyclePriority(board, 'a')
    expect(board.todo[0].priority).toBe('high')
    board = cyclePriority(board, 'a')
    expect(board.todo[0].priority).toBe('low')
  })
})

describe('createTask', () => {
  it('trims the title and defaults to medium priority', () => {
    const task = createTask('  Hello  ')
    expect(task.title).toBe('Hello')
    expect(task.priority).toBe('medium')
    expect(task.id.length).toBeGreaterThan(0)
  })
})
