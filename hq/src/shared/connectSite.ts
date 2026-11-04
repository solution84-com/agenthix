export type SiteStatusMeaning = { tone: 'ok' | 'wait' | 'off'; label: string; what: string }

const DEFAULT_SITE_DOWN =
  "The site service is not running. Runs will fail until it is. On HQ's machine, `agenthix status` says why and what to do next; in development, run `[dev] Start All`. It reconnects by itself."

/** What a site's status means to the person reading the list, and what to do about it. */
export function siteStatusMeaning(site: { status: string; isDefault: boolean }): SiteStatusMeaning {
  if (site.isDefault && site.status !== 'VERSION_MISMATCH') {
    return site.status === 'ONLINE'
      ? { tone: 'ok', label: 'Online', what: 'Connected. Agents run here.' }
      : { tone: 'off', label: 'Offline', what: DEFAULT_SITE_DOWN }
  }
  switch (site.status) {
    case 'ONLINE':
      return { tone: 'ok', label: 'Online', what: 'Connected.' }
    case 'REGISTERED':
      return {
        tone: 'wait',
        label: 'Registered — not yet connected',
        what: "It has registered but has not connected. Check that its machine can reach hq's address and that the site is running.",
      }
    case 'OFFLINE':
      return { tone: 'off', label: 'Offline', what: 'hq cannot reach it. Check the machine is on and the site is running.' }
    case 'VERSION_MISMATCH':
      return {
        tone: 'wait',
        label: 'Needs upgrading',
        what: 'It runs a different protocol version than hq. Upgrade the site and it reconnects by itself.',
      }
    case 'REVOKED':
      return { tone: 'off', label: 'Revoked', what: 'A fleet admin removed this site.' }
    default:
      return { tone: 'wait', label: site.status, what: '' }
  }
}

const LOCAL_HOSTNAMES = new Set(['localhost', '::1', '[::1]', '0.0.0.0'])

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return LOCAL_HOSTNAMES.has(host) || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
}

/** The warning to show when hq's own address cannot be opened from another computer, or null. */
export function hqAddressProblem(hqUrl: string): string | null {
  let hostname: string
  try {
    hostname = new URL(hqUrl).hostname
  } catch {
    return null
  }
  if (!isLocalHost(hostname)) return null
  return (
    `Other machines can't reach hq at ${hqUrl}. To connect a site on another computer, first set hq's address (\`HQ_URL\`) ` +
    'to one that computer can open — for example `http://192.168.1.20:4101` on a local network, or `https://hq.example.com` — then restart hq.'
  )
}
