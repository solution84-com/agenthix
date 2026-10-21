/**
 * The backup location Agenthix Cloud sets (pre-release spec B4) as the same five actions a folder offers
 * (`io.ts`'s `folder`): an S3-compatible store, a backup at `<prefix><backup id>`. The store's own file names
 * (`<machine>-<when>-<kind>-<id>.sealed`) are rebuilt from each object's header, which is readable without a key,
 * so everything above this reads a folder and never learns the difference.
 *
 * The store keeps every backup for 30 days and refuses to delete one sooner, so a refused delete is expected, not a
 * failure: expiry is the store's. Nothing here logs a credential, a bucket or a key.
 */
import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, DeleteObjectCommand,
  GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client, UploadPartCommand,
} from '@aws-sdk/client-s3'
import type { Bytes } from './io'
import { readHeader } from './seal'
import { backupIdOfFileName, fileNameOf } from './store'

/** What the folder uses of an S3 client; the real one is `S3Client`, and tests stand in a fake. */
export type S3Like = { send: (command: never) => Promise<unknown> }

export type CloudLocationAccess = {
  endpoint: string; bucket: string; prefix: string; region: string
  accessKeyId: string; secretAccessKey: string; sessionToken: string
}

/** Smaller than this is one request; larger goes in parts of this size. */
const PART_BYTES = 16 * 1024 * 1024
const HEADER_BYTES = 128 * 1024
const ID = /^[0-9a-f]{8}$/

export function s3ClientFor(access: CloudLocationAccess): S3Like {
  return new S3Client({
    endpoint: access.endpoint,
    region: access.region,
    forcePathStyle: true,
    credentials: { accessKeyId: access.accessKeyId, secretAccessKey: access.secretAccessKey, sessionToken: access.sessionToken },
  })
}

const send = <T>(client: S3Like, command: unknown): Promise<T> => client.send(command as never) as Promise<T>

/** The store refused the action because of what it is told about the object (a lock, a retention), not because of a fault. */
export function isRefusedByStore(err: unknown): boolean {
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } } | null
  if (!e) return false
  return e.$metadata?.httpStatusCode === 403 || ['AccessDenied', 'ObjectLocked', 'InvalidObjectState'].includes(e.name ?? e.Code ?? '')
}

async function* bodyBytes(body: unknown): Bytes {
  if (!body || typeof (body as AsyncIterable<unknown>)[Symbol.asyncIterator] !== 'function') throw new Error('the store sent no data')
  for await (const chunk of body as AsyncIterable<Uint8Array | string>) yield Buffer.from(chunk)
}

export function s3Folder(client: S3Like, where: Pick<CloudLocationAccess, 'bucket' | 'prefix'>) {
  const keyOf = (name: string) => {
    const id = backupIdOfFileName(name)
    if (!id) throw new Error('that is not the name of a backup')
    return `${where.prefix}${id}`
  }

  async function* read(key: string, range?: string): Bytes {
    const got = await send<{ Body?: unknown }>(client, new GetObjectCommand({ Bucket: where.bucket, Key: key, Range: range }))
    yield* bodyBytes(got.Body)
  }

  async function upload(key: string, bytes: Bytes): Promise<void> {
    const parts: { ETag: string; PartNumber: number }[] = []
    let uploadId: string | undefined
    let held: Buffer[] = []
    let heldBytes = 0
    const sendPart = async (body: Buffer) => {
      if (!uploadId) {
        const made = await send<{ UploadId?: string }>(client, new CreateMultipartUploadCommand({ Bucket: where.bucket, Key: key }))
        uploadId = made.UploadId
        if (!uploadId) throw new Error('the store did not start the upload')
      }
      const PartNumber = parts.length + 1
      const done = await send<{ ETag?: string }>(client, new UploadPartCommand({ Bucket: where.bucket, Key: key, UploadId: uploadId, PartNumber, Body: body }))
      if (!done.ETag) throw new Error('the store did not confirm a part')
      parts.push({ ETag: done.ETag, PartNumber })
    }
    try {
      for await (const chunk of bytes) {
        held.push(chunk)
        heldBytes += chunk.length
        if (heldBytes >= PART_BYTES) {
          await sendPart(Buffer.concat(held))
          held = []
          heldBytes = 0
        }
      }
      if (!uploadId) {
        await send(client, new PutObjectCommand({ Bucket: where.bucket, Key: key, Body: Buffer.concat(held) }))
        return
      }
      if (heldBytes > 0) await sendPart(Buffer.concat(held))
      await send(client, new CompleteMultipartUploadCommand({ Bucket: where.bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts } }))
    } catch (err) {
      if (uploadId) await send(client, new AbortMultipartUploadCommand({ Bucket: where.bucket, Key: key, UploadId: uploadId })).catch(() => {})
      throw err
    }
  }

  return {
    /** Whether the store answers for this prefix: null when it does, else what failed, in words. */
    async testWrite(): Promise<string | null> {
      try {
        await send(client, new ListObjectsV2Command({ Bucket: where.bucket, Prefix: where.prefix, MaxKeys: 1 }))
        return null
      } catch (err) {
        return err instanceof Error ? err.message : String(err)
      }
    },

    async list(): Promise<{ name: string; sizeBytes: number }[]> {
      const out: { name: string; sizeBytes: number }[] = []
      let token: string | undefined
      do {
        const page = await send<{ Contents?: { Key?: string; Size?: number }[]; NextContinuationToken?: string }>(
          client, new ListObjectsV2Command({ Bucket: where.bucket, Prefix: where.prefix, ContinuationToken: token }),
        )
        for (const object of page.Contents ?? []) {
          const id = object.Key?.slice(where.prefix.length)
          if (!object.Key || !id || !ID.test(id)) continue
          try {
            const header = await readHeader(read(object.Key, `bytes=0-${HEADER_BYTES - 1}`))
            if (header.id === id) out.push({ name: fileNameOf(header), sizeBytes: object.Size ?? 0 })
          } catch {
            // Not readable as a backup: neither listed nor removed.
          }
        }
        token = page.NextContinuationToken
      } while (token)
      return out
    },

    read: (name: string): Bytes => read(keyOf(name)),

    write: (name: string, bytes: Bytes): Promise<void> => upload(keyOf(name), bytes),

    async remove(name: string): Promise<void> {
      try {
        await send(client, new DeleteObjectCommand({ Bucket: where.bucket, Key: keyOf(name) }))
      } catch (err) {
        // Locked until its 30 days pass: the store expires it.
        if (!isRefusedByStore(err)) throw err
      }
    },
  }
}
