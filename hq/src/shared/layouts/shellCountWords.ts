import type { ShellCounts } from './useShellCounts'

/** The phone's ☰ shows a dot while anything waits for the person: a notification, or a run that needs them. */
export function somethingNeedsYou(counts: Pick<ShellCounts, 'unreadNotifications' | 'runsNeedingYou'>): boolean {
  return counts.unreadNotifications > 0 || counts.runsNeedingYou > 0
}

export function formatCount(n: number): string {
  return n > 99 ? '99+' : String(n)
}

/** Runs' count in words: "2 need you · 3 running", what applies, or nothing. */
export function runsWords({ runsNeedingYou, runsInProgress }: Pick<ShellCounts, 'runsNeedingYou' | 'runsInProgress'>): { needs: string | null; running: string | null } {
  return {
    needs: runsNeedingYou > 0 ? `${formatCount(runsNeedingYou)} need${runsNeedingYou === 1 ? 's' : ''} you` : null,
    running: runsInProgress > 0 ? `${formatCount(runsInProgress)} running` : null,
  }
}
