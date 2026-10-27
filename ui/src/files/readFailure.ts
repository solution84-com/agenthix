import type { RendererFailure } from '@agenthix/core'
import { FileBytesError } from './fileBytes'

/** What a renderer reports for a read that threw: null for an abort (the file closed), which reports nothing. */
export function failureOf(error: unknown): RendererFailure | null {
  if (error instanceof FileBytesError) return error.reason
  if (error instanceof DOMException && error.name === 'AbortError') return null
  return 'unavailable'
}
