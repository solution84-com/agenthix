const WHAT = { revoked: 'be removed', left: 'leave' } as const

export function defaultSiteRefusal(verb: keyof typeof WHAT): string {
  return `HQ's site cannot ${WHAT[verb]} — change HQ_PAIRING_SECRET in both environment files and restart.`
}
