/** A proposed file as an edit-then-accept sends it back: its bytes when they came, else its text. */
export function sentAsProposed(f: { path: string; text: string | null; base64?: string }): { path: string; text?: string; base64?: string } {
  return f.base64 !== undefined ? { path: f.path, base64: f.base64 } : { path: f.path, text: f.text ?? '' }
}
