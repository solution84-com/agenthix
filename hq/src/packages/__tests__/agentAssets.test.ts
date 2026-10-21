import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { withResponsibilities, initialAgentContent, readAssetContent } from '../agentAssets'

const HQ_ASSETS = path.resolve(__dirname, '../../../assets')
const saved = process.env.HQ_ASSETS_ROOT
beforeAll(() => { process.env.HQ_ASSETS_ROOT = HQ_ASSETS })
afterAll(() => { if (saved === undefined) delete process.env.HQ_ASSETS_ROOT; else process.env.HQ_ASSETS_ROOT = saved })

describe('agent assets', () => {
  it('ships only instructions.md as each library agent\'s identity files', async () => {
    const dirs = [...(await fs.readdir(path.join(HQ_ASSETS, 'library', 'agents'))).map(d => path.join(HQ_ASSETS, 'library', 'agents', d)), path.join(HQ_ASSETS, 'agents', 'template')]
    for (const dir of dirs) {
      const names = await fs.readdir(dir)
      expect(names).toContain('instructions.md')
      expect(names).not.toContain('PROFILE.md')
      expect(names).not.toContain('RESPONSIBILITIES.md')
      expect((await fs.readFile(path.join(dir, 'instructions.md'), 'utf-8')).trim()).not.toBe('')
    }
  })

  it('replaces the Responsibilities section, or appends one', () => {
    expect(withResponsibilities('## Custom\n\nx\n\n## Responsibilities\n\n- placeholder\n', '- Review PRs')).toBe('## Custom\n\nx\n\n## Responsibilities\n\n- Review PRs\n')
    expect(withResponsibilities('## Custom\n', '- Review PRs')).toBe('## Custom\n\n## Responsibilities\n\n- Review PRs\n')
  })

  it('builds a new agent\'s first content from the template, holding no settings', async () => {
    const draft = await initialAgentContent({ responsibilities: '- Ship it' })
    expect(draft).not.toHaveProperty('settings')
    expect(draft.instructions.endsWith('## Responsibilities\n\n- Ship it\n')).toBe(true)
    expect(draft.skillFiles).toEqual([])
  })

  it('reads a library agent\'s listed skills only', async () => {
    const qa = path.join(HQ_ASSETS, 'library', 'agents', 'qa')
    const draft = await readAssetContent(qa, ['run-tests'])
    expect(new Set(draft.skillFiles.map(f => f.path.split('/')[1]))).toEqual(new Set(['run-tests']))
  })
})
