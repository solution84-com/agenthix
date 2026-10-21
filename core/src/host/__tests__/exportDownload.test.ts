import { describe, expect, it } from 'vitest'
import { EXPORT_CHUNK_BYTES, exportChunkProblem, isExportId } from '../exportDownload.js'

const ID = 'office-server-20261015T081500Z-export-0a1b2c3d.sealed'
/** base64url, unpadded, of `n` bytes. */
const b64 = (n: number) => 'A'.repeat(Math.floor(n / 3) * 4 + [0, 2, 3][n % 3])
const SIZE = EXPORT_CHUNK_BYTES + 10

describe("an export's name", () => {
  it('is an export file name in the folder, never a path or another backup', () => {
    expect(isExportId(ID)).toBe(true)
    for (const bad of ['../' + ID, `exports/${ID}`, ID.replace('-export-', '-now-'), ID.replace('.sealed', ''), '', 'x'.repeat(300)]) {
      expect(isExportId(bad), bad).toBe(false)
    }
  })
})

describe('a chunk of an export, as the Fleet Console checks it', () => {
  const first = { exportId: ID, offset: 0, sizeBytes: SIZE, last: false, data: b64(EXPORT_CHUNK_BYTES) }
  const last = { exportId: ID, offset: EXPORT_CHUNK_BYTES, sizeBytes: SIZE, last: true, data: b64(10) }

  it('passes when it is the one asked for, whole, and says truly whether it is the last', () => {
    expect(exportChunkProblem(first, { exportId: ID, offset: 0, sizeBytes: null })).toBeNull()
    expect(exportChunkProblem(last, { exportId: ID, offset: EXPORT_CHUNK_BYTES, sizeBytes: SIZE })).toBeNull()
    expect(exportChunkProblem({ exportId: ID, offset: 0, sizeBytes: 10, last: true, data: b64(10) }, { exportId: ID, offset: 0, sizeBytes: null })).toBeNull()
  })

  it('fails in words when it is of another export, another place, a changed size, cut short, or not the last when it says so', () => {
    const asked = { exportId: ID, offset: 0, sizeBytes: SIZE }
    const cases = [
      { ...first, exportId: ID.replace('0a1b2c3d', 'ffffffff') },
      { ...first, offset: 1 },
      { ...first, sizeBytes: SIZE + 1 },
      { ...first, data: b64(EXPORT_CHUNK_BYTES - 1) },
      { ...first, last: true },
      { ...first, data: '!!not base64!!' },
      { ...first, sizeBytes: 0, data: '', last: true },
      null,
    ]
    for (const c of cases) expect(exportChunkProblem(c, asked), JSON.stringify(c)?.slice(0, 120)).toMatch(/\.$/)
    expect(exportChunkProblem({ ...last, last: false }, { exportId: ID, offset: EXPORT_CHUNK_BYTES, sizeBytes: SIZE })).toMatch(/\.$/)
  })
})
