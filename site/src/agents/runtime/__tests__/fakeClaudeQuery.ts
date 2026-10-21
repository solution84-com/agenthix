/**
 * A stand-in for the Claude Agent SDK's `query()`, shaped like the real one as
 * the phase 3 and lane 4 container runs observed it: every user message the
 * prompt yields is one turn, answered by the script and ended by a `result`;
 * a string prompt is one turn after which the process exits; ending the
 * prompt's stream ends the process; and once the process has ended, the
 * control calls reject as the SDK's do ("ProcessTransport is not ready for
 * writing").
 */
export type FakeMessage = Record<string, unknown>
/** What a turn answers: its messages (the `result` is added unless one is given), or 'hang' until interrupted. */
export type TurnScript = (turn: number, text: string, query: FakeClaudeQuery) => FakeMessage[] | 'hang'

export const NOT_READY = 'ProcessTransport is not ready for writing'

export class FakeClaudeQuery implements AsyncIterator<FakeMessage> {
  ended = false
  turns: string[] = []
  model: string | undefined
  private out: FakeMessage[] = []
  private wake: (() => void) | null = null
  private interrupted: (() => void) | null = null

  /** Calls made, counted by hand: a `vi.fn` observes the promises it returns,
   *  which would hide the unhandled rejections these tests look for. */
  calls = { interrupt: 0, setModel: 0, close: 0, getContextUsage: 0 }
  /** What `getContextUsage()` answers; undefined makes it reject, as an SDK that cannot answer would. */
  contextUsage: Record<string, unknown> | undefined

  async getContextUsage(): Promise<Record<string, unknown>> {
    this.calls.getContextUsage++
    if (this.ended || !this.contextUsage) throw new Error(NOT_READY)
    return this.contextUsage
  }

  /** Runs the process's PostCompact hook, as Claude Code does once it has summarised. */
  async postCompact(trigger: 'auto' | 'manual', summary: string): Promise<void> {
    const hooks = (this.options.hooks as { PostCompact?: Array<{ hooks: Array<(input: unknown) => Promise<unknown>> }> } | undefined)?.PostCompact ?? []
    for (const matcher of hooks) for (const hook of matcher.hooks) await hook({ hook_event_name: 'PostCompact', trigger, compact_summary: summary })
  }

  async interrupt(): Promise<void> {
    this.calls.interrupt++
    if (this.ended) throw new Error(NOT_READY)
    this.interrupted?.()
  }

  async setModel(model?: string): Promise<void> {
    this.calls.setModel++
    if (this.ended) throw new Error(NOT_READY)
    this.model = model
  }

  close(): void {
    this.calls.close++
    this.end()
  }

  constructor(readonly options: Record<string, unknown>, prompt: unknown, private script: TurnScript) {
    this.model = options.model as string | undefined
    void this.pump(prompt)
  }

  [Symbol.asyncIterator]() { return this }

  async next(): Promise<IteratorResult<FakeMessage>> {
    for (;;) {
      const message = this.out.shift()
      if (message) return { value: message, done: false }
      if (this.ended) return { value: undefined, done: true }
      await new Promise<void>(resolve => { this.wake = resolve })
    }
  }

  async return(): Promise<IteratorResult<FakeMessage>> {
    this.end()
    return { value: undefined, done: true }
  }

  /** The process dies on its own, as a kill from outside would make it. */
  die(): void { this.end() }

  private emit(messages: FakeMessage[]): void {
    this.out.push(...messages)
    this.wake?.()
  }

  private end(): void {
    this.ended = true
    this.wake?.()
  }

  private async answer(text: string): Promise<void> {
    const turn = this.turns.push(text)
    const reply = this.script(turn, text, this)
    this.emit([{ type: 'system', subtype: 'init', model: this.model }])
    if (reply === 'hang') {
      await new Promise<void>(resolve => { this.interrupted = resolve })
      this.interrupted = null
      this.emit([{ type: 'result', subtype: 'error_during_execution', errors: ['interrupted'] }])
      return
    }
    const hasResult = reply.some(m => m.type === 'result')
    this.emit(hasResult ? reply : [...reply, { type: 'result', subtype: 'success' }])
  }

  private async pump(prompt: unknown): Promise<void> {
    if (typeof prompt === 'string') {
      await this.answer(prompt)
      this.end()
      return
    }
    for await (const message of prompt as AsyncIterable<{ message: { content: unknown } }>) {
      if (this.ended) return
      const content = message.message.content
      await this.answer(typeof content === 'string' ? content : JSON.stringify(content))
    }
    this.end()
  }
}

/** Every query started, newest last; hand `start` to `vi.mocked(query).mockImplementation`. */
export function fakeClaudeQueries(script: TurnScript = () => []) {
  const started: FakeClaudeQuery[] = []
  const start = (params: { prompt: unknown; options?: Record<string, unknown> }) => {
    const q = new FakeClaudeQuery(params.options ?? {}, params.prompt, script)
    started.push(q)
    return q as never
  }
  return { started, start }
}
