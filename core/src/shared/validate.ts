/**
 * Validation helpers
 * ==================
 * Pure predicates shared between site-side mutations and web/mobile forms.
 * Returns `{ ok, reason? }` so callers can either short-circuit on `!ok`
 * or surface `reason` directly to the user.
 */

const TASK_TITLE_MIN = 1
const TASK_TITLE_MAX = 200
const PROJECT_KEY_RE = /^[A-Z][A-Z0-9]{1,5}$/
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export interface ValidationResult {
  ok: boolean
  reason?: string
}

export function validateTaskTitle(title: string): ValidationResult {
  const trimmed = title.trim()
  if (trimmed.length < TASK_TITLE_MIN) return { ok: false, reason: 'Title is required' }
  if (trimmed.length > TASK_TITLE_MAX) return { ok: false, reason: `Title must be ≤ ${TASK_TITLE_MAX} chars` }
  return { ok: true }
}

export function validateProjectKey(key: string): ValidationResult {
  if (!PROJECT_KEY_RE.test(key)) {
    return { ok: false, reason: 'Project key must be 2–6 uppercase alphanumerics, starting with a letter' }
  }
  return { ok: true }
}

export function validateSlug(slug: string): ValidationResult {
  if (slug.length === 0) return { ok: false, reason: 'Slug is required' }
  if (slug.length > 64) return { ok: false, reason: 'Slug must be ≤ 64 chars' }
  if (!SLUG_RE.test(slug)) return { ok: false, reason: 'Slug must be lowercase alphanumerics separated by single hyphens' }
  return { ok: true }
}

export function validateEmail(email: string): ValidationResult {
  if (!email.includes('@') || email.length < 3) return { ok: false, reason: 'Enter a valid email' }
  return { ok: true }
}

export function validatePassword(password: string): ValidationResult {
  if (password.length < 8) return { ok: false, reason: 'Password must be at least 8 characters' }
  return { ok: true }
}
