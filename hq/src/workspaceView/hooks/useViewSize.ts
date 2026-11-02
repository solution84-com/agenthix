import { useEffect, useState } from 'react'

/**
 * How much room the view has (spec part 1, *Narrow screens*): `wide` above about 1280 px, `laptop` (the left panel
 * as its strip) down to about 900 px, `tablet` (the conversation as a drawer) below that, `phone` one thing at a time.
 */
export type ViewSize = 'wide' | 'laptop' | 'tablet' | 'phone'

const WIDE_MIN = 1280
const LAPTOP_MIN = 900
const TABLET_MIN = 640

export function viewSizeOf(width: number): ViewSize {
  if (width >= WIDE_MIN) return 'wide'
  if (width >= LAPTOP_MIN) return 'laptop'
  if (width >= TABLET_MIN) return 'tablet'
  return 'phone'
}

export function useViewSize(): ViewSize {
  const [size, setSize] = useState<ViewSize>(() => (typeof window === 'undefined' ? 'wide' : viewSizeOf(window.innerWidth)))
  useEffect(() => {
    const onResize = () => setSize(viewSizeOf(window.innerWidth))
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}
