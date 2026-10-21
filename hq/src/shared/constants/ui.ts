export const PRIORITY_COLORS: Record<'LOW' | 'MEDIUM' | 'HIGH', string> = {
  LOW:    '#10b981',
  MEDIUM: '#f59e0b',
  HIGH:   '#ef4444',
}

export const PRIORITY_SELECTED_CLASSES: Record<'LOW' | 'MEDIUM' | 'HIGH', string> = {
  LOW:    'bg-emerald-500/20 text-emerald-500 border-emerald-500/40',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  HIGH:   'bg-red-500/20 text-red-500 border-red-500/40',
}

export const AGENT_STATUS_CLASSES: Record<string, string> = {
  active:  'text-emerald-500',
  idle:    'text-white/40',
  running: 'text-yellow-400',
  error:   'text-red-500',
}
