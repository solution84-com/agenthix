/**
 * Agenthix's build of its templates (spec part 2 *Self-contained packages*, I5, T11): each shared skill copied in from
 * its one source with its own manifest, and the check that fails a template keeping a copy, naming a built-in, or naming
 * a skill no source has. And the versions the build gives: content already held keeps its version, new content the next.
 */
import { describe, it, expect } from 'vitest'
import { ImageBuildError, buildTemplate, declaredSkills, stampVersion, type SkillSources } from '../imageBuild'
import { imageTemplateVersion } from '../imageTemplates'
import { fingerprintOf } from '../../content'
import type { Db } from '../../../packages/packageStore'

const f = (path: string, text: string) => ({ path, content: Buffer.from(text, 'utf-8') })
const SKILL = (name: string) => `---\nname: ${name}\ndescription: Does ${name}\n---\n\n# ${name}\n`

const sources: SkillSources = {
  shelf: new Map([['dev-code-review', { name: 'dev-code-review', version: '2.0.0', description: 'Reviews code', files: [f('SKILL.md', SKILL('dev-code-review'))] }]]),
  builtIn: new Set(['working-with-git']),
}

const team = (skills: string[], extra: Array<ReturnType<typeof f>> = []) => [
  f('package.json', JSON.stringify({ format: 2, kind: 'team', publisher: 'agenthix', name: 'crew', version: '1.0.0', description: 'A crew' })),
  f('team.json', JSON.stringify({ name: 'Crew', teams: [{ name: 'T', agents: ['lead'] }] })),
  f('agents/lead/agent.json', JSON.stringify({ name: 'Lead', skills })),
  ...extra,
]

describe('building a template from its sources', () => {
  it('copies each shared skill its agents name from the shelf, with a manifest at the shelf version, and keeps role skills as they are', () => {
    const built = buildTemplate('crew', team(['dev-code-review', 'plan'], [f('skills/plan/SKILL.md', SKILL('plan'))]), sources)
    expect(built.map(x => x.path)).toEqual([
      'agents/lead/agent.json', 'package.json', 'skills/dev-code-review/SKILL.md', 'skills/dev-code-review/package.json', 'skills/plan/SKILL.md', 'team.json',
    ])
    expect(JSON.parse(built.find(x => x.path === 'skills/dev-code-review/package.json')!.content.toString())).toEqual({
      format: 2, kind: 'skill', publisher: 'agenthix', name: 'dev-code-review', version: '2.0.0', description: 'Reviews code',
    })
    expect(built.find(x => x.path === 'skills/dev-code-review/SKILL.md')!.content.toString()).toBe(SKILL('dev-code-review'))
  })

  it("reads what an agent template's one agent.json and a team template's agents name", () => {
    expect(declaredSkills(team(['b', 'a']))).toEqual(['a', 'b'])
    expect(declaredSkills([f('agent.json', JSON.stringify({ skills: ['x'] }))])).toEqual(['x'])
  })

  it('fails a template that keeps a copy of a shelf skill, names a built-in, or names a skill no source has', () => {
    const fails = (files: ReturnType<typeof team>) => { try { buildTemplate('crew', files, sources); return null } catch (e) { return e } }
    expect(fails(team([], [f('skills/dev-code-review/SKILL.md', SKILL('dev-code-review'))]))).toBeInstanceOf(ImageBuildError)
    expect(String(fails(team([], [f('skills/dev-code-review/SKILL.md', SKILL('x'))])))).toMatch(/copy of the shelf's dev-code-review/)
    expect(String(fails(team(['working-with-git'])))).toMatch(/working-with-git, which is built in/)
    expect(String(fails(team(['made-up'])))).toMatch(/made-up, which no source has/)
    expect(String(fails(team([], [f('skills/own/SKILL.md', SKILL('own')), f('skills/own/package.json', '{}')])))).toMatch(/skills\/own has a package\.json/)
  })
})

describe('the version the build gives a template', () => {
  const built = buildTemplate('crew', team(['dev-code-review']), sources)
  const db = (held: Array<{ version: string; digest: string }>) => ({ assetVersion: { findMany: async () => held } }) as unknown as Db
  const at = (version: string) => ({ version, digest: fingerprintOf(stampVersion(built, version)) })

  it("is the template's own version the first time", async () => {
    expect(await imageTemplateVersion(db([]), 'team', 'crew', built)).toBe('1.0.0')
  })

  it('is the version that already holds this content, whichever it is', async () => {
    expect(await imageTemplateVersion(db([at('1.0.0'), { version: '2.0.0', digest: 'other' }]), 'team', 'crew', built)).toBe('1.0.0')
    expect(await imageTemplateVersion(db([{ version: '1.0.0', digest: 'other' }, at('2.0.0')]), 'team', 'crew', built)).toBe('2.0.0')
  })

  it('is the next major version for new content, so a changed shelf skill never needs a hand-edited version', async () => {
    expect(await imageTemplateVersion(db([{ version: '1.0.0', digest: 'old' }, { version: '3.0.0', digest: 'older' }]), 'team', 'crew', built)).toBe('4.0.0')
  })

  it('changes only the manifest when stamped', () => {
    const stamped = stampVersion(built, '7.0.0')
    expect(JSON.parse(stamped.find(x => x.path === 'package.json')!.content.toString()).version).toBe('7.0.0')
    expect(stamped.filter(x => x.path !== 'package.json')).toEqual(built.filter(x => x.path !== 'package.json'))
  })
})
