/**
 * The move check's two requests on hq's address (core's `MOVE_CHECK_PATH` and `MOVE_PROOF_PATH`), open to anyone:
 * the check is what proves who is asking. The hashes are the ones hq already keeps — each site's credential, each
 * host service's machine credential, and the Fleet Console's lasting credential — never a credential itself.
 */
import { prisma } from 'wasp/server'
import type { MoveCheckApi, MoveProofApi } from 'wasp/server/api'
import type { MoveCheckSubject } from '@agenthix/core'
import { hqAddress } from '../auth/hqLinks'
import { Logger } from '../server/utils/logger'
import { MoveCheckDesk } from './moveCheck'

const logger = new Logger('MoveCheck')

/** The hashes of the credentials that may follow hq to a new address, of one kind. */
export async function moveCheckHashes(subject: MoveCheckSubject): Promise<string[]> {
  const rows = subject === 'site'
    ? await prisma.executionSite.findMany({ where: { revokedAt: null, credentialHash: { not: null } }, select: { credentialHash: true } })
    : subject === 'host'
      ? await prisma.relayHost.findMany({ where: { disconnectedAt: null, credentialHash: { not: null } }, select: { credentialHash: true } })
      : await prisma.consoleCredential.findMany({ orderBy: { issuedAt: 'desc' }, take: 1, select: { credentialHash: true } })
  return rows.flatMap(r => (r.credentialHash ? [r.credentialHash] : []))
}

export const moveCheckDesk = new MoveCheckDesk({ hashes: moveCheckHashes, ownAddress: hqAddress, log: line => logger.info(line) })

export const moveCheckHandler: MoveCheckApi = async (req, res) => {
  const reply = await moveCheckDesk.challenge(req.body)
  res.status(reply.status).json(reply.body)
}

export const moveProofHandler: MoveProofApi = async (req, res) => {
  const reply = await moveCheckDesk.proof(req.body)
  res.status(reply.status).json(reply.body)
}
