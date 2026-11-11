import { useEffect, useState } from 'react'
import { clearWelcome, peekWelcome } from '../../auth/pages/parts/welcomeLine'

/** The one-time welcome for someone who has just joined through an invitation, in the project it landed them in. */
export function WelcomeLine() {
  const [name] = useState(peekWelcome)
  useEffect(() => { if (name) clearWelcome() }, [name])
  if (!name) return null
  return (
    <div className="mx-auto mt-6 max-w-[720px] px-4" data-testid="welcome-line">
      <div className="text-h3 font-medium text-text-primary">Welcome, {name.trim().split(/\s+/)[0]}</div>
      <p className="text-body text-text-secondary">Start a conversation with one of this project's agents, or look around its tools.</p>
    </div>
  )
}
