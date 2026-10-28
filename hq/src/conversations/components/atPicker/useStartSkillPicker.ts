import { useEffect, useRef, type ChangeEvent, type KeyboardEvent, type SyntheticEvent } from 'react'
import { useSkillPicker } from './useSkillPicker'

/**
 * The `/` picker in a box that starts a conversation, on its plain text area (skills spec part 5, *Picking a skill*):
 * the message box's picker, told the caret from the text area's own events. A skill belongs to the agent it was
 * picked from, so choosing another agent lets it go.
 */
export function useStartSkillPicker({ enabled, agentId, text, setText }: {
  enabled: boolean
  agentId: string
  text: string
  setText: (text: string) => void
}) {
  const box = useRef<HTMLTextAreaElement>(null)
  const skills = useSkillPicker({ enabled, field: box, text, setText })
  const { reset } = skills
  useEffect(() => { reset() }, [agentId])

  const caretOf = (e: SyntheticEvent<HTMLTextAreaElement>) => skills.onCaret(e.currentTarget.value, e.currentTarget.selectionStart)
  return {
    skills,
    box,
    textarea: {
      ref: box,
      onChange: (e: ChangeEvent<HTMLTextAreaElement>) => { setText(e.target.value); caretOf(e) },
      onSelect: caretOf,
      /** True when the picker or the chip took the key. */
      onKeyFirst: (e: KeyboardEvent<HTMLTextAreaElement>) => skills.onKeyFirst(e),
      'aria-controls': skills.open ? skills.listId : undefined,
      'aria-activedescendant': skills.open ? skills.activeId : undefined,
    },
  }
}
