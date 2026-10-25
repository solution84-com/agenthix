/**
 * A person's changes to knowledge (agent knowledge spec, part 2, *The gate*; part 4, *Who reaches what*): who may
 * change, each change through the site's gate and recorded with the person (G5), a conflict answered with the
 * current text and who made it, a move as a write and a delete with one record each, restore, and permanent deletion.
 */
import { describe, expect, it } from 'vitest'
import { versionOf } from '@agenthix/core/file-tools'
import { deletePage, movePage, restoreVersion, savePage } from '../changes'
import { ORG, PAGE, WEB, fakePeople } from './fakePeople'

const v = (t: string) => versionOf(Buffer.from(t, 'utf8'))
const web = { ownerType: 'project' as const, ownerId: WEB.ownerId }
const org = { ownerType: 'org' as const }
const KEPT = '20261025T100000000Z-0000abcd'
const EDITED = PAGE.replace('after the checks pass', "once Mia approves")

function setup() {
  const f = fakePeople()
  f.sites.put(WEB, 'processes/release.md', PAGE)
  f.allow(web, 'sam', 'changes')
  f.allow(web, 'vic', 'reads')
  f.allow(org, 'sam', 'reads')
  f.allow(org, 'ada', 'changes')
  return f
}

const siteCalls = (f: ReturnType<typeof setup>) => f.sites.calls.filter(c => c.method !== 'read').length

describe('who may change', () => {
  it('a Viewer of the project, and a member who is not an organisation admin for org:, are refused before the site is asked @SC-1417', async () => {
    const f = setup()
    await expect(savePage(f.deps, web, { page: 'processes/release.md', content: EDITED, baseVersion: v(PAGE) }, 'vic'))
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(/Member or Admin role.*Nothing was changed\.$/) })
    await expect(savePage(f.deps, org, { page: 'how-we-work/review.md', content: PAGE, baseVersion: null }, 'sam'))
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(/Only an organisation admin.*Nothing was changed\.$/) })
    expect(f.sites.calls).toEqual([])
    expect(f.records).toEqual([])
  })

  it('someone who may not read the place is refused, and nothing is asked of the site @SC-1417', async () => {
    const f = setup()
    for (const call of [
      () => savePage(f.deps, web, { page: 'a.md', content: PAGE, baseVersion: null }, 'eve'),
      () => movePage(f.deps, web, { from: 'processes/release.md', to: 'b.md', baseVersion: v(PAGE) }, 'eve'),
      () => deletePage(f.deps, web, { page: 'processes/release.md' }, 'eve'),
      () => restoreVersion(f.deps, web, { page: 'processes/release.md', versionId: '20261025T100000000Z-0000abcd' }, 'eve'),
    ]) await expect(call()).rejects.toMatchObject({ status: 403 })
    expect(f.sites.calls).toEqual([])
  })

  it('an organisation admin changes org: @SC-1417', async () => {
    const f = setup()
    const result = await savePage(f.deps, org, { page: 'how-we-work/review.md', content: PAGE, baseVersion: null }, 'ada')
    expect(result).toMatchObject({ outcome: 'done', change: 'created' })
    expect(f.sites.text(ORG, 'how-we-work/review.md')).toBe(PAGE)
  })

  it("refuses a name that leaves the place's folder before anything is asked @SC-1418", async () => {
    const f = setup()
    for (const page of ['../files/AGENTS.md', '/etc/passwd', 'a/../../b.md', 'a\\b.md', 'x\0.md']) {
      await expect(savePage(f.deps, web, { page, content: PAGE, baseVersion: null }, 'sam')).rejects.toMatchObject({ status: 400 })
    }
    expect(f.sites.calls).toEqual([])
  })
})

describe('saving', () => {
  it('goes through the gate and is recorded with the person, and no agent @SC-1420', async () => {
    const f = setup()
    const result = await savePage(f.deps, web, { page: 'processes/release.md', content: EDITED, baseVersion: v(PAGE) }, 'sam')
    expect(result).toEqual({ outcome: 'done', page: 'processes/release.md', change: 'edited', version: v(EDITED), previousVersionId: 'k1' })
    expect(f.records).toEqual([expect.objectContaining({ owner: WEB, page: 'processes/release.md', kind: 'edited', version: v(EDITED), reach: { userId: 'sam' } })])
  })

  it('a conflict keeps nothing, and answers with the current text and who made it @SC-1421', async () => {
    const f = setup()
    await savePage(f.deps, web, { page: 'processes/release.md', content: EDITED, baseVersion: v(PAGE) }, 'sam')
    const mine = PAGE.replace('checks pass', 'checks pass and the tests')
    const result = await savePage(f.deps, web, { page: 'processes/release.md', content: mine, baseVersion: v(PAGE) }, 'sam')
    expect(result).toMatchObject({
      outcome: 'refused', reason: 'conflict', current: { content: EDITED, version: v(EDITED) },
      lastChange: { by: { kind: 'person', name: 'sam' }, change: 'edited' },
    })
    expect(f.records).toHaveLength(1)
  })

  it("answers the gate's problems for the editor to show on its fields, recording nothing @SC-1420", async () => {
    const f = setup()
    const result = await savePage(f.deps, web, { page: 'new.md', content: 'no front matter', baseVersion: null }, 'sam')
    expect(result).toMatchObject({ outcome: 'refused', reason: 'problems' })
    expect(f.records).toEqual([])
  })

  it('refuses a page over 64 KB with the problem on the text, before the site is asked @SC-1420', async () => {
    const f = setup()
    const result = await savePage(f.deps, web, { page: 'big.md', content: `---\ntitle: Big\n---\n${'x'.repeat(70 * 1024)}`, baseVersion: null }, 'sam')
    expect(result).toMatchObject({ outcome: 'refused', reason: 'problems', problems: [{ code: 'too_large', field: 'content' }] })
    expect(siteCalls(f)).toBe(0)
  })

  it('a change the site made stands when its record cannot be written, and the log says so without its detail @SC-1420', async () => {
    const f = setup()
    f.failRecords(true)
    await expect(savePage(f.deps, web, { page: 'processes/release.md', content: EDITED, baseVersion: v(PAGE) }, 'sam')).resolves.toMatchObject({ outcome: 'done' })
    expect(JSON.stringify(f.warnings)).not.toContain('10.0.0.9')
  })

  it('a site that cannot be reached is said in words, never its error @SC-1420', async () => {
    const f = setup()
    f.sites.modes.set('project:p-web', 'throws')
    const err = await savePage(f.deps, web, { page: 'processes/release.md', content: EDITED, baseVersion: v(PAGE) }, 'sam').catch(e => e)
    expect(err).toMatchObject({ status: 502, message: expect.stringMatching(/could not finish.*Nothing was changed\.$/) })
    expect(err.message).not.toContain('10.0.0.7')
    f.sites.modes.set('project:p-web', 'unreachable')
    await expect(savePage(f.deps, web, { page: 'processes/release.md', content: EDITED, baseVersion: v(PAGE) }, 'sam')).rejects.toMatchObject({ status: 503 })
  })
})

describe('moving @SC-1422', () => {
  it('writes the page under its new name and deletes the old one, with one record each', async () => {
    const f = setup()
    const result = await movePage(f.deps, web, { from: 'processes/release.md', to: 'how-we-work/release.md', baseVersion: v(PAGE) }, 'sam')
    expect(result).toMatchObject({ outcome: 'done', page: 'how-we-work/release.md', change: 'moved' })
    expect(f.sites.text(WEB, 'how-we-work/release.md')).toBe(PAGE)
    expect(f.sites.text(WEB, 'processes/release.md')).toBeUndefined()
    expect(f.sites.calls.find(c => c.method === 'write')?.params).toMatchObject({ page: 'how-we-work/release.md', baseVersion: null, movedFrom: 'processes/release.md' })
    expect(f.sites.calls.find(c => c.method === 'delete')?.params).toMatchObject({ page: 'processes/release.md', movedTo: 'how-we-work/release.md' })
    expect(f.records.map(r => ({ page: r.page, kind: r.kind, fromPage: r.fromPage }))).toEqual([
      { page: 'how-we-work/release.md', kind: 'moved', fromPage: 'processes/release.md' },
      { page: 'processes/release.md', kind: 'moved', fromPage: undefined },
    ])
  })

  it('refuses a page changed since the person opened it, with its current text', async () => {
    const f = setup()
    const result = await movePage(f.deps, web, { from: 'processes/release.md', to: 'b.md', baseVersion: v('older') }, 'sam')
    expect(result).toMatchObject({ outcome: 'refused', reason: 'conflict', current: { content: PAGE, version: v(PAGE) } })
    expect(f.sites.text(WEB, 'b.md')).toBeUndefined()
    expect(f.records).toEqual([])
  })

  it('refuses a name already taken, leaving both pages as they were', async () => {
    const f = setup()
    f.sites.put(WEB, 'b.md', PAGE)
    expect(await movePage(f.deps, web, { from: 'processes/release.md', to: 'b.md', baseVersion: v(PAGE) }, 'sam')).toMatchObject({ outcome: 'refused', reason: 'conflict' })
    expect(f.sites.text(WEB, 'processes/release.md')).toBe(PAGE)
    expect(f.records).toEqual([])
  })

  it('removes the new page again when the old one cannot be deleted, so it is never under both names', async () => {
    const f = setup()
    const realDelete = f.sites.delete
    f.sites.delete = async (owner, change) => (change.movedTo ? { ok: false, why: 'unreachable' } : realDelete(owner, change))
    await expect(movePage(f.deps, web, { from: 'processes/release.md', to: 'b.md', baseVersion: v(PAGE) }, 'sam')).rejects.toMatchObject({ status: 503 })
    expect(f.sites.text(WEB, 'b.md')).toBeUndefined()
    expect(f.sites.text(WEB, 'processes/release.md')).toBe(PAGE)
    expect(f.records).toEqual([])
  })

  it('refuses a move to the name it has', async () => {
    const f = setup()
    await expect(movePage(f.deps, web, { from: 'a.md', to: 'a.md', baseVersion: 'x' }, 'sam')).rejects.toMatchObject({ status: 400 })
  })
})

describe('deleting and restoring', () => {
  it('deletes into Recently deleted, recorded with the version it had @SC-1423', async () => {
    const f = setup()
    expect(await deletePage(f.deps, web, { page: 'processes/release.md' }, 'sam')).toMatchObject({ outcome: 'done', change: 'deleted', previousVersionId: 'k-del' })
    expect(f.records).toEqual([expect.objectContaining({ page: 'processes/release.md', kind: 'deleted', version: v(PAGE), reach: { userId: 'sam' } })])
    expect(f.sites.kept.get('k-del')?.text).toBe(PAGE)
  })

  it('deletes a page and all its versions permanently, or one kept version only @SC-1424', async () => {
    const f = setup()
    await savePage(f.deps, web, { page: 'processes/release.md', content: EDITED, baseVersion: v(PAGE) }, 'sam')
    f.sites.kept.set(KEPT, f.sites.kept.get('k1')!)
    f.sites.kept.delete('k1')
    await deletePage(f.deps, web, { page: 'processes/release.md', permanently: true, versionId: KEPT }, 'sam')
    expect(f.sites.kept.has(KEPT)).toBe(false)
    expect(f.sites.text(WEB, 'processes/release.md')).toBe(EDITED)
    await deletePage(f.deps, web, { page: 'processes/release.md', permanently: true }, 'sam')
    expect(f.sites.text(WEB, 'processes/release.md')).toBeUndefined()
    expect(f.records.map(r => r.kind)).toEqual(['edited', 'deleted', 'deleted'])
    expect(f.sites.calls.filter(c => c.method === 'delete').map(c => c.params)).toEqual([
      { page: 'processes/release.md', permanently: true, versionId: KEPT },
      { page: 'processes/release.md', permanently: true },
    ])
  })

  it('refuses one version deleted any way but permanently @SC-1424', async () => {
    const f = setup()
    await expect(deletePage(f.deps, web, { page: 'processes/release.md', versionId: '20261025T100000000Z-0000abcd' }, 'sam')).rejects.toMatchObject({ status: 400 })
  })

  it('restores a kept version as a new version, recorded as restored @SC-1425', async () => {
    const f = setup()
    await savePage(f.deps, web, { page: 'processes/release.md', content: EDITED, baseVersion: v(PAGE) }, 'sam')
    const result = await restoreVersion(f.deps, web, { page: 'processes/release.md', versionId: 'k1' }, 'sam').catch(e => e)
    // `k1` is the fake's id; a real one has the site's form, which the operation checks first.
    expect(result).toMatchObject({ status: 400 })
    f.sites.kept.set(KEPT, { ...f.sites.kept.get('k1')! })
    expect(await restoreVersion(f.deps, web, { page: 'processes/release.md', versionId: KEPT }, 'sam'))
      .toMatchObject({ outcome: 'done', change: 'restored', version: v(PAGE) })
    expect(f.sites.text(WEB, 'processes/release.md')).toBe(PAGE)
    expect(f.records.at(-1)).toMatchObject({ kind: 'restored', version: v(PAGE), reach: { userId: 'sam' } })
  })
})
