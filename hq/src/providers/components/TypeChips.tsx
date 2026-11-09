import type { AiProviderType } from '@agenthix/core'
import { TYPE_CHIP_WORDS } from './providerWords'

/** What a provider covers, as chips: Models, Hearing, Speaking. */
export function TypeChips({ types }: { types: readonly AiProviderType[] }) {
  const order: AiProviderType[] = ['llm', 'stt', 'tts']
  return (
    <span className="inline-flex flex-wrap gap-1">
      {order.filter(t => types.includes(t)).map(t => (
        <span key={t} className="rounded-full bg-accent-subtle px-2 py-0.5 text-micro font-medium text-accent">{TYPE_CHIP_WORDS[t]}</span>
      ))}
    </span>
  )
}
