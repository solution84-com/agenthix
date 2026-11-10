import { useEffect, useRef } from 'react'
import { useDockWidth } from '../../../dock/useDockWidth'
import { useFileViewer } from './useFileViewer'
import { ViewerFile } from './ViewerFile'
import { backLabelOf } from './viewerFileParts'

/**
 * The file viewer (the file viewer's *One file viewer, one rule*): a file clicked where it is mentioned opens here,
 * over the whole main area between the menu and the chat, and the page underneath stays as it was. The chat stays
 * beside it at every width where both fit, a medium window included (the dock's `useFileBeside`). Below the dock's
 * medium width (a phone) the viewer is the whole screen. The shell draws it once, inside the screen; what it shows is
 * the address's `?open=`.
 */
export function FileViewerHost({ pageTitle }: { pageTitle: string | null }) {
  const { target, open, close } = useFileViewer()
  const phone = useDockWidth() === 'narrow'
  const region = useRef<HTMLElement>(null)
  const shown = !!target

  useEffect(() => {
    if (shown) region.current?.focus({ preventScroll: true })
  }, [shown])

  if (!target) return null
  const back = { label: backLabelOf(target.from, pageTitle), onBack: close }
  return (
    <section
      ref={region}
      tabIndex={-1}
      aria-label="File viewer"
      data-testid="file-viewer"
      className={`${phone ? 'fixed z-50' : 'absolute z-10'} inset-0 flex min-h-0 flex-col bg-surface-1 outline-none`}
    >
      <ViewerFile target={target} back={back} onOpen={open} />
    </section>
  )
}
