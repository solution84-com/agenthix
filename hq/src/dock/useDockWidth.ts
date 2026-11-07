import { useEffect, useState } from 'react'

/** How the dock is shown at the window's width (spec §12): beside the canvas, over it, or full screen on a phone. */
export type DockWidth = 'narrow' | 'medium' | 'wide'

// Tailwind's `md` and `xl` breakpoints, which the frame's classes (`max-md:`) follow too.
const MEDIUM_MIN = 768
const WIDE_MIN = 1280

function widthOf(px: number): DockWidth {
  if (px >= WIDE_MIN) return 'wide'
  return px >= MEDIUM_MIN ? 'medium' : 'narrow'
}

export function useDockWidth(): DockWidth {
  const [width, setWidth] = useState<DockWidth>(() => (typeof window === 'undefined' ? 'wide' : widthOf(window.innerWidth)))
  useEffect(() => {
    const onResize = () => setWidth(widthOf(window.innerWidth))
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}
