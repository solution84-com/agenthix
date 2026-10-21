import { useState, useEffect } from 'react'

/** Time left until `targetIso`, ticking each second: "12m 5s", "40s", "any moment" once passed, null with no target. */
export function useCountdown(targetIso: string | null): string | null {
  const [display, setDisplay] = useState<string | null>(null)

  useEffect(() => {
    if (!targetIso) { setDisplay(null); return }
    const tick = () => {
      const remaining = Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000)
      if (remaining <= 0) {
        setDisplay('any moment')
      } else {
        const h = Math.floor(remaining / 3600)
        const m = Math.floor((remaining % 3600) / 60)
        const s = remaining % 60
        setDisplay(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetIso])

  return display
}
