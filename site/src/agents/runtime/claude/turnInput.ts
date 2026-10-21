/**
 * The streaming input of one `claude` process: the SDK reads the process's
 * user messages from this, one per turn, for as long as the process lives
 * (spec §1). Ending it closes the process's input, and the CLI then exits —
 * its documented, orderly end.
 */
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

export class TurnInput implements AsyncIterable<SDKUserMessage> {
  private queue: SDKUserMessage[] = []
  private wake: (() => void) | null = null
  private ended = false

  push(text: string): void {
    if (this.ended) throw new Error('This Claude process takes no more turns')
    this.queue.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null })
    this.wake?.()
  }

  end(): void {
    this.ended = true
    this.wake?.()
  }

  async *[Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    for (;;) {
      const next = this.queue.shift()
      if (next) { yield next; continue }
      if (this.ended) return
      await new Promise<void>(resolve => { this.wake = resolve })
      this.wake = null
    }
  }
}
