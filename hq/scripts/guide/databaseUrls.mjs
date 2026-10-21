// The guide databases' names and addresses, shared by with-guide-db.mjs and the sample
// organisation's seed. Pure: nothing here reads a file, the environment or the network.

import { join } from 'node:path'

export const HQ_GUIDE_DB_NAME = 'agenthix_guide'
export const SITE_GUIDE_DB_NAME = 'agenthix_site_guide'

/** The same server and credentials as `baseUrl`, with only the database name swapped. */
export function urlWithDatabase(baseUrl, name) {
  const u = new URL(baseUrl)
  u.pathname = `/${name}`
  return u.toString()
}

/** The database name as Postgres sees it, after the URL's own encoding round trip. */
export function databaseNameOf(url) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
}

/** Throws unless `url` names a database ending in `_guide`, so a destructive step can never reach other data. */
export function assertGuideDatabase(url, what) {
  let name
  try {
    name = databaseNameOf(url)
  } catch {
    throw new Error(`refusing to run: the ${what} database address is not a URL.`)
  }
  if (!name.endsWith('_guide')) {
    throw new Error(`refusing to run: the ${what} database "${name}" does not end in "_guide".`)
  }
  return name
}

/**
 * Where each app's guide database is. An explicit address wins (CI supplies both); otherwise it is the
 * developer's own dev address with the database name swapped.
 */
export function guideUrls({ env, hqDevUrl, siteDevUrl }) {
  const hq = env.GUIDE_HQ_DATABASE_URL
    ?? (hqDevUrl ? urlWithDatabase(hqDevUrl, env.GUIDE_HQ_DB_NAME ?? HQ_GUIDE_DB_NAME) : null)
  const site = env.GUIDE_SITE_DATABASE_URL
    ?? (siteDevUrl ? urlWithDatabase(siteDevUrl, env.GUIDE_SITE_DB_NAME ?? SITE_GUIDE_DB_NAME) : null)
  if (!hq) throw new Error('no address for the guide database of hq: set GUIDE_HQ_DATABASE_URL, or DATABASE_URL in hq/.env.server.')
  if (!site) throw new Error('no address for the guide database of the site: set GUIDE_SITE_DATABASE_URL, or DATABASE_URL in site/.env.server.')
  assertGuideDatabase(hq, 'hq')
  assertGuideDatabase(site, 'site')
  return { hq, site }
}

/**
 * Where hq keeps its own files while the guide's screenshots are made: the caller's HQ_STORAGE_ROOT if it set one,
 * otherwise a directory under the temporary one. Without it Infrastructure reads "Kept beside the build", which is
 * true of no installed HQ.
 */
export function guideStorageRoot(env, tmp) {
  return env.HQ_STORAGE_ROOT || join(tmp, 'agenthix-guide-hq-storage')
}
