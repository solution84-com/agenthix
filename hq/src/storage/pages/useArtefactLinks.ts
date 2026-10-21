import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { useIsMobile } from '../../shared/hooks/useIsMobile'
import { artefactNameFromHref } from './fileReferences'

/**
 * Makes an agent's link `artefacts/<file name>` — in a conversation or in a task's session — open the Artefacts
 * tool of the place with that file open (spec §3). Used where a place is built, so it holds wherever the place's
 * transcripts are drawn. Every other link is left alone.
 */
export function useArtefactLinks(): void {
  const [, setParams] = useSearchParams()
  const isMobile = useIsMobile()
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.('a')
      const name = artefactNameFromHref(link?.getAttribute('href') ?? null)
      if (!name) return
      e.preventDefault()
      e.stopPropagation()
      setParams(prev => {
        const next = new URLSearchParams(prev)
        next.set('tool', 'artefacts')
        next.set('artefact', name)
        // On a small screen a tool opens as the place's page.
        if (isMobile) next.set('place', 'open')
        return next
      }, { replace: true })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [setParams, isMobile])
}
