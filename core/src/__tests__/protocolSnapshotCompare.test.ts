import { describe, expect, it } from 'vitest'
import { snapshotOf } from './protocolSnapshot/fixture.js'
import { judge } from './protocolSnapshot/rules.js'

const before = snapshotOf({
  'index.ts': `
    export * from './run.js'
    export type Status = 'running' | 'done'
    export type Message = { kind: 'start'; runId: string } | { kind: 'stop'; runId: string; reason?: string }
  `,
  'run.ts': `
    import type { Owner } from './owner.js'
    export type Run = { id: string; status: 'running' | 'done'; owner: Owner; startedAt: Date; note?: string }
  `,
  'owner.ts': `export type Owner = { name: string }`,
})

/** The same connection with `run.ts` replaced, at `version`. */
function withRun(run: string, version: string, rest: Record<string, string> = {}) {
  return snapshotOf({
    'index.ts': `
      export * from './run.js'
      export type Status = 'running' | 'done'
      export type Message = { kind: 'start'; runId: string } | { kind: 'stop'; runId: string; reason?: string }
    `,
    'run.ts': `import type { Owner } from './owner.js'\n${run}`,
    'owner.ts': `export type Owner = { name: string }`,
    ...rest,
  }, version)
}

const RUN = `export type Run = { id: string; status: 'running' | 'done'; owner: Owner; startedAt: Date; note?: string }`

describe('reading the declarations @SC-1133', () => {
  it('records fields, which are optional, a date as superjson\'s, and the types a root reaches elsewhere', () => {
    expect(before.version).toBe('1.0')
    expect(before.types.Run.file).toBe('run.ts')
    expect(before.types.Run.shape).toEqual({
      fields: {
        id: { type: { type: 'string' } },
        note: { type: { type: 'string' }, optional: true },
        owner: { type: { ref: 'Owner' } },
        startedAt: { type: { type: 'date' } },
        status: { type: { union: [{ literal: 'done' }, { literal: 'running' }] } },
      },
    })
    // Not exported by the entry, but carried by Run.
    expect(before.types.Owner.file).toBe('owner.ts')
  })

  it('leaves out a type or field marked @experimental', () => {
    const s = snapshotOf({
      'index.ts': `
        /** @experimental */
        export type Sketch = { a: string }
        export type Kept = {
          b: string
          /** @experimental */
          c?: string
        }
      `,
    })
    expect(Object.keys(s.types)).toEqual(['Kept'])
    expect(Object.keys((s.types.Kept.shape as { fields: object }).fields)).toEqual(['b'])
  })
})

describe('what a difference requires of the version @SC-1133', () => {
  it('nothing, when nothing changed', () => {
    const v = judge(before, withRun(RUN, '1.0'))
    expect(v.changes).toEqual([])
    expect(v.problems).toEqual([])
  })

  it('an optional field added: the minor moves', () => {
    const run = RUN.replace('note?: string', 'note?: string; tag?: string')
    const v = judge(before, withRun(run, '1.0'))
    expect(v.needed).toBe('minor')
    expect(v.problems.join()).toMatch(/Run\.tag added, optional .*the version must become 1\.1 \(it is 1\.0\)/)
    expect(judge(before, withRun(run, '1.1')).problems).toEqual([])
  })

  it('a new type, a new value of a closed set, and a new message are additions', () => {
    const v = judge(before, snapshotOf({
      'index.ts': `
        export * from './run.js'
        export type Status = 'running' | 'done' | 'waiting'
        export type Message =
          | { kind: 'start'; runId: string } | { kind: 'stop'; runId: string; reason?: string; by?: string }
          | { kind: 'pause'; runId: string }
        export type Extra = { x: number }
      `,
      'run.ts': `import type { Owner } from './owner.js'\n${RUN}`,
      'owner.ts': `export type Owner = { name: string }`,
    }))
    expect(v.needed).toBe('minor')
    expect(v.changes.map(c => `${c.at}: ${c.what}`).sort()).toEqual([
      'Extra: added',
      'Message: `{ kind, runId }` was added to its values',
      'Message<kind={"literal":"stop"}>.by: added, optional',
      'Status: `"waiting"` was added to its values',
    ])
  })

  it.each([
    ['a required field added', RUN.replace('note?: string', 'note?: string; tag: string'), /Run\.tag added, required/],
    ['a field removed', RUN.replace('; note?: string', ''), /Run\.note removed/],
    ['a field renamed', RUN.replace('note?: string', 'remark?: string'), /Run\.note removed/],
    ['a field\'s type changed', RUN.replace('id: string', 'id: number'), /Run\.id type changed from `string` to `number`/],
    ['a field made optional', RUN.replace('id: string', 'id?: string'), /Run\.id became optional/],
    ['a value removed', RUN.replace(`'running' | 'done'`, `'running'`), /Run\.status type changed/],
    ['null where a value was always sent', RUN.replace('id: string', 'id: string | null'), /Run\.id type changed/],
  ])('%s: the major moves', (_, run, said) => {
    const v = judge(before, withRun(run, '1.3'))
    expect(v.needed).toBe('major')
    expect(v.problems.join()).toMatch(said)
    expect(v.problems.join()).toMatch(/the version must become 2\.0 \(it is 1\.3\)/)
    // A removal also needs a mark it carried before (protocolSnapshotMarks.test.ts); the version rule is this test's.
    const atMajor = judge(before, withRun(run, '2.0')).problems
    expect(atMajor.filter(p => !/without being deprecated first/.test(p))).toEqual([])
  })

  it('a removed value of a closed set breaks', () => {
    const v = judge(before, snapshotOf({
      'index.ts': `
        export * from './run.js'
        export type Status = 'running'
        export type Message = { kind: 'start'; runId: string } | { kind: 'stop'; runId: string; reason?: string }
      `,
      'run.ts': `import type { Owner } from './owner.js'\n${RUN}`,
      'owner.ts': `export type Owner = { name: string }`,
    }))
    expect(v.needed).toBe('major')
  })

  it('a type removed breaks; a type renamed with its shape unchanged needs nothing', () => {
    const renamed = snapshotOf({
      'index.ts': `
        export * from './run.js'
        export type Status = 'running' | 'done'
        export type Message = { kind: 'start'; runId: string } | { kind: 'stop'; runId: string; reason?: string }
      `,
      'run.ts': `import type { Person } from './owner.js'\n${RUN.replace('owner: Owner', 'owner: Person')}`,
      'owner.ts': 'export type Person = { name: string }',
    })
    const v = judge(before, renamed)
    expect(v.changes).toEqual([{ at: 'Owner', what: 'renamed to Person, its shape unchanged', level: 'none' }])
    expect(v.problems).toEqual([])

    const gone = judge(before, snapshotOf({
      'index.ts': `
        export * from './run.js'
        export type Status = 'running' | 'done'
        export type Message = { kind: 'start'; runId: string } | { kind: 'stop'; runId: string; reason?: string }
      `,
      'run.ts': RUN.replace('owner: Owner', 'owner: string'),
    }))
    expect(gone.problems.join()).toMatch(/Owner removed/)
  })

  it('a method added to a method map is an addition; one removed breaks', () => {
    const map = (methods: string) => snapshotOf({ 'index.ts': `export type Methods = { ${methods} }` })
    const was = map(`'a.get': { params: { id: string }; result: { ok: boolean } }`)
    const more = map(`'a.get': { params: { id: string }; result: { ok: boolean } }; 'b.put': { params: { x: number }; result: null }`)
    const maps = new Set(['Methods'])
    expect(judge(was, more, null, maps).needed).toBe('minor')
    expect(judge(was, more).needed).toBe('major')
    expect(judge(more, was, null, maps).needed).toBe('major')
  })

  it('a message tagged by several literal values is matched by them, so a change inside it is classed as that', () => {
    const frames = (extra: string) => snapshotOf({
      'index.ts': `export type Frame = { type: 'ping' | 'pong' } | { type: 'answer'; payload: { a: string } | { c: boolean }${extra} }`,
    })
    const v = judge(frames(''), frames(' | { b: number }'))
    expect(v.needed).toBe('minor')
    expect(v.changes.map(c => `${c.at}: ${c.what}`)).toEqual(['Frame<type={"literal":"answer"}>.payload: `{ b }` was added to its values'])
  })

  describe('messages that share their tag, told apart by a second field @SC-1249', () => {
    const requests = (install: string, move: string, extra = '') => snapshotOf({
      'index.ts': `
        export type Target = 'hq' | 'site'
        export type Request =
          | { op: 'install'; target: 'hq'; address: string${install} }
          | { op: 'install'; target: 'site' }
          | { op: 'move'; role: 'send'; target: Target; peer: string }
          | { op: 'move'; role: 'receive'; target: Target; peer: string; siteName: string${move} }
          | { op: 'start'; target: Target }${extra}
      `,
    })
    const was = requests('', '')

    it('an optional field added to one of them is an addition to that message', () => {
      const v = judge(was, requests('; hqPort?: number', '; hqPort?: number'))
      expect(v.needed).toBe('minor')
      expect(v.changes.map(c => `${c.at}: ${c.what}`).sort()).toEqual([
        'Request<op={"literal":"install"},target={"literal":"hq"}>.hqPort: added, optional',
        'Request<op={"literal":"move"},role={"literal":"receive"}>.hqPort: added, optional',
      ])
    })

    it('a required field added to one of them breaks', () => {
      const v = judge(was, requests('; hqPort: number', ''))
      expect(v.needed).toBe('major')
      expect(v.problems.join()).toMatch(/Request<op=\{"literal":"install"\},target=\{"literal":"hq"\}>\.hqPort added, required/)
    })

    it('one of them removed breaks', () => {
      const fewer = snapshotOf({
        'index.ts': `
          export type Target = 'hq' | 'site'
          export type Request =
            | { op: 'install'; target: 'hq'; address: string }
            | { op: 'move'; role: 'send'; target: Target; peer: string }
            | { op: 'move'; role: 'receive'; target: Target; peer: string; siteName: string }
            | { op: 'start'; target: Target }
        `,
      })
      const v = judge(was, fewer)
      expect(v.needed).toBe('major')
      expect(v.changes.map(c => c.what).join()).toMatch(/`\{ op, target \}` is no longer one of its values/)
    })

    it('a new message beside them is an addition', () => {
      expect(judge(was, requests('', '', `\n          | { op: 'stop'; target: Target }`)).needed).toBe('minor')
    })
  })

  it('refuses a version that went back', () => {
    const later = withRun(RUN, '1.2')
    expect(judge(later, withRun(RUN, '1.1')).problems.join()).toMatch(/went back from 1\.2 to 1\.1/)
  })
})
