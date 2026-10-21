/** An S3-compatible store in memory, for tests: what the five commands `s3Folder` uses do, and nothing reaches a network. */
import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, DeleteObjectCommand,
  GetObjectCommand, ListObjectsV2Command, PutObjectCommand, UploadPartCommand,
} from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import type { CloudLocationAccess, S3Like } from '../s3Folder'

export class FakeS3 implements S3Like {
  objects = new Map<string, Buffer>()
  /** Deleting is refused, as the store does for an object it keeps for 30 days. */
  locked = false
  /** Every command's name, in order. */
  sent: string[] = []
  /** The access each client was made with. */
  madeWith: CloudLocationAccess[] = []
  private uploads = new Map<string, Map<number, Buffer>>()

  client = (access: CloudLocationAccess): S3Like => {
    this.madeWith.push(access)
    return this
  }

  async send(command: never): Promise<unknown> {
    const c = command as unknown
    this.sent.push((c as { constructor: { name: string } }).constructor.name)
    if (c instanceof PutObjectCommand) {
      this.objects.set(c.input.Key!, Buffer.from(c.input.Body as Buffer))
      return {}
    }
    if (c instanceof GetObjectCommand) {
      const whole = this.objects.get(c.input.Key!)
      if (!whole) throw Object.assign(new Error('The specified key does not exist.'), { name: 'NoSuchKey' })
      const m = /^bytes=(\d+)-(\d+)$/.exec(c.input.Range ?? '')
      return { Body: Readable.from([m ? whole.subarray(Number(m[1]), Number(m[2]) + 1) : whole]) }
    }
    if (c instanceof ListObjectsV2Command) {
      const Contents = [...this.objects].filter(([k]) => k.startsWith(c.input.Prefix ?? '')).map(([Key, v]) => ({ Key, Size: v.length }))
      return { Contents }
    }
    if (c instanceof DeleteObjectCommand) {
      if (this.locked) throw Object.assign(new Error('Access Denied because object protected by object lock.'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })
      this.objects.delete(c.input.Key!)
      return {}
    }
    if (c instanceof CreateMultipartUploadCommand) {
      this.uploads.set(`${c.input.Key}#1`, new Map())
      return { UploadId: '1' }
    }
    if (c instanceof UploadPartCommand) {
      this.uploads.get(`${c.input.Key}#${c.input.UploadId}`)!.set(c.input.PartNumber!, Buffer.from(c.input.Body as Buffer))
      return { ETag: `etag-${c.input.PartNumber}` }
    }
    if (c instanceof CompleteMultipartUploadCommand) {
      const parts = this.uploads.get(`${c.input.Key}#${c.input.UploadId}`)!
      this.objects.set(c.input.Key!, Buffer.concat([...parts.keys()].sort((a, b) => a - b).map(n => parts.get(n)!)))
      return {}
    }
    if (c instanceof AbortMultipartUploadCommand) {
      this.uploads.delete(`${c.input.Key}#${c.input.UploadId}`)
      return {}
    }
    throw new Error('the fake store does not do that')
  }
}
