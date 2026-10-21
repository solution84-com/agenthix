/**
 * The built-in agent is an agent like any other (ruling P13): its
 * content is written at boot from its asset files — until a person edits it.
 * From then on boot keeps that person's content. Its approval starts Deferred,
 * the schema's default, and is the organisation's to change.
 */
import path from 'node:path'
import type { Agent } from '@prisma/client'
import { assertAssetDir, getHqAssetsRoot } from '../server/hqAssets'
import { getCurrentPackage, type WriteResult } from './packageStore'
import { writeAgentContent } from './agentPackageService'
import { readAssetContent } from './agentAssets'
import { SKILLS_DIR } from './skillFiles'

export async function ensureKernelDefinition(kernel: Agent): Promise<WriteResult> {
  const current = await getCurrentPackage('agent', kernel.id)
  if (current?.updatedById) return { ref: current.ref, changed: false }
  const dir = path.join(getHqAssetsRoot(), 'library', 'agents', 'kernel')
  await assertAssetDir(dir)
  await assertAssetDir(path.join(dir, SKILLS_DIR))
  return writeAgentContent(kernel.id, await readAssetContent(dir, 'all'), null)
}
