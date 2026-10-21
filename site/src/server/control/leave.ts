import { prisma } from '#db'
import { SITE_LEAVE_PATH } from '@agenthix/core'
import { hqConnectionManager } from '../hq/hqConnection'
import { readConnectionToken } from '../hq/connectionToken'
import { pairedBySecret } from '../registration/pairing'

/**
 * What leaving did at hq, in the site's own terms: it left; hq had already taken it out; hq could not be
 * reached; hq answered something else; or hq was not asked, holding no usable credential to ask with.
 */
export type LeaveOutcome = 'left' | 'alreadyRemoved' | 'unreachable' | 'failed' | 'notAsked'

export const DEFAULT_SITE_CANNOT_LEAVE =
  "This site comes with HQ: it connects by the pairing secret HQ and the site share, and it cannot leave HQ. Nothing was changed."

async function tellHqLeaving(hqUrl: string, token: string, siteId: string): Promise<LeaveOutcome | 'default'> {
  let res: Response
  try {
    res = await fetch(new URL(SITE_LEAVE_PATH, hqUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'X-Site-Id': siteId },
      signal: AbortSignal.timeout(5_000),
      redirect: 'error',
    })
  } catch {
    return 'unreachable'
  }
  if (res.ok) return 'left'
  // hq refuses its own site leaving (adr-0070), and does not know a credential it already removed.
  if (res.status === 409) return 'default'
  if (res.status === 401) return 'alreadyRemoved'
  return 'failed'
}

/**
 * Leaving hq. hq's own site cannot leave, so it is refused here before anything changes — hq would refuse it too,
 * and the link would come back from the pairing secret at the next start. Any other site forgets its credential
 * whatever hq answered: the machine can always leave.
 */
export async function unregister(): Promise<{ toldHq: boolean; hq: LeaveOutcome }> {
  if (pairedBySecret()) throw new Error(DEFAULT_SITE_CANNOT_LEAVE)
  const link = await prisma.hqConnection.findFirst()
  if (!link) throw new Error('This site is not registered.')
  const config = await prisma.siteConfig.findFirst()
  if (!config) throw new Error('SiteConfig is missing — cannot determine this site’s identity')

  const token = readConnectionToken(link.connectionToken)
  let hq: LeaveOutcome = link.status === 'REVOKED' ? 'alreadyRemoved' : 'notAsked'
  if (link.status !== 'REVOKED' && token && link.hqUrl) {
    const told = await tellHqLeaving(link.hqUrl, token, config.siteId)
    if (told === 'default') throw new Error(DEFAULT_SITE_CANNOT_LEAVE)
    hq = told
  }
  hqConnectionManager.stop()
  await prisma.hqConnection.deleteMany({})
  return { toldHq: hq === 'left', hq }
}
