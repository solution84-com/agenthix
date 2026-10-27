import { fireEvent, screen } from '@testing-library/react'
import { readField, selectIn } from '../messageFieldText'

/** The box's field, found anew each time: the field is drawn again when its chips change. */
export const fieldOf = (label: string) => screen.getByLabelText(label) as HTMLDivElement
export const valueOf = (label: string) => readField(fieldOf(label))

/** Types into the field as a browser does: the field's contents change, the caret is at the end, an input event follows. */
export function typeInto(label: string, text: string, caret = text.length) {
  const field = fieldOf(label)
  field.focus()
  field.textContent = text
  selectIn(field, caret, caret)
  fireEvent.input(field)
}

export function caretAt(label: string, offset: number) {
  const field = fieldOf(label)
  field.focus()
  selectIn(field, offset, offset)
}
