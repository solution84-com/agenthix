import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { useIsMobile } from '../../shared/hooks/useIsMobile'
import { toolParamsForHref } from './fileReferences'

/**
 * Makes an agent's link to a file of its place — `artefacts/<file name>`, `files/…` or `workspaces/<id>/…`, in a
 * conversation or in a task's session — open that file in the place's tool (spec part 3, *Chips in conversations*).
 * Used where a place is built, so it holds wherever the place's transcripts are drawn, old ones included; a reply drawn
 * with its place shows such a link as a chip instead. Every other link is left alone.
 */
export function useArtefactLinks(): void {
  const [, setParams] = useSearchParams()
  const isMobile = useIsMobile()
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.('a')
      const params = toolParamsForHref(link?.getAttribute('href') ?? null)
      if (!params) return
      e.preventDefault()
      e.stopPropagation()
      setParams(prev => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(params)) next.set(key, value)
        // On a small screen a tool opens as the place's page.
        if (isMobile) next.set('place', 'open')
        return next
      }, { replace: true })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [setParams, isMobile])
}
