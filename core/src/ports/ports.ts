/**
 * Every port and address block the platform uses, in one place (docs/architecture/ports.md is written from it).
 * Plain data with no imports: the dev scripts read this file directly with Node.
 *
 * Our own numbers follow one convention — each service owns a hundred (41 hq, 42 site, 43 Fleet Console, 44 relay) and the
 * last two digits say what listens (00 the web page, 01 the server, 09 the database) — the same inside every
 * installation's containers and in dev, where nothing else of ours uses them. Only an installation's published
 * ports can clash with other software, so those are the machine admin's to choose, with quiet defaults.
 */

/** Our services' ports: inside every installation's containers, and in dev on the machine. */
export const SERVICE_PORTS = {
  hq: { web: 4100, server: 4101, database: 4109 },
  site: { server: 4201, database: 4209 },
  console: { web: 4300, server: 4301 },
  relay: { server: 4401 },
} as const

/**
 * What the agent's harness listens on inside an agent's container, on its loopback address only (the OpenCode server).
 * A live app may not take it.
 */
export const HARNESS_PORTS = { openCode: 4096 } as const

/** Inside containers, every database keeps PostgreSQL's own port: each is on a private network of its own. */
export const CONTAINER_DATABASE_PORT = 5432

/** Tailscale serve in dev, on the tailnet address only, in front of hq's web page and its server. */
export const DEV_TAILSCALE_PORTS = { hqWeb: 4443, hqServer: 4444 } as const

/**
 * What an installation publishes when its machine admin chooses nothing else: the quietest hundred in the
 * registered range, away from our own numbers, one pair to remember.
 */
export const PUBLISHED_DEFAULTS = { hq: 7800, console: 7801 } as const

/**
 * The ports a machine admin may choose: unprivileged, and below the range operating systems give to outgoing
 * connections (Linux from 32768), where a listener can lose its port at random. hq may also take 80 or 443.
 */
export const CHOSEN_PORT_RANGE = { first: 1024, last: 32767 } as const
export const HQ_STANDARD_PORTS = [80, 443] as const

/** The front door's ports, when it is on: an https address needs the standard ones. */
export const FRONT_DOOR_PORTS = [80, 443] as const

/** Address blocks for Docker networks: private addresses (RFC 1918), away from Docker's and routers' defaults. */
export const ADDRESS_BLOCKS = {
  /** An installation's own networks (console, hq, site, edge, hq link): a free /24 each. */
  installationNetworks: '10.214.0.0/16',
  /** Installations' agents: a slice of AGENT_SLICE_BITS per installation. */
  agents: '10.213.0.0/16',
  /** Dev's site's agents. */
  devAgents: '10.212.0.0/16',
  /** Networks that tests create. */
  tests: '10.211.0.0/16',
} as const

/** Each installation's agents get a /20 of `agents`: 4,096 addresses, sixteen installations with a site per machine. */
export const AGENT_SLICE_BITS = 20

/** Each agent container's own network: a /29, 8 addresses, so 512 agent containers at once per slice. */
export const AGENT_CONTAINER_BITS = 29

/**
 * Live previews' networks: the upper half of each installation's agent slice, a /21, so 256 networks of
 * AGENT_CONTAINER_BITS (a live preview's own and its services'). The host service closes this part to private addresses
 * and the machine's own public address on every machine, so a live preview reaches only the public internet and its own
 * site.
 */
export const LIVE_PREVIEW_PART_BITS = 21
