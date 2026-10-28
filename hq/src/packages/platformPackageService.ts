/**
 * The platform package every run loads (ruling P12). It no longer carries the built-in skills: hq installs those as
 * `agenthix/<name>` assets and gives each run the ones that apply to it (`assets/builtins/`, adr-0156), so a skill
 * switched off or meant only for a repository is never staged by this package. The package itself stays, empty, for
 * sites that expect one.
 */
import { PLATFORM_PACKAGE_KEY } from '@agenthix/core'
import { writePackage, type WriteResult } from './packageStore'

export async function writePlatformPackage(): Promise<WriteResult> {
  return writePackage({ kind: 'platform', key: PLATFORM_PACKAGE_KEY, files: [], updatedById: null })
}
