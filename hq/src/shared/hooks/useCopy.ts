import { useCallback, useEffect, useRef, useState } from 'react'
import { copyText } from '../copyText'

export type CopyState = 'idle' | 'copied' | 'failed'

/** A copy button's state: `copied` for two seconds after the text is on the clipboard, `failed` when it could not be. */
export function useCopy(): { state: CopyState; copy: (text: string) => Promise<boolean> } {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const copy = useCallback(async (text: string) => {
    const ok = await copyText(text)
    setState(ok ? 'copied' : 'failed')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), ok ? 2000 : 6000)
    return ok
  }, [])
  return { state, copy }
}
