import { Board } from './components/Board'

function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">TaskFlow</h1>
        <p className="app__subtitle">A tiny Kanban board to practise with Claude Code.</p>
      </header>
      <Board />
    </div>
  )
}

export default App
