import type { HomeSignals } from '../shared/homeTypes'

export function greeting(now: Date, name: string | null): string {
  const hour = now.getHours()
  const part = hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'afternoon' : 'evening'
  return name ? `Good ${part}, ${name}` : `Good ${part}`
}

export function endOfLocalDay(now: Date): Date {
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return end
}

export function signalLabels(c: HomeSignals) {
  return {
    notifications: c.notificationsNeedingYou === 0
      ? 'Nothing needs you'
      : `${c.notificationsNeedingYou} ${c.notificationsNeedingYou === 1 ? 'notification needs' : 'notifications need'} you`,
    runs: c.agentsAtWork === 0 ? 'Nothing running' : `${c.agentsAtWork} running`,
    comingUp: c.comingUpToday === 0 ? 'Nothing coming up today' : `${c.comingUpToday} coming up today`,
  }
}
