import { useEffect, useRef } from 'react'
import { getSessionSkillSteps, useQuery } from 'wasp/client/operations'

/** At most this often, the used skills' lines are asked again for a skill step hq has not named yet. */
const SKILLS_AGAIN_MS = 5_000

/**
 * How a used skill reads in a session's work lines (skills spec part 5 *Seeing it used*): hq names each skill the
 * viewer may see, per run. A step it hasn't named yet, a live run's say, asks again once and shows the staged name
 * meanwhile; a skill the viewer may not see is never named, so it is asked about once only.
 */
export function useSessionSkillLines(sessionId: string): (name: string, runId: string | null) => string | null {
  const { data: skills, refetch } = useQuery(getSessionSkillSteps, { sessionId }, { enabled: !!sessionId })
  const missed = useRef(false)
  const asked = useRef(0)
  const askedAbout = useRef(new Set<string>())
  useEffect(() => {
    if (!missed.current) return
    missed.current = false
    const wait = Math.max(0, asked.current + SKILLS_AGAIN_MS - Date.now())
    const timer = setTimeout(() => { asked.current = Date.now(); void refetch() }, wait)
    return () => clearTimeout(timer)
  })
  return (name, runId) => {
    const run = runId ?? skills?.latestRunId ?? null
    const label = run ? skills?.runs[run]?.[name] ?? null : null
    const key = `${run ?? ''}\n${name}`
    if (label === null && skills && !askedAbout.current.has(key)) {
      askedAbout.current.add(key)
      missed.current = true
    }
    return label
  }
}
