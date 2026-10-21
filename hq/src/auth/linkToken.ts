/**
 * A one-time link's token leaves the address bar once read (getting-in spec,
 * The first admin): the page keeps it for this tab only, so a reload still
 * works, and the browser's history and anyone glancing at the screen never see
 * it. Used by the invitation, first-admin and reset pages.
 */
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const keyOf = (kind: LinkKind) => `agenthix:link-token:${kind}`

export type LinkKind = 'invite' | 'reset'

/** The token from the address if there is one (and keeps it), else the one kept earlier in this tab. */
export function takeLinkToken(kind: LinkKind, fromAddress: string | undefined, store: Store): string | null {
  try {
    if (fromAddress) {
      store.setItem(keyOf(kind), fromAddress)
      return fromAddress
    }
    return store.getItem(keyOf(kind))
  } catch {
    // Storage refused (private mode): the token still works for this page view.
    return fromAddress ?? null
  }
}

/** Once the link has done its work, or turned out not to work. */
export function forgetLinkToken(kind: LinkKind, store: Store): void {
  try {
    store.removeItem(keyOf(kind))
  } catch {
    // Nothing kept.
  }
}
