import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const LIBRARY = join(__dirname, '../../../assets/library')

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return markdownFiles(path)
    return name.endsWith('.md') ? [path] : []
  })
}

// An agent's container holds no GitHub token: git is shared through workflows. A line may name what
// is forbidden only when it says so.
const FORBIDDEN = [/agenthix-git-credential/, /credential\.helper/, /git credential/, /\bgit\s+(push|fetch)\b/]
const NEGATED = /don't|do not|never|fails|no credential helper/i

describe('bundled library guidance on git and GitHub', () => {
  const files = markdownFiles(LIBRARY)

  it('finds the library files', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('never tells an agent to use a credential helper, fetch a token, or run git push or git fetch', () => {
    const offending: string[] = []
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (FORBIDDEN.some((re) => re.test(line)) && !NEGATED.test(line)) {
            offending.push(`${relative(LIBRARY, file)}:${i + 1}: ${line.trim()}`)
          }
        })
    }
    expect(offending).toEqual([])
  })
})
