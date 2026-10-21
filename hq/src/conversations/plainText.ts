/**
 * Text written for a reader of markdown, made plain for a card's one line (on screen spec, Prose first, cards
 * quiet): headings, list marks, emphasis, code marks and link targets dropped, lines run together. Pure, so the
 * server's cards and the screen read it the same.
 */
export function plainText(text: string): string {
  return text
    .split('\n')
    .filter(line => !/^\s*(```|~~~)/.test(line) && !/^\s*([-*_])\s*(\1\s*){2,}$/.test(line))
    .map(line => line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__)(\S(?:.*?\S)?)\1/g, '$2')
      .replace(/(^|[^\w*])\*(\S(?:.*?\S)?)\*(?!\w)/g, '$1$2')
      .replace(/`+([^`]*)`+/g, '$1')
      .trim())
    .filter(line => line !== '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Plain text cut to `max` characters, ending with an ellipsis when cut. */
export function cutShort(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}
