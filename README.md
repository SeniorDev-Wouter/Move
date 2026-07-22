# TaskFlow

A tiny **Kanban board** — your playground for the *AI Agentic Coding* workshop.
Add tasks to a column and **drag** them between **To Do**, **In Progress** and **Done**.

Built with **React + TypeScript + Vite**, with drag-and-drop powered by
[`@dnd-kit`](https://dndkit.com/). No backend — the board is saved in your browser's
`localStorage`.

## Getting started

**Requirements:** [Node.js](https://nodejs.org) **20.19+ or 22.12+** — the latest LTS
(22) or current (24) is perfect. npm ships with Node, and there's no database or other
global tooling to install.

Don't have Node yet? Grab the installer from [nodejs.org](https://nodejs.org) (covers
macOS / Windows / Linux), or use a version manager such as `nvm` (`nvm install --lts`)
or Homebrew (`brew install node`). Check it with `node -v`.

```bash
npm install      # once, to grab dependencies
npm run dev      # start the dev server → open the printed http://localhost:5173 URL
```

Other useful commands:

```bash
npm run build    # type-check + production build
npm test         # run the test suite (Vitest)
npm run lint     # run the linter (oxlint)
```

## What you can do

- **Add a task** — type in the "+ Add a task" box at the bottom of any column.
- **Drag a card** — move it within a column or across columns (mouse, touch or keyboard).
- **Change priority** — click the priority pill on a card to cycle low → medium → high.
- **Delete a task** — the × on a card.

Everything persists, so a page reload keeps your board.

## Project structure

```
src/
  main.tsx               # React entry point (mounts <App/>)
  App.tsx                # header + the board
  types.ts               # Task / Priority / ColumnId / Board types
  board.ts               # the columns + pure board logic (move, reorder, priority)
  storage.ts             # load & save the board in localStorage
  hooks/
    useBoard.ts          # board state + the drag handlers
  components/
    Board.tsx            # DndContext + sensors + the columns
    Column.tsx           # one droppable column + its "add a task" form
    TaskCard.tsx         # a single draggable / sortable card
  index.css              # all styling
  App.test.tsx           # component tests
  board.test.ts          # unit tests for the board logic
```
