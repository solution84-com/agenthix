/** The platform's built-in skills (ruling P12), written from hq's own image whenever they change. */
import path from 'node:path'
import { PLATFORM_PACKAGE_KEY } from '@agenthix/core'
import { assertAssetDir, getHqAssetsRoot } from '../server/hqAssets'
import { writePackage, type WriteResult } from './packageStore'
import { readSkillTree, SKILLS_DIR } from './skillFiles'

export async function writePlatformPackage(): Promise<WriteResult> {
  const dir = path.join(getHqAssetsRoot(), 'platform', 'skills')
  await assertAssetDir(dir)
  const files = await readSkillTree(dir, SKILLS_DIR)
  return writePackage({ kind: 'platform', key: PLATFORM_PACKAGE_KEY, files, updatedById: null })
}
