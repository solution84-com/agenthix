/**
 * The store's one reader of a value is `valuesForRun`, for a run (adr-0147). This keeps it that way: no module but
 * the store and the run's own code may name it, and nothing outside the store decrypts a place's secret or reads its
 * ciphertext.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(__dirname, '../..')

/** The store itself, and the run's code (`workflows/runs*.ts`), which sends the values to the site. */
const MAY_READ = [/^secrets\/store\.ts$/, /^workflows\/runs[^/]*\.ts$/]
/** Only the store's database side touches a ciphertext column; placeDeletion only deletes rows. */
const MAY_TOUCH_ROWS = [/^secrets\/db\.ts$/, /^secrets\/placeDeletion\.ts$/]

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sources(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

const files = sources(SRC).map(f => ({ rel: path.relative(SRC, f).split(path.sep).join('/'), text: readFileSync(f, 'utf8') }))

describe('the only reader of a secret', () => {
  // Code, not a comment naming it in backticks.
  it('is named only by the store and the run', () => {
    const naming = files.filter(f => /(?<!`)\bvaluesForRun\b(?!`)/.test(f.text)).map(f => f.rel)
    expect(naming.filter(rel => !MAY_READ.some(re => re.test(rel)))).toEqual([])
  })

  it('leaves place secrets’ rows to the store’s database side', () => {
    const touching = files.filter(f => /\bplaceSecret\.(find|create|update|upsert|delete|aggregate|groupBy)/.test(f.text)).map(f => f.rel)
    expect(touching.filter(rel => !MAY_TOUCH_ROWS.some(re => re.test(rel)))).toEqual([])
  })
})
