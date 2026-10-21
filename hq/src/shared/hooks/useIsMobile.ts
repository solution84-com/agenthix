import { useEffect, useState } from 'react'

// "mobile" = below Tailwind's `lg` breakpoint. The only place this literal lives.
const MOBILE_MAX = 1024

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_MAX,
  )
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_MAX)
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}
