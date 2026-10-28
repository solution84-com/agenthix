import { X, Zap } from 'lucide-react'
import type { PickedSkillChip } from './useSkillPicker'

/** The skill picked with `/`, held beside the text until the message is sent; its button lets it go. */
export function SkillChip({ skill, onRemove }: { skill: PickedSkillChip; onRemove: () => void }) {
  return (
    <span data-testid="skill-chip" className="flex shrink-0 items-center gap-1 self-center rounded-full bg-accent-subtle py-0.5 pl-2 pr-1 text-small text-accent">
      <Zap size={12} aria-hidden />
      <span className="max-w-40 truncate">{skill.title}</span>
      <button type="button" aria-label={`Remove the skill ${skill.title}`} onClick={onRemove} className="flex size-5 items-center justify-center rounded-full hover:bg-accent/20">
        <X size={12} aria-hidden />
      </button>
    </span>
  )
}
