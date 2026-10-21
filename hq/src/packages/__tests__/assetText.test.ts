import { describe, it, expect } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'

const ASSETS = path.resolve(__dirname, '../../../assets')

async function textFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await textFiles(full)))
    else if (/\.(md|json)$/.test(entry.name)) out.push(full)
  }
  return out
}

// Places no run reads any more: an agent told to write a skill there writes it for nobody.
const STALE = [/private workspace/i, /PROFILE\.md/, /RESPONSIBILITIES\.md/, /(^|[\s`'"(])\/?shared\//, /(^|[\s`'"(])\/assets\//]

describe('agent-facing asset text', () => {
  it('names no disk location a run no longer reads', async () => {
    const hits: string[] = []
    for (const file of await textFiles(ASSETS)) {
      const lines = (await fs.readFile(file, 'utf-8')).split('\n')
      lines.forEach((line, i) => {
        if (STALE.some(re => re.test(line))) hits.push(`${path.relative(ASSETS, file)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(hits).toEqual([])
  })
})
