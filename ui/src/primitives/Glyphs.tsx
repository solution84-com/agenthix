import type { ReactNode } from 'react'

// Drawn inline, not from lucide-react: hq's tests resolve lucide from hq, and a second copy in a primitive that every
// screen uses breaks React's context there. The paths are lucide's own, so they match the icons beside them.

type GlyphProps = { size?: number; className?: string }

function Glyph({ size = 14, className = '', children }: GlyphProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {children}
    </svg>
  )
}

export const ChevronDownGlyph = (p: GlyphProps) => <Glyph {...p}><path d="m6 9 6 6 6-6" /></Glyph>
export const ChevronLeftGlyph = (p: GlyphProps) => <Glyph {...p}><path d="m15 18-6-6 6-6" /></Glyph>
export const ChevronRightGlyph = (p: GlyphProps) => <Glyph {...p}><path d="m9 18 6-6-6-6" /></Glyph>
export const CheckGlyph = (p: GlyphProps) => <Glyph {...p}><path d="M20 6 9 17l-5-5" /></Glyph>
export const PlusGlyph = (p: GlyphProps) => <Glyph {...p}><path d="M5 12h14" /><path d="M12 5v14" /></Glyph>
export const DownloadGlyph = (p: GlyphProps) => <Glyph {...p}><path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /></Glyph>
export const MaximizeGlyph = (p: GlyphProps) => <Glyph {...p}><path d="M15 3h6v6" /><path d="m21 3-7 7" /><path d="m3 21 7-7" /><path d="M9 21H3v-6" /></Glyph>
export const PanelLeftGlyph = (p: GlyphProps) => <Glyph {...p}><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /></Glyph>

export function CalendarGlyph({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
    </svg>
  )
}

export function XGlyph({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  )
}
