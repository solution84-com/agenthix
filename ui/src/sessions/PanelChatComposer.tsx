import type { FormEvent, RefObject } from 'react'
import { Send, Square } from 'lucide-react'
import { ModelOptions } from '../agents/ModelSelect'
import { modelsForRuntime } from '@agenthix/core'
import { FIELD_BOX } from '../primitives/controlStyles'
import { BUTTON_PRIMARY } from '../primitives/buttonStyles'
import { PlainSelect } from '../primitives/PlainSelect'
import { Button } from '../primitives/Button'

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

    <form onSubmit={onSend} className={`rounded-xl p-2 ${FIELD_BOX}`}>
      <textarea
        ref={textareaRef}
        value={inputText}
        onChange={(e) => {
          onInputChange(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
        }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void onSend(e as unknown as React.FormEvent) } }}
        placeholder={sendDisabledReason ?? placeholder ?? 'Message your agent...'}
        disabled={!!sendDisabledReason}
        rows={1}
        className="w-full bg-transparent px-2 py-1.5 text-body text-text-primary placeholder:text-text-muted focus:outline-none resize-none leading-relaxed"
        style={{ minHeight: '40px', maxHeight: '100px' }}
      />
      <div className="flex items-center mt-2">
        {/* Model selector */}
        {modelsForRuntime(agentRuntime).length > 0 && (
          <PlainSelect
            aria-label="Model"
            value={currentModel}
            onChange={e => void onModelChange(e.target.value)}
            disabled={isSending}
          >
            <ModelOptions runtime={agentRuntime} value={currentModel} />
          </PlainSelect>
        )}
        <div className="flex-1" />
        {/* Stop stays its own button; the box keeps taking messages while the agent works */}
        {isSending && (
          <Button variant="secondary" onClick={() => void onStop()} className="mr-1 shrink-0 text-danger" leadingIcon={<Square className="w-3 h-3 fill-current" />}>
            Stop
          </Button>
        )}
        <button
          type="submit"
          disabled={!inputText.trim() || !!sendDisabledReason}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-small font-medium cursor-pointer ${BUTTON_PRIMARY}`}
        >
          <Send className="w-3 h-3" />
          Send
        </button>
      </div>
    </form>
    </div>
  )
}
