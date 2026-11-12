/**
 * The robots bundle hq is built with (ADR-0187): pinned, not stored. The pictures are a release asset of this
 * repository, fetched and checked against this SHA-256 by scripts/robots/fetch.mjs into hq/assets/robots/ — in the
 * image build, and once on a development machine. More robots are a new bundle and a new pin, never a changed one.
 *
 * Kept free of imports so the fetch script can read it with Node alone.
 */
export interface RobotsBundlePin {
  /** The bundle's name: also its release tag, and its archive's name without `.tar.gz`. */
  bundle: string
  version: number
  /** The repository whose release holds the archive, as `owner/name`. */
  repository: string
  /** The archive's public download address. */
  url: string
  sha256: string
}

export const ROBOTS_BUNDLE: RobotsBundlePin = {
  bundle: 'robots-1',
  version: 1,
  repository: 'solution84-com/agenthix',
  url: 'https://github.com/solution84-com/agenthix/releases/download/robots-1/robots-1.tar.gz',
  sha256: '46a924c98e14fc22cf02a25168858e18902d152b60617aa4e405c1c81422640e',
}
