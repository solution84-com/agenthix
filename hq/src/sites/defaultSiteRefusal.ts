const WHAT = { revoked: 'be removed', left: 'leave' } as const

export function defaultSiteRefusal(verb: keyof typeof WHAT): string {
  return `HQ's own site cannot ${WHAT[verb]}: it is installed with HQ and stays for as long as HQ does. Nothing was changed.`
}
