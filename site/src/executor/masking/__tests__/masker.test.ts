import { createHmac, randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { maskFormTag } from '@agenthix/core'
import { WindowHasher } from '../hmacWindows'
import { createFormMasker } from '../masker'
import { base64Aligned, material, RUN_KEY, TAG_BASE } from './material'

const CANARY = 'canary-7f3a9c1e-deploy-key'
const OTHER = 'canary-b21d44aa-db-password'

async function maskAll(text: string | Buffer, mat = material({ DEPLOY_KEY: CANARY }), chunk = Infinity) {
  const m = createFormMasker(mat)
  const bytes = Buffer.from(text)
  const parts: Uint8Array[] = []
  for (let i = 0; i < bytes.length; i += Math.min(chunk, bytes.length)) parts.push(await m.push(bytes.subarray(i, i + chunk)))
  parts.push(await m.end())
  return { out: Buffer.concat(parts).toString('latin1'), printed: m.printed() }
}

describe('WindowHasher @SC-1350', () => {
  it('gives HMAC-SHA-256 for every window length, up to several blocks', async () => {
    const key = randomBytes(32)
    const data = randomBytes(400)
    const lengths = [1, 4, 31, 55, 56, 63, 64, 65, 119, 120, 128, 200, 300]
    const hasher = new WindowHasher(key)
    for (const p of [0, 3, 17]) {
      const seen: string[] = []
      hasher.each(data, p, lengths, lengths.length, () => {
        seen.push(Buffer.from(new Uint8Array(new Int32Array(hasher.digest.map(x => x)).buffer)).swap32().toString('hex'))
      })
      expect(seen).toEqual(lengths.map(l => createHmac('sha256', key).update(data.subarray(p, p + l)).digest('hex')))
    }
  })

  it('takes a key longer than a block', async () => {
    const key = randomBytes(100)
    const hasher = new WindowHasher(key)
    let hex = ''
    hasher.each(Buffer.from('abcdef'), 0, [6], 1, () => {
      hex = Buffer.from(new Uint8Array(new Int32Array(hasher.digest).buffer)).swap32().toString('hex')
    })
    expect(hex).toBe(createHmac('sha256', key).update('abcdef').digest('hex'))
  })
})

describe('createFormMasker @SC-1350', () => {
  it('masks the value as it is, and names it', async () => {
    const r = await maskAll(`deploying with ${CANARY} now\n`)
    expect(r.out).toBe('deploying with *** now\n')
    expect(r.printed).toEqual(['DEPLOY_KEY'])
  })

  it('lets output with no secret through unchanged, and names nothing', async () => {
    expect(await maskAll('hello\nworld\n')).toEqual({ out: 'hello\nworld\n', printed: [] })
  })

  it('masks hex in both cases and URL-encoding', async () => {
    const value = 'canary pass/word+1'
    const mat = material({ DB: value })
    const hex = Buffer.from(value).toString('hex')
    expect((await maskAll(`a ${hex} b`, mat)).out).toBe('a *** b')
    expect((await maskAll(`a ${hex.toUpperCase()} b`, mat)).out).toBe('a *** b')
    expect((await maskAll(`postgres://u:${encodeURIComponent(value)}@db`, mat)).out).toBe('postgres://u:***@db')
    expect((await maskAll(`x=${value.replace(/ /g, '%20').replace(/\//g, '%2F').replace(/\+/g, '%2B')}`, mat)).out).toBe('x=***')
  })

  it('masks base64 at each of the three alignments, inside a longer base64 string', async () => {
    for (const prefix of ['', 'u', 'us', 'user:', 'ab:']) {
      const header = `Authorization: Basic ${Buffer.from(`${prefix}${CANARY}:tail`).toString('base64')}`
      const r = await maskAll(header)
      expect(r.out).not.toContain(base64Aligned(Buffer.from(CANARY), 0)!.toString().slice(4, 20))
      expect(r.out).toContain('***')
      expect(r.printed).toEqual(['DEPLOY_KEY'])
    }
  })

  it('finds a value split across chunks, at every chunk size', async () => {
    const text = `start ${CANARY} middle ${Buffer.from(CANARY).toString('hex')} end`
    for (const chunk of [1, 2, 3, 7, 16, 25, 64]) {
      expect((await maskAll(text, undefined, chunk)).out).toBe('start *** middle *** end')
    }
  })

  it('holds back no more than it must on output in lines', async () => {
    const m = createFormMasker(material({ DEPLOY_KEY: CANARY }))
    const line = `${'x'.repeat(400)}\n`
    const out = Buffer.from(await m.push(Buffer.from(line))).toString()
    expect(out.length).toBeGreaterThanOrEqual(line.length - 256)
    expect(out + Buffer.from(await m.end()).toString()).toBe(line)
  })

  it('masks a file secret whole and by each of its lines', async () => {
    const lines = Array.from({ length: 40 }, (_, i) => `CANARYKEYLINE${String(i).padStart(3, '0')}${'Q'.repeat(48)}`)
    const key = `-----BEGIN CANARY KEY-----\n${lines.join('\n')}\n-----END CANARY KEY-----\n`
    const mat = material({ SSH_KEY: key })
    const whole = await maskAll(`cat:\n${key}done\n`, mat)
    expect(whole.out).not.toContain('CANARYKEYLINE')
    expect(whole.printed).toEqual(['SSH_KEY'])
    const one = await maskAll(`line: ${lines[7]} !`, mat)
    expect(one.out).toBe('line: *** !')
    const b64 = await maskAll(`${Buffer.from(key).toString('base64')}\n`, mat, 1000)
    expect(b64.out).toMatch(/^\*\*\*[A-Za-z0-9+/]?=*\n$/)
  })

  it('masks a value of another secret of the place, which the run was not given', async () => {
    const mat = material({ DEPLOY_KEY: CANARY, DB_PASSWORD: OTHER })
    const r = await maskAll(`left behind: ${OTHER}`, mat)
    expect(r.out).toBe('left behind: ***')
    expect(r.printed).toEqual(['DB_PASSWORD'])
  })

  it('makes overlapping and touching finds one mask', async () => {
    const mat = material({ A: 'canaryAAAA', B: 'AAAAcanary' })
    expect((await maskAll('x canaryAAAAcanary y', mat)).out).toBe('x *** y')
    expect((await maskAll('x canaryAAAAcanaryAAAA y', mat)).out).toBe('x *** y')
    expect((await maskAll(`x ${CANARY}${CANARY} y`)).out).toBe('x *** y')
    for (const chunk of [1, 5, 26, 27]) expect((await maskAll(`x ${CANARY}${CANARY}`, undefined, chunk)).out).toBe('x ***')
  })

  it('withholds everything when the material cannot be read', async () => {
    const m = createFormMasker({ key: 'a2V5', forms: [{ length: 0, hmac: 'nothex', secretName: 'X', class: 'raw' }] })
    expect((await m.push(Buffer.from(CANARY))).length).toBe(0)
    expect(Buffer.from(await m.end()).toString()).toContain('withheld')
  })

  it('finds a form of a class inside a longer run of that class, and at its edges', async () => {
    const value = 'canary pass/word+1'
    const mat = material({ DB: value })
    const hex = Buffer.from(value).toString('hex')
    expect((await maskAll(`ab${hex}cd`, mat)).out).toBe('ab***cd')
    expect((await maskAll(`${hex}`, mat)).out).toBe('***')
    expect((await maskAll(`${hex}`, mat, 3)).out).toBe('***')
    expect((await maskAll(`x%${encodeURIComponent(value)}%`, mat, 5)).out).toBe('x%***%')
  })

  it('looks for a form without a class everywhere, as raw', async () => {
    const value = 'canary pass/word+1'
    const mat = material({ DB: value })
    const unclassed = { key: mat.key, forms: mat.forms.map(({ class: _class, ...f }) => f) }
    expect((await maskAll(`a ${Buffer.from(value).toString('hex')} b`, unclassed)).out).toBe('a *** b')
  })

  it('withholds everything when a form has no class it knows', async () => {
    const [form] = material({ DEPLOY_KEY: CANARY }).forms
    const m = createFormMasker({ key: RUN_KEY.toString('base64'), forms: [{ ...form!, class: 'rot13' as 'raw' }] })
    expect((await m.push(Buffer.from(CANARY))).length).toBe(0)
    expect(Buffer.from(await m.end()).toString()).toContain('withheld')
  })

  it('takes pushes in the order made, also when the caller does not wait for each', async () => {
    const m = createFormMasker(material({ DEPLOY_KEY: CANARY }))
    const text = Buffer.from(`one ${CANARY} two ${'y'.repeat(3000)} three ${CANARY}\n`)
    const pending: Promise<Uint8Array>[] = []
    for (let i = 0; i < text.length; i += 7) pending.push(m.push(text.subarray(i, i + 7)))
    pending.push(m.end())
    const out = Buffer.concat(await Promise.all(pending)).toString()
    expect(out).toBe(`one *** two ${'y'.repeat(3000)} three ***\n`)
  })

  it('gives the event loop a turn while it masks a large chunk', async () => {
    const secrets = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`S${i}`, `canary-${i}-${'z'.repeat(20 + 7 * i)}`]))
    // Without tags, so the work is long enough to need turns.
    const m = createFormMasker(material(secrets, RUN_KEY, null))
    let last = performance.now()
    let longest = 0
    let turns = 0
    const timer = setInterval(() => { const now = performance.now(); longest = Math.max(longest, now - last); last = now; turns++ }, 1)
    last = performance.now()
    await m.push(Buffer.from('npm notice building module 0123456789\n'.repeat(4000)))
    await m.end()
    clearInterval(timer)
    expect(turns).toBeGreaterThan(1)
    expect(longest).toBeLessThan(250)
  }, 120_000)

  it('masks a megabyte of output at a usable speed', async () => {
    const secrets = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`S${i}`, `canary-${i}-${'z'.repeat(20 + 7 * i)}`]))
    const mat = material(secrets)
    const line = 'npm notice building module 0123456789 with options --foo --bar\n'
    const text = line.repeat(Math.ceil((1 << 20) / line.length))
    const started = performance.now()
    const r = await maskAll(text, mat, 65536)
    const seconds = (performance.now() - started) / 1000
    expect(r.out).toBe(text)
    expect(seconds).toBeLessThan(60)
  }, 120_000)
})

describe('createFormMasker with tags @SC-1350', () => {
  const ten = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`S${i}`, `canary-${i}-${'q'.repeat(3 + 5 * i)}-tail`]))

  it('tags raw forms in the material it is given', () => {
    const mat = material(ten)
    expect(mat.tagBase).toBe(TAG_BASE)
    expect(mat.forms.filter(f => f.class === 'raw').every(f => f.tag !== undefined)).toBe(true)
  })

  it('masks nothing where a tag matches but the HMAC does not, and hashes only there', async () => {
    const window = Buffer.from('ordinary-output-text-here')
    const decoy = Buffer.from('a-different-value-entirely')
    const form = {
      length: window.length,
      hmac: createHmac('sha256', RUN_KEY).update(decoy.subarray(0, window.length)).digest('hex'),
      secretName: 'DECOY',
      class: 'raw' as const,
      ...maskFormTag(window, TAG_BASE),
    }
    const mat = { key: RUN_KEY.toString('base64'), forms: [form], tagBase: TAG_BASE }
    const each = vi.spyOn(WindowHasher.prototype, 'each')
    try {
      const text = `x ${window} y ${'z'.repeat(200)}\n`
      const r = await maskAll(text, mat)
      expect(r).toEqual({ out: text, printed: [] })
      expect(each.mock.calls.length).toBeGreaterThan(0)
      expect(each.mock.calls.length).toBeLessThan(5)
    } finally {
      each.mockRestore()
    }
  })

  it('finds a tagged value split across chunks, at every chunk size', async () => {
    const mat = material(ten)
    const text = `a ${ten.S3} b ${ten.S9}\nc ${Buffer.from(ten.S5!).toString('hex')} d`
    for (const chunk of [1, 2, 5, 13, 40, 1000]) {
      const r = await maskAll(text, mat, chunk)
      expect(r.out, String(chunk)).toBe('a *** b ***\nc *** d')
      expect(r.printed).toEqual(['S3', 'S5', 'S9'])
    }
  })

  it('tags encoded forms with their value\'s tag, and finds each by decoding the output', async () => {
    const value = 'canary pass/word+1 ~é'
    const mat = material({ DB: value })
    expect(mat.forms.filter(f => f.class !== 'raw').every(f => f.tag !== undefined)).toBe(true)
    const v = Buffer.from(value)
    const outputs = [
      ...['', 'a', 'ab', 'abc', 'user:'].map(before => `Basic ${Buffer.from(`${before}${value}:tail`).toString('base64')}`),
      `h ${v.toString('hex')} H ${v.toString('hex').toUpperCase()}`, `odd x${v.toString('hex')}`,
      `postgres://u:${encodeURIComponent(value)}@db`, `x=${encodeURIComponent(value).replace(/'/g, '%27')}`,
    ]
    for (const text of outputs) {
      for (const chunk of [1, 7, 1000]) {
        const r = await maskAll(text, mat, chunk)
        expect(r.out, `${text} ${chunk}`).toContain('***')
        expect(r.out).not.toContain(v.toString('hex').slice(6, 20))
        expect(r.out).not.toContain(encodeURIComponent(value).slice(4, 14))
        expect(r.printed).toEqual(['DB'])
      }
    }
  })

  it('finds a URL-encoded form that starts inside what reads as a percent escape', async () => {
    const value = '41-canary value/x'
    const mat = material({ V: value })
    const form = encodeURIComponent(value)
    expect(form.startsWith('41')).toBe(true)
    const r = await maskAll(`q=%${form}&`, mat)
    expect(r.out).toBe('q=%***&')
  })

  it('masks exactly what hashing at every position masks, over random values and output', async () => {
    let seed = 7
    const rnd = (n: number) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed % n }
    const pick = (alphabet: string, n: number) => Array.from({ length: n }, () => alphabet[rnd(alphabet.length)]).join('')
    const AN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let round = 0; round < 60; round++) {
      const secrets: Record<string, Buffer> = {}
      for (let i = 0; i < 4; i++) {
        const n = 4 + rnd(40)
        secrets[`S${i}`] = rnd(2) ? Buffer.from(pick(AN + '%+/ :-_.~!*()\'', n)) : Buffer.from(Array.from({ length: n }, () => rnd(256)))
      }
      const pieces: string[] = []
      for (let k = 0; k < 12; k++) {
        const v = secrets[`S${rnd(4)}`]!
        const enc = [v.toString('latin1'), Buffer.concat([Buffer.from(pick(AN, rnd(4))), v]).toString('base64'), v.toString('hex'),
          v.toString('hex').toUpperCase(), encodeURIComponent(v.toString('latin1'))][rnd(5)]!
        pieces.push(pick(AN + '%+/=', rnd(30)), enc, pick(' \n:%', 1))
      }
      const text = Buffer.from(pieces.join(''), 'latin1')
      const tagged = material(secrets, RUN_KEY, (rnd(2 ** 31) * 2 + 1) >>> 0)
      const plain = material(secrets, RUN_KEY, null)
      for (const chunk of [5, 4096]) {
        const a = await maskAll(text, tagged, chunk)
        const b = await maskAll(text, plain, chunk)
        expect(a, `round ${round}`).toEqual(b)
      }
    }
  })

  it('still finds a form without a tag at every position, beside tagged ones', async () => {
    const tagged = material({ A: CANARY })
    const plain = material({ B: OTHER }, RUN_KEY, null)
    const mat = { ...tagged, forms: [...tagged.forms, ...plain.forms] }
    expect((await maskAll(`1 ${OTHER} 2 ${CANARY} 3`, mat, 3)).out).toBe('1 *** 2 *** 3')
    const noBase = { key: tagged.key, forms: tagged.forms }
    expect((await maskAll(`1 ${CANARY} 2`, noBase, 3)).out).toBe('1 *** 2')
  })

  it('withholds all output when a tag is not one', async () => {
    const mat = material({ A: CANARY })
    for (const bad of [{ tag: 4096 }, { tag: 1.5 }, { tagSpan: 0 }, { tagSpan: 17 }, { tag: undefined }, { tagSpan: CANARY.length }]) {
      const broken = { ...mat, forms: mat.forms.map((f, i) => (i === 0 ? { ...f, ...bad } : f)) }
      const m = createFormMasker(broken)
      expect((await m.push(Buffer.from(`${CANARY}\n`))).length, JSON.stringify(bad)).toBe(0)
      expect(Buffer.from(await m.end()).toString()).toContain('withheld')
    }
    const m = createFormMasker({ ...mat, tagBase: 2 ** 32 })
    expect(Buffer.from(await m.end()).toString()).toContain('withheld')
  })
})
