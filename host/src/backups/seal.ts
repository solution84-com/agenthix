/**
 * How a backup is sealed (adr-0112): a file only the holder of its key can read, written and read as a stream so
 * that a backup of any size never sits whole in memory.
 *
 * Built from the platform's own primitives (Node's X25519, HKDF-SHA-256 and AES-256-GCM), composed the standard
 * way, because core's envelopes are for messages of a few hundred kilobytes that expire, and a backup is neither:
 *
 * - **The file key**: 32 random bytes, one per backup. The chunks are sealed under a key derived from it.
 * - **The wrap**: the file key sealed to the holder's X25519 public key, with a one-time key (ECIES). A holder's
 *   private key comes from its secret — the machine's own, or the key shown to a person — so the machine can seal
 *   a copy to a person's key while keeping only its public half.
 * - **The chunks**: AES-256-GCM over at most 1 MiB each, the nonce a counter and a flag on the last chunk (the
 *   STREAM construction), so a chunk cannot be dropped, reordered, repeated or cut off at the end unnoticed.
 *
 * The header is in the clear, so a restore can list what a folder holds before asking for a key, and it is bound
 * into the wrap and every chunk, so changing it makes the file unreadable. The wrap is not bound into the chunks:
 * a copy for another holder is the same chunks under a new wrap (`rewrapSealed`), with no need to decrypt them.
 *
 * Layout: MAGIC · u32 header length · header JSON · u32 wrap length · wrap JSON · (u32 length · chunk)…
 */
import crypto, { type KeyObject } from 'node:crypto'
import { ByteReader } from './byteReader'
import { DamagedBackup, WrongKey } from './errors'

export { DamagedBackup, WrongKey }

const MAGIC = Buffer.from('SEALBK01', 'ascii')
const CHUNK = 1024 * 1024
const MAX_META = 64 * 1024
const X25519_PKCS8 = Buffer.from('302e020100300506032b656e04220420', 'hex')
const X25519_SPKI = Buffer.from('302a300506032b656e032100', 'hex')

export type HostTargetName = 'hq' | 'site'

/** What anyone may read of a backup without its key; bound into everything that is sealed. */
export type BackupHeader = {
  format: 1
  id: string
  kind: 'nightly' | 'now' | 'beforeRestore' | 'beforeUpgrade'
  /** The install's recorded namespace (spec §17): a restore refuses a backup from another. */
  namespace: string
  machine: string
  siteName: string
  holds: HostTargetName[]
  /** The night it belongs to, `YYYY-MM-DD`: the evening before the backup time. */
  night: string
  takenAt: string
  /** The version of HQ and the site it was taken from; a restore refuses one newer than it runs. */
  version: string
  hqAddress: string | null
  salt: string
}

type Wrap = { epk: string; iv: string; ct: string }

/** A holder's key pair, from its secret. */
export type Holder = { privateKey: KeyObject; publicKey: Buffer }

export function holderFrom(secret: Buffer): Holder {
  const seed = Buffer.from(crypto.hkdfSync('sha256', secret, Buffer.alloc(0), 'backup-holder/1', 32))
  const privateKey = crypto.createPrivateKey({ key: Buffer.concat([X25519_PKCS8, seed]), format: 'der', type: 'pkcs8' })
  const spki = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' })
  return { privateKey, publicKey: Buffer.from(spki.subarray(spki.length - 32)) }
}

const publicKeyObject = (raw: Buffer) => crypto.createPublicKey({ key: Buffer.concat([X25519_SPKI, raw]), format: 'der', type: 'spki' })
const b64 = (b: Buffer) => b.toString('base64url')
const digest = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest()

function wrapKeyFor(shared: Buffer, salt: Buffer, epk: Buffer, recipient: Buffer): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', shared, salt, Buffer.concat([Buffer.from('backup-wrap/1'), epk, recipient]), 32))
}

function wrapFileKey(fileKey: Buffer, headerBytes: Buffer, salt: Buffer, recipient: Buffer): Wrap {
  const eph = crypto.generateKeyPairSync('x25519')
  const epkDer = eph.publicKey.export({ format: 'der', type: 'spki' })
  const epk = Buffer.from(epkDer.subarray(epkDer.length - 32))
  const shared = crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: publicKeyObject(recipient) })
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', wrapKeyFor(shared, salt, epk, recipient), iv)
  cipher.setAAD(digest(headerBytes))
  const ct = Buffer.concat([cipher.update(fileKey), cipher.final(), cipher.getAuthTag()])
  return { epk: b64(epk), iv: b64(iv), ct: b64(ct) }
}

function unwrapFileKey(wrap: Wrap, headerBytes: Buffer, salt: Buffer, holder: Holder): Buffer {
  try {
    const epk = Buffer.from(wrap.epk, 'base64url')
    const ct = Buffer.from(wrap.ct, 'base64url')
    const shared = crypto.diffieHellman({ privateKey: holder.privateKey, publicKey: publicKeyObject(epk) })
    const decipher = crypto.createDecipheriv('aes-256-gcm', wrapKeyFor(shared, salt, epk, holder.publicKey), Buffer.from(wrap.iv, 'base64url'))
    decipher.setAAD(digest(headerBytes))
    decipher.setAuthTag(ct.subarray(ct.length - 16))
    return Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()])
  } catch {
    throw new WrongKey()
  }
}

function chunkKey(fileKey: Buffer, salt: Buffer): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', fileKey, salt, 'backup-chunks/1', 32))
}

function nonce(counter: number, last: boolean): Buffer {
  const iv = Buffer.alloc(12)
  iv.writeUIntBE(counter, 5, 6)
  iv[11] = last ? 1 : 0
  return iv
}

const u32 = (n: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

async function readMeta(reader: ByteReader, what: string): Promise<Buffer> {
  const len = await reader.read(4)
  if (!len) throw new DamagedBackup(`its ${what} is missing`)
  const n = len.readUInt32BE()
  if (n === 0 || n > MAX_META) throw new DamagedBackup(`its ${what} is not one this host service reads`)
  return (await reader.read(n))!
}

export function parseHeader(bytes: Buffer): BackupHeader {
  let h: Record<string, unknown>
  try {
    h = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>
  } catch {
    throw new DamagedBackup('its description is not readable')
  }
  const str = (k: string) => typeof h[k] === 'string'
  if (h.format !== 1 || !['id', 'kind', 'namespace', 'machine', 'siteName', 'night', 'takenAt', 'version', 'salt'].every(str)
    || !Array.isArray(h.holds) || !h.holds.every(t => t === 'hq' || t === 'site')) {
    throw new DamagedBackup('its description is not one this host service reads')
  }
  return h as unknown as BackupHeader
}

type Opened = { header: BackupHeader; headerBytes: Buffer; wrap: Wrap; reader: ByteReader }

async function openFrame(source: AsyncIterable<Buffer>): Promise<Opened> {
  const reader = new ByteReader(source[Symbol.asyncIterator]())
  const magic = await reader.read(MAGIC.length)
  if (!magic || !magic.equals(MAGIC)) throw new DamagedBackup('it is not a sealed backup')
  const headerBytes = await readMeta(reader, 'description')
  const header = parseHeader(headerBytes)
  const wrapBytes = await readMeta(reader, 'key slot')
  let wrap: Wrap
  try {
    wrap = JSON.parse(wrapBytes.toString('utf8')) as Wrap
  } catch {
    throw new DamagedBackup('its key slot is not readable')
  }
  if (typeof wrap?.epk !== 'string' || typeof wrap.iv !== 'string' || typeof wrap.ct !== 'string') throw new DamagedBackup('its key slot is not readable')
  return { header, headerBytes, wrap, reader }
}

/** The header alone, read from the start of a sealed backup; nothing else is read. */
export async function readHeader(source: AsyncIterable<Buffer>): Promise<BackupHeader> {
  const { header, reader } = await openFrame(source)
  await reader.close()
  return header
}

/** One record of what a backup holds: a part begins, some of its bytes, it ends. The last record closes the backup. */
export type SealedRecord =
  | { type: 'begin'; name: string }
  | { type: 'data'; bytes: Buffer }
  | { type: 'end' }

const TYPE = { begin: 1, data: 2, end: 3, close: 4 } as const

function encode(r: SealedRecord): Buffer {
  if (r.type === 'begin') return Buffer.concat([Buffer.from([TYPE.begin]), Buffer.from(r.name, 'utf8')])
  if (r.type === 'data') return Buffer.concat([Buffer.from([TYPE.data]), r.bytes])
  return Buffer.from([TYPE.end])
}

/** Splits each data record so that no chunk holds more than `CHUNK` bytes. */
async function* sized(records: AsyncIterable<SealedRecord>): AsyncGenerator<Buffer> {
  for await (const r of records) {
    if (r.type !== 'data') {
      yield encode(r)
      continue
    }
    for (let at = 0; at < r.bytes.length; at += CHUNK - 1) {
      yield encode({ type: 'data', bytes: r.bytes.subarray(at, at + CHUNK - 1) })
    }
  }
}

export function newHeader(fields: Omit<BackupHeader, 'format' | 'salt'>): BackupHeader {
  return { format: 1, ...fields, salt: b64(crypto.randomBytes(16)) }
}

/** Seals what `records` yields to the holder of `recipient`'s private key, as a stream of the file's bytes. */
export async function* sealBackup(header: BackupHeader, recipient: Buffer, records: AsyncIterable<SealedRecord>): AsyncGenerator<Buffer> {
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8')
  const salt = Buffer.from(header.salt, 'base64url')
  const fileKey = crypto.randomBytes(32)
  const key = chunkKey(fileKey, salt)
  const aad = digest(headerBytes)
  const wrapBytes = Buffer.from(JSON.stringify(wrapFileKey(fileKey, headerBytes, salt, recipient)), 'utf8')
  yield Buffer.concat([MAGIC, u32(headerBytes.length), headerBytes, u32(wrapBytes.length), wrapBytes])
  let counter = 0
  const seal = (plain: Buffer, last: boolean) => {
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce(counter++, last))
    cipher.setAAD(aad)
    const ct = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()])
    return Buffer.concat([u32(ct.length), ct])
  }
  for await (const plain of sized(records)) yield seal(plain, false)
  yield seal(Buffer.from([TYPE.close]), true)
}

export type OpenedBackup = { header: BackupHeader; records: AsyncGenerator<SealedRecord> }

/**
 * Opens a sealed backup with its holder's key. A wrong key is refused here, before any record is read; a record
 * that does not authenticate, and a backup cut short, stop the records with `DamagedBackup`.
 */
export async function openBackup(source: AsyncIterable<Buffer>, holder: Holder): Promise<OpenedBackup> {
  const { header, headerBytes, wrap, reader } = await openFrame(source)
  const salt = Buffer.from(header.salt, 'base64url')
  let fileKey: Buffer
  try {
    fileKey = unwrapFileKey(wrap, headerBytes, salt, holder)
  } catch (err) {
    await reader.close()
    throw err
  }
  const key = chunkKey(fileKey, salt)
  const aad = digest(headerBytes)
  async function* records(): AsyncGenerator<SealedRecord> {
    try {
      yield* chunks()
    } finally {
      await reader.close()
    }
  }
  async function* chunks(): AsyncGenerator<SealedRecord> {
    let counter = 0
    for (;;) {
      const len = await reader.read(4)
      if (!len) throw new DamagedBackup('it ends before its last part')
      const n = len.readUInt32BE()
      if (n < 17 || n > CHUNK + 16) throw new DamagedBackup('a part of it has the wrong length')
      const ct = (await reader.read(n))!
      let plain: Buffer | null = null
      let last = false
      for (const flag of [false, true]) {
        try {
          const d = crypto.createDecipheriv('aes-256-gcm', key, nonce(counter, flag))
          d.setAAD(aad)
          d.setAuthTag(ct.subarray(n - 16))
          plain = Buffer.concat([d.update(ct.subarray(0, n - 16)), d.final()])
          last = flag
          break
        } catch {
          // Tried as an ordinary chunk, then as the last.
        }
      }
      if (!plain) throw new DamagedBackup('a part of it does not match its seal')
      counter++
      if (last) {
        if (plain.length !== 1 || plain[0] !== TYPE.close || (await reader.read(1)) !== null) throw new DamagedBackup('it goes on after its end')
        return
      }
      const type = plain[0]
      if (type === TYPE.begin) yield { type: 'begin', name: plain.subarray(1).toString('utf8') }
      else if (type === TYPE.data) yield { type: 'data', bytes: plain.subarray(1) }
      else if (type === TYPE.end) yield { type: 'end' }
      else throw new DamagedBackup('a part of it is not one this host service reads')
    }
  }
  return { header, records: records() }
}

/**
 * The same backup for another holder: the old holder's key opens the wrap, the file key is sealed to the new
 * recipient, and the chunks pass through unread. Refuses a wrong key before yielding anything.
 */
export async function rewrapBackup(source: AsyncIterable<Buffer>, holder: Holder, recipient: Buffer): Promise<{ header: BackupHeader; bytes: AsyncGenerator<Buffer> }> {
  const { header, headerBytes, wrap, reader } = await openFrame(source)
  const salt = Buffer.from(header.salt, 'base64url')
  let fileKey: Buffer
  try {
    fileKey = unwrapFileKey(wrap, headerBytes, salt, holder)
  } catch (err) {
    await reader.close()
    throw err
  }
  const wrapBytes = Buffer.from(JSON.stringify(wrapFileKey(fileKey, headerBytes, salt, recipient)), 'utf8')
  async function* bytes(): AsyncGenerator<Buffer> {
    yield Buffer.concat([MAGIC, u32(headerBytes.length), headerBytes, u32(wrapBytes.length), wrapBytes])
    yield* reader.rest()
  }
  return { header, bytes: bytes() }
}
