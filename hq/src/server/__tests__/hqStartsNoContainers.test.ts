import { describe, it, expect } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * hq dispatches; site executes (ADR-0050). Three containers used to be started
 * from hq — preview, an onboarding runtime check that has since been removed,
 * and voice phrase generation — and none is left.
 *
 * This is a source scan, which is a weak instrument and is used deliberately
 * anyway: what is being asserted IS a property of hq's source, not of any one
 * behaviour, and no unit test of any single module can see the next one
 * somebody adds. It catches `spawn('docker', …)`, `execFile('docker', …)`, and
 * a bare `'docker', [` argv-style literal — a single- or double-quoted
 * `'docker'` string literal in each of those three shapes. It does not catch
 * an import: there is no pattern here for one, because hq has never had a
 * docker SDK dependency to import. It would not catch a container started
 * under a different binary name, a single-string call such as
 * `exec('docker ps')`, or a template-literal call such as `` spawn(`docker`) ``
 * — none of the three patterns match a template literal, regardless of name.
 * It says so rather than implying it is exhaustive.
 */
const FORBIDDEN = [/spawn\(\s*['"]docker['"]/, /execFile\(\s*['"]docker['"]/, /['"]docker['"]\s*,\s*\[/]

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else {
      yield full
    }
  }
}

describe('hq starts no containers', () => {
  it('has no module that spawns the docker binary', async () => {
    const offenders: string[] = []
    for await (const file of walk(path.join(__dirname, '../..'))) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue
      if (file.includes('__tests__')) continue
      const source = await readFile(file, 'utf8')
      if (FORBIDDEN.some((re) => re.test(source))) offenders.push(path.relative(process.cwd(), file))
    }
    expect(offenders).toEqual([])
  })
})
