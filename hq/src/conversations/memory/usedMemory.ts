/**
 * `used_memory`: how the lead says which remembered items its reply relied on, without a model step of its own.
 * It is called with the reply's last words, and a step whose only calls are this one ends the turn there
 * (coordinator/turn.ts) — the model is not asked again just to acknowledge it.
 */
import { z } from 'zod'

export const USED_MEMORY = 'used_memory'

export const usedMemoryInput = z.object({
  keys: z.array(z.string().min(1)).max(20).describe('The keys of the remembered items your reply relied on; empty when none'),
})

/** Whether a step that wrote words and made only these calls has finished the reply. */
export function endsReply(stepText: string, calls: readonly { name: string }[]): boolean {
  return stepText.trim().length > 0 && calls.length > 0 && calls.every(c => c.name === USED_MEMORY)
}
