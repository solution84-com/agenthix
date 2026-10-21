import React from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => React.ReactNode
}

export interface ResponsiveRowsProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  /** Extra class names applied to the wrapping container */
  className?: string
}

/**
 * Renders rows as a `<table>` at lg+ breakpoints and as stacked cards below lg.
 *
 * Desktop (lg+): standard table with a thead of column.header values and a
 * tbody row per item, each cell using column.render(row).
 *
 * Mobile (below lg): one card div per row showing header: value pairs.
 * Cards are tappable when onRowClick is provided.
 */
export function ResponsiveRows<T,>({
  columns,
  rows,
  rowKey,
  onRowClick,
  className,
}: ResponsiveRowsProps<T>) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div className={className}>
        {rows.map(row => (
          <div
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`border-b border-border/40 last:border-0 py-3 px-1 ${
              onRowClick ? 'cursor-pointer hover:bg-surface-hover transition-colors' : ''
            }`}
          >
            {columns.map(col => (
              <div key={col.key} className="flex items-start gap-2 py-0.5 text-small">
                <span className="shrink-0 font-medium text-text-secondary min-w-[80px]">
                  {col.header}
                </span>
                <span className="text-text-primary">{col.render(row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <table className={`w-full border-collapse ${className ?? ''}`}>
      <thead>
        <tr className="border-b border-border">
          {columns.map(col => (
            <th
              key={col.key}
              className="px-4 py-2.5 text-left text-micro font-semibold uppercase tracking-wide text-text-muted"
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`border-b border-border-subtle last:border-0 transition-colors ${
              onRowClick ? 'cursor-pointer hover:bg-surface-hover' : 'hover:bg-surface-hover'
            }`}
          >
            {columns.map(col => (
              <td key={col.key} className="px-4 py-3">
                {col.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
