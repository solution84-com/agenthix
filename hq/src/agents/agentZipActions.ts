/**
 * Agent ZIP Actions
 * =================
 * Wasp action wrappers for agent ZIP export and import.
 * Business logic lives in agentZipService.ts.
 *
 * An export is the library's package of kind agent (library/packages): the
 * agent archive with a package.json beside its agent.json, recording that it
 * was made here, its version and its publisher, the organisation. An import
 * takes such a package, or an archive from before packages; a package of
 * another kind belongs in the library and is refused here.
 */
import JSZip from 'jszip'
import type { ExportAgent, ImportAgent } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { requireRole } from '../server/identity/requireRole'
import { packageWriteOrHttp } from '../packages/writeErrors'
import { exportAgentZip, importAgentZip, type ImportAgentResult } from './agentZipService'
import { readPackageZip, PackageZipError } from '../library/packages/packageZip'
import { PACKAGE_FORMAT, PACKAGE_MANIFEST_FILE, type PackageManifest } from '../library/packages/packageManifest'

type ExportAgentArgs = { agentId: string }
type ExportAgentResult = { base64: string; filename: string }

export const exportAgent: ExportAgent<ExportAgentArgs, ExportAgentResult> = async ({ agentId }, context) => {
  await requireRole(context, 'ADMIN', 'Exporting an agent')
  const { buffer, handle } = await exportAgentZip(agentId)
  const [agent, org] = await Promise.all([
    prisma.agent.findUnique({ where: { id: agentId }, select: { name: true, role: true } }),
    prisma.org.findFirst({ select: { name: true } }),
  ])
  const manifest: PackageManifest = {
    format: PACKAGE_FORMAT,
    kind: 'agent',
    name: agent?.name ?? handle,
    description: agent?.role ?? '',
    source: 'made_here',
    version: '1',
    publisher: org?.name ?? null,
  }
  const zip = await JSZip.loadAsync(buffer)
  zip.file(`${handle}/${PACKAGE_MANIFEST_FILE}`, JSON.stringify(manifest, null, 2))
  const packaged = await zip.generateAsync({ type: 'nodebuffer' })
  return { base64: packaged.toString('base64'), filename: `${handle}.zip` }
}

type ImportAgentArgs = { base64: string }

export const importAgent: ImportAgent<ImportAgentArgs, ImportAgentResult> = async ({ base64 }, context) => {
  // An import writes the agent's content (P15).
  await requireRole(context, 'ADMIN', 'Importing an agent')
  const buffer = Buffer.from(base64, 'base64')
  let kind: string | null = null
  try {
    kind = (await readPackageZip(buffer)).manifest?.kind ?? null
  } catch (err) {
    if (!(err instanceof PackageZipError)) throw err
    // A malformed archive is refused by the agent import below, in its own words.
  }
  if (kind !== null && kind !== 'agent') throw new HttpError(400, `This is a ${kind} package: import it in the Library`)
  return packageWriteOrHttp(() => importAgentZip(buffer, context.user!.id))
}
