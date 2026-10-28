import { useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useAtPicker } from './useAtPicker'
import { slashQueryAt } from './slashQuery'

export type PickedSkillChip = { name: string; title: string }

/**
 * The `/` skill picker in the message box (skills spec part 5, *Picking a skill*): the `@` picker's keys and list with
 * the trigger at the start of the message. Choosing takes the `/…` out of the text and holds the skill as a chip, which
 * is sent beside the text and never in it; Backspace at the start of the text, or the chip's own button, removes it.
 * One skill per message: while one is chosen the picker stays closed. The field is the message box's own or a plain
 * text area; either moves the caret to the start when the chip goes.
 */
export function useSkillPicker({ enabled, field, text, setText }: {
  enabled: boolean
  field: RefObject<{ setSelectionRange(start: number, end: number): void } | null>
  text: string
  setText: (text: string) => void
}) {
  const [skill, setSkill] = useState<PickedSkillChip | null>(null)
  const caret = useRef<number | null>(null)
  const picker = useAtPicker({
    enabled: enabled && skill === null,
    queryAt: slashQueryAt,
    onChoose: (item, query) => {
      setSkill({ name: item.reference, title: item.label })
      setText(text.slice(0, query.start) + text.slice(query.end))
    },
  })

  const clear = () => {
    setSkill(null)
    field.current?.setSelectionRange(0, 0)
  }
  const { onCaret: pickerCaret, onKeyFirst: pickerKeys } = picker
  return {
    ...picker,
    skill,
    clear,
    reset: () => setSkill(null),
    onCaret: (t: string, c: number | null) => { caret.current = c; pickerCaret(t, c) },
    onKeyFirst: (e: KeyboardEvent<HTMLElement>): boolean => {
      if (skill && e.key === 'Backspace' && caret.current === 0) {
        e.preventDefault()
        clear()
        return true
      }
      return pickerKeys(e)
    },
  }
}

export type SkillPickerState = ReturnType<typeof useSkillPicker>
