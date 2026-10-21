/** The top of the menu and of the sign-in page: the mark, the portal's name, and where it runs. */
export function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2 text-[14.5px] font-bold tracking-[-.01em] text-text-primary">
      <Mark />
      {!collapsed && <span>Fleet Console</span>}
    </span>
  )
}

export function Mark() {
  return <span aria-hidden className="inline-block size-[22px] flex-none rounded-[7px] bg-linear-135 from-mark-from to-mark-to" />
}

/** The machine it runs on and the address it listens on: the Fleet Console is only ever on 127.0.0.1. */
export function WhereBadge({ machineName }: { machineName: string | null }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-selected px-2 text-micro font-semibold leading-[18px] text-text-secondary">
      {machineName ? `on ${machineName} · 127.0.0.1` : '127.0.0.1'}
    </span>
  )
}
