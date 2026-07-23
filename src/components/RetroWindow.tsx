import type { ReactNode } from 'react'

type RetroWindowProps = { title: string; children: ReactNode }

/** Beveled window frame + navy title bar (per ai-design/frontendstyle.jpg). */
export function RetroWindow({ title, children }: RetroWindowProps) {
  return (
    <div className="retro-window">
      <div className="titlebar">
        <span className="titlebar__icon" aria-hidden="true">
          🏃
        </span>
        <h1 className="titlebar__text">{title}</h1>
      </div>
      <div className="window-body">{children}</div>
    </div>
  )
}
