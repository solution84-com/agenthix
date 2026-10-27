/**
 * The host name the relay answers browsers on (adr-0114): `FILES_ORIGIN`'s host when it is set and is not hq's own,
 * `files.localhost` when hq is on localhost, and none otherwise — the rule hq-web's `web-files.sh` and hq's
 * `filesPlace` follow, so the three agree.
 */

/** A host name with no port, lowercase and without brackets or a trailing dot. */
export function hostOf(value: string | undefined): string {
  if (!value) return ''
  const h = value.trim().toLowerCase().replace(/\.$/, '')
  if (h.startsWith('[')) return h.slice(1, h.indexOf(']'))
  return h.replace(/:\d+$/, '').replace(/\.$/, '')
}

function urlHost(raw: string | undefined): string {
  if (!raw?.trim()) return ''
  try {
    return hostOf(new URL(raw.trim()).host)
  } catch {
    return ''
  }
}

export function filesHostOf(filesOrigin: string | undefined, hqUrl: string | undefined): string | null {
  const hqHost = urlHost(hqUrl)
  const set = urlHost(filesOrigin)
  if (set && set !== hqHost) return set
  if (hqHost === 'localhost' || hqHost.endsWith('.localhost')) return 'files.localhost'
  return null
}

/** Whether a request's Host header names the files host. */
export function isFilesHost(hostHeader: string | undefined, filesHost: string | null): boolean {
  return filesHost !== null && hostOf(hostHeader) === filesHost
}
