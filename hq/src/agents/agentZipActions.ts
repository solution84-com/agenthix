/**
 * Agent ZIP Actions
 * =================
 * An agent's export is an agent template package (format 2, `agentPackageExport.ts`): the Library installs it
 * through the install pipeline, with the skills it needs inside, and an agent is then made from it. An import here
 * takes an agent archive from before packages; a package of any kind belongs in the Library and is refused here.
 */
import type { ExportAgent, ImportAgent } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { ASSET_MANIFEST_FILE } from '@agenthix/core'
import { requireRole } from '../server/identity/requireRole'
import { packageWriteOrHttp } from '../packages/writeErrors'
import { importAgentZip, type ImportAgentResult } from './agentZipService'
import { AgentExportError, exportAgentPackage } from './agentPackageExport'
import { NoOrganisationError } from '../assets/organisationPublisher'
import { writePackageZip } from '../library/packages/packageZip'
import { PackageReadError, readZipPackage } from '../assets/install/archive'

type ExportAgentArgs = { agentId: string }
type ExportAgentResult = { base64: string; filename: string }

export const exportAgent: ExportAgent<ExportAgentArgs, ExportAgentResult> = async ({ agentId }, context) => {
  await requireRole(context, 'ADMIN', 'Exporting an agent')
  try {
    const { root, files } = await exportAgentPackage(agentId)
    const buffer = await writePackageZip(root, null, files)
    return { base64: buffer.toString('base64'), filename: `${root}.zip` }
  } catch (err) {
    if (err instanceof AgentExportError) throw new HttpError(404, err.message)
    if (err instanceof NoOrganisationError) throw new HttpError(409, err.message)
    throw err
  }
}

type ImportAgentArgs = { base64: string }

export const importAgent: ImportAgent<ImportAgentArgs, ImportAgentResult> = async ({ base64 }, context) => {
  // An import writes the agent's content (P15).
  await requireRole(context, 'ADMIN', 'Importing an agent')
  const buffer = Buffer.from(base64, 'base64')
  let packaged = false
  try {
    packaged = (await readZipPackage(buffer)).files.some(f => f.path === ASSET_MANIFEST_FILE)
  } catch (err) {
    if (!(err instanceof PackageReadError)) throw err
    // A malformed archive is refused by the agent import below, in its own words.
  }
  if (packaged) throw new HttpError(400, 'This is a package: install it in the Library, then add an agent from it. Nothing was changed.')
  return packageWriteOrHttp(() => importAgentZip(buffer, context.user!.id))
}
