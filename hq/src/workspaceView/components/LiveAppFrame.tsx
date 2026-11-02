import { useCallback, useEffect, useRef, useState } from 'react'
import { useAction, openLiveApp } from 'wasp/client/operations'
import type { LiveAppView } from '../../livePreviews/types'
import { APP_FRAME_REFERRER_POLICY, APP_FRAME_SANDBOX, postAppEntry, renewIn } from '../appFrame'
import { refusalOf } from '../livePreviewWords'

/**
 * A live app in the middle (spec part 4, *The app*): its pages come from the app's own address in a sandboxed frame,
 * entered by a form posted from this page with a single-use ticket HQ signed for this person, this app and its
 * relay. The cookie that gives lives a few minutes, so a hidden frame renews it a little before. HQ never reads what
 * the frame says. The frame is entered again on every `reloads` change, and when the app starts answering.
 */
export function LiveAppFrame({ livePreviewId, app, reloads, onProblem }: {
  livePreviewId: string
  app: LiveAppView
  /** Moves on every reload asked: *Reload*, the agent's `reload_view`, or *Auto*. */
  reloads: number
  onProblem: (problem: string | null) => void
}) {
  // Wasp answers a new action function on every render: kept in a ref, so a render never enters the app again.
  const openAction = useAction(openLiveApp)
  const openRef = useRef(openAction)
  openRef.current = openAction
  const frame = `live-app-${app.appId}`
  const hidden = `live-app-renew-${app.appId}`
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [entered, setEntered] = useState(false)
  const problem = useRef(onProblem)
  problem.current = onProblem

  const clear = () => { if (timer.current) clearTimeout(timer.current) }
  const enter = useCallback(async () => {
    clear()
    problem.current(null)
    try {
      const form = await openRef.current({ livePreviewId, appId: app.appId, entry: 'frame' })
      postAppEntry(form, frame)
      setEntered(true)
      const renew = async () => {
        try {
          const again = await openRef.current({ livePreviewId, appId: app.appId, entry: 'renew', cookie: 'frame' })
          postAppEntry(again, hidden)
          timer.current = setTimeout(() => void renew(), renewIn(again.expiresAt))
        } catch (err) {
          problem.current(refusalOf(err, 'The app could not be kept open.'))
        }
      }
      timer.current = setTimeout(() => void renew(), renewIn(form.expiresAt))
    } catch (err) {
      problem.current(refusalOf(err, 'The app could not be opened.'))
    }
  }, [livePreviewId, app.appId, frame, hidden])

  const answering = app.state === 'running'
  useEffect(() => {
    if (answering) void enter()
    return clear
  }, [answering, enter, reloads])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-surface-1">
      <iframe
        name={frame} title={`${app.name}, the live app`} sandbox={APP_FRAME_SANDBOX} referrerPolicy={APP_FRAME_REFERRER_POLICY}
        className="min-h-0 flex-1 border-0" data-testid="live-app-frame" data-entered={entered ? 'yes' : 'no'}
      />
      <iframe name={hidden} title="" aria-hidden tabIndex={-1} sandbox={APP_FRAME_SANDBOX} referrerPolicy={APP_FRAME_REFERRER_POLICY} className="hidden" />
    </div>
  )
}

/** Opens the app at the top level of a new tab, entered with a ticket of its own; the tab has no way back to HQ's page. */
export function useOpenInTab(livePreviewId: string | null) {
  const open = useAction(openLiveApp)
  return useCallback(async (appId: string) => {
    if (!livePreviewId) return
    const form = await open({ livePreviewId, appId, entry: 'tab' })
    postAppEntry(form, '_blank')
  }, [open, livePreviewId])
}
