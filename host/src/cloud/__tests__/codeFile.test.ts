import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cloudJoinLookup } from '@agenthix/core/host-crypto'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { readEnrolmentCode, spendEnrolmentCode } from '../codeFile'

const CODE = '7KQ4M2XD46Q3'
const me = process.getuid?.() ?? 0
let m: FakeMachine
let file: string
let logs: string[]

function write(content: string, mode = 0o600): void {
  fs.writeFileSync(file, content, { mode })
  fs.chmodSync(file, mode)
}

beforeEach(() => {
  m = fakeMachine()
  file = path.join(m.dir, 'enrolment-code')
  logs = []
})
afterEach(() => m.cleanup())

describe('the enrolment code file @SC-1055', () => {
  it('is read when it is a plain file owned by root and readable by it alone', async () => {
    write(`${CODE}\n`)
    const r = await readEnrolmentCode(m.ctx.state, file, Date.now(), me)
    expect(r).toMatchObject({ ok: true, code: CODE, lookup: await cloudJoinLookup(CODE) })
  })

  it('is not read, nor deleted, when anyone but its owner may read it', async () => {
    write(CODE, 0o644)
    expect(await readEnrolmentCode(m.ctx.state, file, Date.now(), me)).toMatchObject({ ok: false, spend: false, problem: expect.stringContaining('0600') })
    write(CODE, 0o640)
    expect((await readEnrolmentCode(m.ctx.state, file, Date.now(), me)).ok).toBe(false)
    expect(fs.existsSync(file)).toBe(true)
  })

  it('is not read when root does not own it', async () => {
    write(CODE)
    expect(await readEnrolmentCode(m.ctx.state, file, Date.now(), me + 1)).toMatchObject({ ok: false, spend: false })
  })

  it('is not followed through a symbolic link', async () => {
    const real = path.join(m.dir, 'real')
    fs.writeFileSync(real, CODE, { mode: 0o600 })
    fs.symlinkSync(real, file)
    expect(await readEnrolmentCode(m.ctx.state, file, Date.now(), me)).toMatchObject({ ok: false, spend: false })
  })

  it('holds a code valid for an hour at most from when it was written', async () => {
    write(CODE)
    const old = new Date(Date.now() - 61 * 60_000)
    fs.utimesSync(file, old, old)
    expect(await readEnrolmentCode(m.ctx.state, file, Date.now(), me)).toMatchObject({ ok: false, spend: true, problem: expect.stringContaining('hour') })
  })

  it('that holds no code is spent', async () => {
    write('not a code')
    expect(await readEnrolmentCode(m.ctx.state, file, Date.now(), me)).toMatchObject({ ok: false, spend: true })
  })

  it('once spent, is deleted, and its code is never used again even if the file comes back', async () => {
    write(CODE)
    spendEnrolmentCode(m.ctx.state, file, await cloudJoinLookup(CODE), l => logs.push(l))
    expect(fs.existsSync(file)).toBe(false)
    write(CODE)
    expect(await readEnrolmentCode(m.ctx.state, file, Date.now(), me)).toMatchObject({ ok: false, spend: true, problem: expect.stringContaining('already used') })
    expect(logs.join('\n')).not.toContain(CODE)
  })

  it('missing, is not a problem to spend anything for', async () => {
    expect(await readEnrolmentCode(m.ctx.state, file, Date.now(), me)).toMatchObject({ ok: false, spend: false })
  })
})
