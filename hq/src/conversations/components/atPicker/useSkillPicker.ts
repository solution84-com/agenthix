import { useEffect, useRef, useState, type RefObject } from 'react'
import { useAtPicker } from './useAtPicker'
import { holdsSkill, skillMark, slashQueryAt, withoutSkill } from './slashQuery'

export type PickedSkillChip = { name: string; title: string }

/**
 * The `/` skill picker in the message box (skills spec part 5, *Picking a skill*): the `@` picker's keys and list with
 * the trigger at the start of the message. Choosing leaves `/name` in the text, shown highlighted where it was typed
 * and edited like any other words; the skill is sent beside the text and never parsed from it. The skill stays picked
 * only while the text still begins with that mark, so deleting or changing it lets the skill go. One skill per
 * message: while one is picked the picker stays closed. The field is the message box's own or a plain text area.
 */
export function useSkillPicker({ enabled, field, text, setText }: {
  enabled: boolean
  field: RefObject<{ setSelectionRange(start: number, end: number): void } | null>
  text: string
  setText: (text: string) => void
}) {
  const [chosen, setChosen] = useState<PickedSkillChip | null>(null)
  const [caretTo, setCaretTo] = useState<number | null>(null)
  const skill = chosen && holdsSkill(text, chosen.name) ? chosen : null
  const picker = useAtPicker({
    enabled: enabled && skill === null,
    queryAt: slashQueryAt,
    onChoose: (item, query) => {
      const mark = skillMark(item.reference)
      const rest = text.slice(query.end)
      const gap = /^\s/.test(rest) ? '' : ' '
      setChosen({ name: item.reference, title: item.label })
      setText(mark + gap + rest)
      setCaretTo(mark.length + 1)
    },
  })

  // The mark was changed or deleted: the skill is let go for good, so typing the same name again is plain text.
  useEffect(() => { if (chosen && !skill) setChosen(null) }, [chosen, skill])
  // The caret goes after the mark once the field shows the new text.
  useEffect(() => {
    if (caretTo === null) return
    field.current?.setSelectionRange(caretTo, caretTo)
    setCaretTo(null)
  }, [caretTo])

  return {
    ...picker,
    skill,
    /** The person's words, without the mark. */
    wordsOf: (value: string) => withoutSkill(value, skill?.name ?? null),
    reset: () => setChosen(null),
  }
}

export type SkillPickerState = ReturnType<typeof useSkillPicker>
