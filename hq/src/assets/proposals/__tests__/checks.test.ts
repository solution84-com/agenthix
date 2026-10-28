import { describe, expect, it } from 'vitest'
import { checkProposal, missingNamed, namedPaths, ProposalRefused } from '../checks'
import { PROPOSAL_MAX_BYTES, PROPOSAL_MAX_FILES } from '../types'

const MD = (body = 'Do it.') => `---\nname: checkout-review\ndescription: Review a checkout change. Use when it touches src/checkout.\n---\n\n# Checkout review\n${body}\n`
const args = (over: Record<string, unknown> = {}) => ({
  name: 'checkout-review', description: 'Review a checkout change.', files: { 'SKILL.md': MD() }, why: 'Reviews went well.', aim: 'project', ...over,
})
const refused = (over: Record<string, unknown>) => {
  try {
    checkProposal(args(over))
  } catch (err) {
    expect(err).toBeInstanceOf(ProposalRefused)
    return (err as Error).message
  }
  throw new Error('not refused')
}

describe('propose_skill plain checks (H5, R8)', () => {
  it('passes a valid skill and keeps the description from SKILL.md', () => {
    const c = checkProposal(args())
    expect(c).toMatchObject({ name: 'checkout-review', aim: 'project', edits: null, description: 'Review a checkout change. Use when it touches src/checkout.' })
    expect(c.files.map(f => f.path)).toEqual(['SKILL.md'])
  })

  it('refuses a name outside the Agent Skills rules', () => {
    expect(refused({ name: 'Checkout Review' })).toMatch(/lowercase letters/)
  })

  it('refuses without SKILL.md, and without a description in its front matter', () => {
    expect(refused({ files: { 'notes.md': 'x' } })).toMatch(/no SKILL.md/)
    expect(refused({ files: { 'SKILL.md': '---\nname: checkout-review\n---\nbody' } })).toMatch(/description/)
  })

  it('writes front matter from name and description when SKILL.md has none', () => {
    const c = checkProposal(args({ files: { 'SKILL.md': '# Steps\n1. Read it.' } }))
    expect(c.files[0]!.content.toString()).toMatch(/^---\nname: checkout-review\ndescription: "Review a checkout change."\n---/)
  })

  it('flags header keys a run ignores, and refuses nothing for them', () => {
    const c = checkProposal(args({ files: { 'SKILL.md': MD().replace('---\n\n', 'allowed-tools: Bash\n---\n\n') } }))
    expect(c.warnings.join(' ')).toMatch(/allowed-tools.*ignored when run/)
  })

  it('refuses when SKILL.md names a file that is not sent', () => {
    const message = refused({ files: { 'SKILL.md': MD('Run `scripts/check.sh`, then read [the list](references/list.md).') } })
    expect(message).toMatch(/scripts\/check.sh/)
    expect(message).toMatch(/references\/list.md/)
    expect(() => checkProposal(args({ files: { 'SKILL.md': MD('Run `scripts/check.sh`.'), 'scripts/check.sh': 'echo ok' } }))).not.toThrow()
  })

  it('refuses the manifest, unsafe paths, too many files and too many bytes', () => {
    expect(refused({ files: { 'SKILL.md': MD(), 'package.json': '{}' } })).toMatch(/manifest/)
    expect(refused({ files: { 'SKILL.md': MD(), '../escape.md': 'x' } })).toMatch(/can't be stored/)
    const many = Object.fromEntries(Array.from({ length: PROPOSAL_MAX_FILES + 1 }, (_, i) => [`references/r${i}.md`, 'x']))
    expect(refused({ files: { ...many, 'SKILL.md': MD() } })).toMatch(/at most/)
    expect(refused({ files: { 'SKILL.md': MD(), 'references/big.md': 'x'.repeat(PROPOSAL_MAX_BYTES) } })).toMatch(/bytes/)
  })

  it('needs an aim it knows and a reason', () => {
    expect(refused({ aim: 'everyone' })).toMatch(/organisation, project or person/)
    expect(refused({ why: ' ' })).toMatch(/why/)
  })

  it('ends every refusal with "Nothing was changed."', () => {
    expect(refused({ name: 'X' })).toMatch(/Nothing was changed\.$/)
  })
})

describe('the files SKILL.md names', () => {
  it('reads relative links and scripts, references and assets paths, never web links or anchors', () => {
    expect(namedPaths('See [a](./references/a.md#top), [web](https://x.test/a), [here](#steps). Run scripts/run.py.').sort())
      .toEqual(['references/a.md', 'scripts/run.py'])
  })

  it('takes a folder as present when any file is under it', () => {
    expect(missingNamed('Read [the folder](references/)', ['references/x.md'])).toEqual([])
    expect(missingNamed('Read [the folder](references/)', ['SKILL.md'])).toEqual(['references/'])
  })
})
