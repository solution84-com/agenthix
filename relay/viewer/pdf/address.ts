/**
 * What the viewer is asked to show, from its address's fragment (`#link=/t/<ticket>&theme=dark`). A fragment is never
 * sent to a server, so no log holds the ticket. Only a ticket's path is taken — never an origin — so the viewer reads
 * from its own origin, the files address, and nothing a framing page names can point it anywhere else.
 */
export type ViewerAddress = { ticketPath: string; theme: 'light' | 'dark' }

const TICKET_PATH = /^\/t\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/

export const isTicketPath = (link: string): boolean => TICKET_PATH.test(link)

export function readAddress(hash: string): ViewerAddress | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const link = params.get('link') ?? ''
  if (!isTicketPath(link)) return null
  return { ticketPath: link, theme: params.get('theme') === 'dark' ? 'dark' : 'light' }
}
