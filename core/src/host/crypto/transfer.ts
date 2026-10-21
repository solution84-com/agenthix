/**
 * A move's chunk signature (see ../transfer.ts): Ed25519 by the sending machine over the transfer, both machines'
 * fingerprints, the chunk's place, whether it is the last, and the SHA-256 of its bytes. hq, which relays the chunks,
 * holds neither machine's key, so it can neither alter a chunk nor make one up.
 */
import type { HostIdentity } from '../envelope.js'
import type { TransferChunk } from '../transfer.js'
import { importSigningPrivateKey, importSigningPublicKey, type HostKeys } from './keys.js'
import { canonical, fromBase64url, sha256, subtle, toBase64url, toHex, type Bytes } from './webCrypto.js'

const LABEL = 'host-transfer/1'

type Placed = { transferId: string; from: string; to: string; seq: number; last: boolean }

async function input(p: Placed, bytes: Bytes): Promise<Bytes> {
  return canonical([LABEL, p.transferId, p.from, p.to, p.seq, p.last ? 1 : 0, toHex(await sha256(bytes))])
}

/** One chunk of the sealed backup, signed by `sender` for the machine whose fingerprint is `to`. */
export async function signTransferChunk(
  sender: HostKeys, p: Placed, bytes: Bytes,
): Promise<TransferChunk> {
  const key = await importSigningPrivateKey(sender.signingPrivateKey)
  const sig = toBase64url(new Uint8Array(await subtle().sign({ name: 'Ed25519' }, key, await input(p, bytes))))
  return { transferId: p.transferId, seq: p.seq, last: p.last, data: toBase64url(bytes), sig }
}

/** The chunk's bytes, only when `sender` signed exactly this chunk, in this place, for this transfer; null otherwise. */
export async function verifyTransferChunk(
  chunk: TransferChunk, sender: HostIdentity, p: { from: string; to: string },
): Promise<Bytes | null> {
  const bytes = fromBase64url(chunk.data)
  const sig = fromBase64url(chunk.sig)
  if (!bytes || !sig || sig.length !== 64) return null
  const data = await input({ transferId: chunk.transferId, from: p.from, to: p.to, seq: chunk.seq, last: chunk.last }, bytes)
  const ok = await subtle().verify({ name: 'Ed25519' }, await importSigningPublicKey(sender), sig, data)
  return ok ? bytes : null
}
