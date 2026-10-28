import { describe, it, expect } from 'vitest'
import { bytesOfText, type EditorFile } from '../editorFiles'
import { checkSkill, hasError, namedFiles, VERSION_ON_PUBLISH } from '../editorChecks'

const f = (path: string, text: string): EditorFile => ({ path, bytes: bytesOfText(text) })
const md = (header: string, body = '# Notes\n') => f('SKILL.md', `---\n${header}\n---\n\n${body}`)
const texts = (checks: ReturnType<typeof checkSkill>) => checks.map(c => `${c.level}: ${c.text}`)

describe('namedFiles @SC-1623', () => {
  it('finds files under the skill folders, in backticks, prose and links', () => {
    const body = 'Run `scripts/collect-prs.sh` then scripts/format.py, see [style](references/style.md#tone). Visit https://example.com/scripts/x.sh or org:processes/a.md.'
    expect(namedFiles(body, [])).toEqual(['references/style.md', 'scripts/collect-prs.sh', 'scripts/format.py'])
  })
  it('counts a link to a file beside SKILL.md and the folders the skill has', () => {
    expect(namedFiles('See [forms](FORMS.md) and docs/guide.md and [site](https://x.dev/a.md)', ['docs'])).toEqual(['FORMS.md', 'docs/guide.md'])
  })
})

describe('checkSkill @SC-1623', () => {
  it('passes a skill whose files all exist', () => {
    const files = [md('name: release-notes\ndescription: Writes release notes. Use for a changelog.', 'Run scripts/collect.sh\n'), f('scripts/collect.sh', '#!/bin/sh\n')]
    const checks = checkSkill('release-notes', files)
    expect(hasError(checks)).toBe(false)
    expect(texts(checks)).toContain('ok: Every file this skill names exists: scripts/collect.sh')
  })

  it('names a file SKILL.md mentions that is not there', () => {
    const checks = checkSkill('release-notes', [md('description: Writes notes', 'Run scripts/format.py\n')])
    expect(hasError(checks)).toBe(true)
    expect(texts(checks)).toContain('error: SKILL.md names scripts/format.py, which isn’t in the skill. Add it or take the mention out.')
  })

  it('refuses an empty description and a long one', () => {
    expect(hasError(checkSkill('a', [md('description: ""')]))).toBe(true)
    expect(texts(checkSkill('a', [md(`description: ${'x'.repeat(1025)}`)])).join()).toContain('1025 characters')
  })

  it('flags a header key a run drops, as a warning', () => {
    const checks = checkSkill('a', [md('description: Does it\nallowed-tools: Bash')])
    expect(hasError(checks)).toBe(false)
    expect(texts(checks)).toContain('warning: allowed-tools in the header is ignored when run')
  })

  it('marks the version in the header as written on publish, not as a key the run drops (finding 13)', () => {
    const checks = checkSkill('a', [md('description: Does it\nversion: 2\nmetadata:\n  version: "2"')])
    expect(texts(checks)).toContain(`ok: ${VERSION_ON_PUBLISH}`)
    expect(texts(checks).filter(t => t.startsWith('warning'))).toEqual([])
  })

  it('needs a SKILL.md, and a front matter that closes', () => {
    expect(hasError(checkSkill('a', [f('notes.md', 'x')]))).toBe(true)
    expect(texts(checkSkill('a', [f('SKILL.md', '---\nname: a\nno end')])).join()).toContain('never closed')
  })

  it('warns when the file calls itself something else, and when the body is long', () => {
    const long = `${'line\n'.repeat(520)}`
    const checks = checkSkill('a', [md('name: b\ndescription: ok', long)])
    expect(texts(checks).join('\n')).toMatch(/warning: SKILL.md calls itself .b.; it runs as a/)
    expect(texts(checks).join('\n')).toMatch(/warning: SKILL.md is \d+ lines long/)
  })

  it('refuses a name the rules do not allow', () => {
    expect(hasError(checkSkill('Release Notes', [md('description: ok')]))).toBe(true)
  })
})
