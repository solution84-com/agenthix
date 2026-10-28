/**
 * The files the editor holds while a person works (skills spec part 6 *The editor*): bytes by path, read from and
 * written to the draft as text where they are text and as base64 where they are not. Nothing here knows the server;
 * the checks the server runs on every save are repeated in `editorChecks.ts` so they show as the person types.
 */
import { ASSET_MANIFEST_FILE, checkAssetFileList } from '@agenthix/core'
import type { EditorFileData } from './editorTypes'

export type EditorFile = { path: string; bytes: Uint8Array }

export const SKILL_FILE_NAME = 'SKILL.md'

export function bytesOfBase64(base64: string): Uint8Array {
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function base64OfBytes(bytes: Uint8Array): string {
  let raw = ''
  for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(raw)
}

export const filesOfData = (data: readonly EditorFileData[]): EditorFile[] =>
  data.map(f => ({ path: f.path, bytes: bytesOfBase64(f.base64) }))

const decoder = new TextDecoder('utf-8', { fatal: true })

/** The text of a file, or null when it is binary: a NUL byte, or bytes that are not UTF-8. */
export function textOf(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null
  try { return decoder.decode(bytes) } catch { return null }
}

export const bytesOfText = (text: string): Uint8Array => new TextEncoder().encode(text)

export const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i])

/** What a save sends: text as text, anything else as base64. */
export function saveInput(files: readonly EditorFile[]): { path: string; text?: string; base64?: string }[] {
  return files.map(f => {
    const text = textOf(f.bytes)
    return text === null ? { path: f.path, base64: base64OfBytes(f.bytes) } : { path: f.path, text }
  })
}

export function sameFiles(a: readonly EditorFile[], b: readonly EditorFile[]): boolean {
  if (a.length !== b.length) return false
  const other = new Map(b.map(f => [f.path, f.bytes]))
  return a.every(f => { const o = other.get(f.path); return o !== undefined && sameBytes(f.bytes, o) })
}

export const byPath = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)

/** Why this path can't be a file of the skill, or null. `existing` are the paths already there, `except` the one being renamed. */
export function pathProblem(path: string, existing: readonly string[], except?: string): string | null {
  const value = path.trim()
  if (value === '') return 'Write the file’s path, such as scripts/format.py.'
  if (value.startsWith('/') || value.includes('\\') || value.split('/').some(s => s === '' || s === '.' || s === '..')) {
    return 'A path is folders and a file name joined by /, inside the skill.'
  }
  if (value === ASSET_MANIFEST_FILE) return `${ASSET_MANIFEST_FILE} is the package’s manifest, which HQ writes; it isn’t part of the skill’s files.`
  const others = existing.filter(p => p !== except)
  if (others.some(p => p === value || p.toLowerCase() === value.toLowerCase())) return `${value} is already there.`
  if (others.some(p => p.startsWith(`${value}/`) || value.startsWith(`${p}/`))) return `${value} would be both a file and a folder.`
  if (checkAssetFileList([...others, value]).length) return `${value} can’t be stored: folders and files with a leading dot, and names that differ only in case, are left out.`
  return null
}

export const withFile = (files: readonly EditorFile[], file: EditorFile): EditorFile[] =>
  [...files.filter(f => f.path !== file.path), file].sort(byPath)

export const withoutFile = (files: readonly EditorFile[], path: string): EditorFile[] => files.filter(f => f.path !== path)

export const renamedFile = (files: readonly EditorFile[], from: string, to: string): EditorFile[] =>
  files.map(f => (f.path === from ? { ...f, path: to } : f)).sort(byPath)
