import { describe, expect, it } from 'vitest'
import { parseLivePreviewRequest } from '../livePreviewRequest.js'

const appId = 'abcdefghijklmnopqrstuvwxyz'
const sha = 'a'.repeat(64)

describe("a person's request of a live preview @SC-1760", () => {
  it('reads each kind with exactly its fields', () => {
    for (const r of [
      { kind: 'app.open', appId, entry: 'frame' },
      { kind: 'app.open', appId, entry: 'renew' },
      { kind: 'service.start', service: 'postgres', declaration: sha },
      { kind: 'package.use', ecosystem: 'npm', name: 'esbuild', version: '0.21.0' },
    ]) expect(parseLivePreviewRequest(r)).toEqual(r)
  })

  it('refuses an extra or missing field, a kind it does not know, and a value not its shape', () => {
    for (const bad of [
      { kind: 'app.open', appId, entry: 'frame', extra: 1 },
      { kind: 'app.open', appId },
      { kind: 'app.open', appId: 'web', entry: 'frame' },
      { kind: 'app.open', appId, entry: 'window' },
      { kind: 'service.start', service: 'postgres', declaration: 'not a hash' },
      { kind: 'package.use', ecosystem: 'npm', name: '', version: '1' },
      { kind: 'message', text: 'hi', attachments: [] },
      { kind: 'held.list' },
      null, 'app.open', [],
    ]) expect(parseLivePreviewRequest(bad), JSON.stringify(bad)).toBeNull()
  })
})
