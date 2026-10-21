import type { TracePoint } from './rows'

type Props = { points: readonly TracePoint[]; on: number | null; off: number | null; max: number }

/** The confidence as a moving trace (0 to 1), with the detector's on and off thresholds as dashed lines. */
export function Trace({ points, on, off, max }: Props) {
  const width = 240
  const height = 80
  const x = (i: number) => (points.length <= 1 ? 0 : (i / (max - 1)) * width)
  const y = (v: number) => height - Math.max(0, Math.min(1, v)) * height
  const line = points.map((p, i) => `${x(i + (max - points.length)).toFixed(1)},${y(p.confidence).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-full rounded-md border border-border-subtle bg-surface-0" role="img" aria-label="Silence detection confidence">
      {on !== null && <line x1="0" x2={width} y1={y(on)} y2={y(on)} className="stroke-success text-success" strokeDasharray="4 3" strokeWidth="1" />}
      {off !== null && <line x1="0" x2={width} y1={y(off)} y2={y(off)} className="stroke-warning text-warning" strokeDasharray="4 3" strokeWidth="1" />}
      {points.length > 1 && <polyline points={line} fill="none" className="stroke-accent" strokeWidth="1.5" />}
    </svg>
  )
}
