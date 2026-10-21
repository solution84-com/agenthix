/**
 * Formatting helpers
 * ==================
 * Pure presentation helpers shared between web (`hq/client`, `site`) and
 * mobile. UI labels live here so capitalisation / wording stays consistent
 * across surfaces.
 */

import type { TaskStatus, TaskPriority } from '../models/task.js'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function timeAgo(input: string | number | Date, now: number = Date.now()): string {
  const ts = input instanceof Date ? input.getTime() : new Date(input).getTime()
  if (Number.isNaN(ts)) return ''
  const diff = now - ts
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`
  if (diff < 30 * DAY) return `${Math.floor(diff / (7 * DAY))}w ago`
  return `${Math.floor(diff / (30 * DAY))}mo ago`
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export function statusLabel(status: TaskStatus): string {
  return STATUS_LABEL[status]
}

export function priorityLabel(priority: TaskPriority): string {
  return PRIORITY_LABEL[priority]
}

export function projectKeyPrefix(projectKey: string, taskNumber: number): string {
  return `${projectKey}-${taskNumber}`
}

export function initials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const AVATAR_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#3b82f6']

export function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export function formatNumber(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return '<$0.01'
  if (usd < 100) return `$${usd.toFixed(2)}`
  return `$${Math.round(usd)}`
}
