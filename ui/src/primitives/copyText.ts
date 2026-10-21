/**
 * Puts text on the clipboard and says whether it worked. A browser gives `navigator.clipboard` only to a page on
 * https or localhost, so on plain http at a network address it is missing: this then selects the text in a hidden
 * field and uses `document.execCommand('copy')`. False means neither worked; the caller says so in words.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Refused (no permission, or not a secure page): try the fallback.
  }
  try {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.top = '0'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.focus()
    field.select()
    field.setSelectionRange(0, text.length)
    const done = document.execCommand('copy')
    field.remove()
    return done
  } catch {
    return false
  }
}

/** What a button says when it could not copy. */
export const COPY_FAILED_WORDS = 'Could not copy: select the text and copy it yourself'
