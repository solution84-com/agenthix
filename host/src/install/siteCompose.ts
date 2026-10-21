/**
 * The site's compose project, whichever kind of site it is: HQ's default site, connected by the pairing secret, or a
 * site a Fleet Console added, which presents the credential this machine made for it (spec §6, step 5). Every writer
 * of the site's compose file goes through here, so an upgrade, a rollback or a restore never gives an added site the
 * default site's connection.
 */
import crypto from 'node:crypto'
import { defaultSiteProject, siteProject, type MachinePaths, type SiteSettings } from '../compose/projects'
import type { InstallSubnets } from '../compose/subnets'
import type { StateFolder } from '../state/folder'
import type { InstallNames } from '../state/namespace'
import type { InstallSecrets } from '../state/secrets'

const CREDENTIAL = ['site', 'credential.json']

export function siteComposeProject(
  state: StateFolder, names: InstallNames, site: SiteSettings, secrets: InstallSecrets, paths: MachinePaths, subnets: InstallSubnets,
) {
  if (!site.hqUrl) return defaultSiteProject(names, site, secrets, paths, subnets)
  // Without its credential the site starts unconnected rather than with anyone else's.
  const hq = { hqUrl: site.hqUrl, credential: readSiteCredential(state) ?? '', onHqLinkNetwork: false }
  return siteProject(names, site, secrets, paths, hq, subnets)
}

export function readSiteCredential(state: StateFolder): string | null {
  try {
    const v = state.readJson(...CREDENTIAL) as { credential?: unknown } | null
    return typeof v?.credential === 'string' && v.credential.length >= 32 ? v.credential : null
  } catch {
    return null
  }
}

/** When the site's credential was made; null when it has none. */
export function siteCredentialMadeAt(state: StateFolder): string | null {
  try {
    const v = state.readJson(...CREDENTIAL) as { madeAt?: unknown } | null
    return typeof v?.madeAt === 'string' ? v.madeAt : null
  } catch {
    return null
  }
}

/** A new credential for the site, kept here; what leaves the machine is only its hash. */
export function makeSiteCredential(state: StateFolder, now: Date): { credential: string; hash: string } {
  const credential = crypto.randomBytes(32).toString('hex')
  state.writeJson(CREDENTIAL, { credential, madeAt: now.toISOString() })
  return { credential, hash: crypto.createHash('sha256').update(credential).digest('hex') }
}
