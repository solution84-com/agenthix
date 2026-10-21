import type { FormEvent, RefObject } from 'react'
import { Send, Square, ChevronDown } from 'lucide-react'
import { ModelOptions } from '../agents/ModelSelect'
import { modelsForRuntime } from '@agenthix/core'

export interface PanelChatComposerProps {
  inputText: string
  onInputChange: (text: string) => void
  onSend: (e: FormEvent) => void | Promise<void>
  onStop: () => void | Promise<void>
  textareaRef: RefObject<HTMLTextAreaElement | null>
  isSending: boolean
  sendDisabledReason?: string
  placeholder?: string
  agentRuntime: Parameters<typeof modelsForRuntime>[0]
  currentModel: string
  onModelChange: (model: string) => void | Promise<void>
}

/** The message box under a conversation: text, model choice, token and cost line, send and stop. */
export function PanelChatComposer({
  inputText, onInputChange, onSend, onStop, textareaRef, isSending, sendDisabledReason, placeholder,
  agentRuntime, currentModel, onModelChange,
}: PanelChatComposerProps) {
  return (
    <div className="p-3 shrink-0">

    <form onSubmit={onSend} className="rounded-xl border border-border bg-surface-1 p-2 focus-within:border-accent">
      <textarea
        ref={textareaRef}
        value={inputText}
        onChange={(e) => {
          onInputChange(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
        }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void onSend(e as unknown as React.FormEvent) } }}
        placeholder={sendDisabledReason ?? placeholder ?? 'Message your agent...'}
        disabled={!!sendDisabledReason}
        rows={1}
        className="w-full bg-transparent px-2 py-1.5 text-body text-text-primary placeholder:text-text-muted focus:outline-none resize-none leading-relaxed"
        style={{ minHeight: '40px', maxHeight: '100px' }}
      />
      <div className="flex items-center mt-2">
        {/* Model selector */}
        {modelsForRuntime(agentRuntime).length > 0 && (
          <div className="relative">
            <select
              value={currentModel}
              onChange={e => void onModelChange(e.target.value)}
              disabled={isSending}
              className="appearance-none bg-surface-1 border border-border rounded-lg pl-2.5 pr-6 py-1.5 text-micro text-text-primary focus:outline-none focus:border-accent transition-colors cursor-pointer disabled:opacity-40"
            >
              <ModelOptions runtime={agentRuntime} value={currentModel} />
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" />
          </div>
        )}
        <div className="flex-1" />
        {/* Stop stays its own button; the box keeps taking messages while the agent works */}
        {isSending && (
          <button
            type="button"
            onClick={() => void onStop()}
            className="mr-1 shrink-0 flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-small font-medium text-danger transition-colors hover:bg-surface-hover cursor-pointer"
          >
            <Square className="w-3 h-3 fill-current" />
            Stop
          </button>
        )}
        <button
          type="submit"
          disabled={!inputText.trim() || !!sendDisabledReason}
          className="shrink-0 flex items-center gap-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent px-3 py-1.5 rounded-lg text-small font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          <Send className="w-3 h-3" />
          Send
        </button>
      </div>
    </form>
    </div>
  )
}
