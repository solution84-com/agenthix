/**
 * The page's address, as a pattern for `toHaveURL`. The conversation beside the page is never empty, so once it has
 * filled itself in the address also names it (`c=`); this matches the address with or without that last parameter.
 */
export function at(address: string): RegExp {
  const escaped = address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}(?:[?&]c=[^&]+)?$`)
}
