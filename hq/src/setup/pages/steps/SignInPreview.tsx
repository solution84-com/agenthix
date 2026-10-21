import { useLayoutEffect, useRef, useState } from 'react'
import { AuthLayout } from '../../../auth/pages/parts/AuthLayout'
import { SignInForm } from '../../../auth/pages/parts/SignInForm'

const FRAME_W = 1024
const FRAME_H = 768
const NO_VALUES = { username: '', password: '', rememberMe: false }

/**
 * The sign-in page the organisation's name, picture and cover make, drawn by the
 * real page's own layout and form (stored image paths go through the signed-in
 * image fetch) at 1024x768 and scaled down to the panel; inert, updated as they change.
 */
export function SignInPreview({ name, pictureSrc, coverSrc }: { name: string; pictureSrc: string | null; coverSrc?: string | null }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.4)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => { if (el.clientWidth > 0) setScale(el.clientWidth / FRAME_W) }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const shown = name.trim() || 'Your organisation'
  const identity = { name: shown, handle: null, vision: null, avatarUrl: pictureSrc, coverUrl: coverSrc ?? null, shows: 'cover' as const }
  return (
    <div className="flex flex-col items-center justify-center gap-3 bg-surface-0 px-5 py-8 lg:min-h-screen lg:border-r lg:border-border-subtle">
      <div className="text-micro font-medium uppercase tracking-wide text-text-muted">Your sign-in page</div>
      <div ref={box} className="w-full max-w-[560px] overflow-hidden rounded-xl border border-border bg-surface-1 shadow-lg" style={{ height: FRAME_H * scale }} data-testid="sign-in-preview" aria-hidden>
        <div
          className="pointer-events-none select-none overflow-hidden"
          style={{ width: FRAME_W, height: FRAME_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          <AuthLayout identity={identity} contained>
            <SignInForm org={shown} values={NO_VALUES} inert />
          </AuthLayout>
        </div>
      </div>
      <div className="text-small text-text-muted">Updates as you type</div>
    </div>
  )
}
