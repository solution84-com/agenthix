/**
 * The relay's one way to log. It never takes a request: a ticket travels in the path, so no URL, path, query or
 * header is ever passed here — only words the relay wrote and ids of sites.
 */
export type Log = (line: string) => void

export const consoleLog: Log = line => console.log(`[relay] ${line}`)
