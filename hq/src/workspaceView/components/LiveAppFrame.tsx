import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAction, openLiveApp } from 'wasp/client/operations'
import type { LiveAppView } from '../../livePreviews/types'
import { APP_FRAME_REFERRER_POLICY, APP_FRAME_SANDBOX, postAppEntry, renewIn } from '../appFrame'
import { Nudge, ReadNudgesHeld, retryRead } from '@agenthix/ui/attention'
import { refusalOf } from '../livePreviewWords'

type Failure = { when: 'open' | 'renew'; words: string }

/**
 * A live app in the middle (spec part 4, *The app*): its pages come from the app's own address in a sandboxed frame,
 * entered by a form posted from this page with a single-use ticket HQ signed for this person, this app and its
 * relay. The cookie that gives lives a few minutes, so a hidden frame renews it a little before. HQ never reads what
 * the frame says. The frame is entered again on every `reloads` change, and when the app starts answering.
 *
 * Nobody pressed anything when the frame opens or renews, so neither failure is a dialog: each is retried quietly,
 * then an app that could not be opened is a nudge in place of the frame, and one that could not be kept open a line
 * over it while it still works. Both offer Try again, which enters the app afresh.
 */
export function LiveAppFrame({ livePreviewId, app, reloads }: {
  livePreviewId: string
  app: LiveAppView
  /** Moves on every reload asked: *Reload*, the agent's `reload_view`, or *Auto*. */
  reloads: number
}) {
  // Wasp answers a new action function on every render: kept in a ref, so a render never enters the app again.
  const openAction = useAction(openLiveApp)
  const openRef = useRef(openAction)
  openRef.current = openAction
  const frame = `live-app-${app.appId}`
  const hidden = `live-app-renew-${app.appId}`
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [entered, setEntered] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const held = useContext(ReadNudgesHeld)

  const clear = () => { if (timer.current) clearTimeout(timer.current) }
  const enter = useCallback(async () => {
    clear()
    setFailure(null)
    try {
      const form = await retryRead(() => openRef.current({ livePreviewId, appId: app.appId, entry: 'frame' }))
      postAppEntry(form, frame)
      setEntered(true)
      const renew = async () => {
        try {
          const again = await retryRead(() => openRef.current({ livePreviewId, appId: app.appId, entry: 'renew', cookie: 'frame' }))
          postAppEntry(again, hidden)
          timer.current = setTimeout(() => void renew(), renewIn(again.expiresAt))
        } catch (err) {
          setFailure({ when: 'renew', words: refusalOf(err, 'The app could not be kept open.') })
        }
      }
      timer.current = setTimeout(() => void renew(), renewIn(form.expiresAt))
    } catch (err) {
      setFailure({ when: 'open', words: refusalOf(err, 'The app could not be opened.') })
    }
  }, [livePreviewId, app.appId, frame, hidden])

  const answering = app.state === 'running'
  useEffect(() => {
    if (answering) void enter()
    return clear
  }, [answering, enter, reloads])

  const again = { label: 'Try again', onClick: () => void enter() }
  // The frame stays mounted under a failure: the form that enters the app is posted to it by name.
  const notOpened = failure?.when === 'open'
  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-surface-1">
      {failure?.when === 'renew' && !held && <div className="px-3 py-1"><Nudge place="meta" action={again}>{failure.words}</Nudge></div>}
      {notOpened && !held && <Nudge place="content" title="The app could not be opened" action={again}>{failure.words}</Nudge>}
      <iframe
        name={frame} title={`${app.name}, the live app`} sandbox={APP_FRAME_SANDBOX} referrerPolicy={APP_FRAME_REFERRER_POLICY}
        className={`min-h-0 flex-1 border-0 ${notOpened ? 'hidden' : ''}`} data-testid="live-app-frame" data-entered={entered ? 'yes' : 'no'}
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
