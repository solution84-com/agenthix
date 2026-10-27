/**
 * Part 6, T7 and V11's PDF half: a PDF that carries JavaScript runs none of it. The viewer uses only pdf.js's display
 * API, which has no way to run a PDF's script; this checks the fixture really carries script, that the viewer's bundle
 * holds nothing of pdf.js's scripting, and that the viewer's files leave its engine out. The lead's browser test opens
 * the same fixture in the frame.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { documentOptions } from '../documentOptions'

const here = import.meta.dirname
const fixture = () => new Uint8Array(readFileSync(join(here, 'fixtures/javascript.pdf')))
// (pdf.js's annotation layer, unused here, names an `enableScripting` option of its own; that is not an engine.)
const SCRIPTING = /quickjs|pdf\.sandbox|ScriptingManager|createSandbox/
const scripts = (actions: unknown) => JSON.stringify(actions instanceof Map ? [...actions] : actions)

describe('a PDF that carries JavaScript @SC-1488 @SC-1568', () => {
  it('is a real PDF with script on opening and on its page, and a link and a form field', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const options = documentOptions('https://files.example.com')
    const task = pdfjs.getDocument({ ...options, data: fixture(), useWorkerFetch: false, useWasm: false, verbosity: 0 })
    const doc = await task.promise
    expect(doc.numPages).toBe(1)
    const actions = await doc.getJSActions()
    expect(scripts(actions)).toContain('app.alert')
    const page = await doc.getPage(1)
    expect(scripts(await page.getJSActions())).toContain('app.alert')
    const annotations = await page.getAnnotations()
    expect(annotations.some(a => a.subtype === 'Link')).toBe(true)
    expect(annotations.some(a => a.subtype === 'Widget')).toBe(true)
    await task.destroy()
  })

  it('finds nothing in the viewer that could run it: its bundle has none of pdf.js’s scripting', async () => {
    const result = await build({
      bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, logLevel: 'silent',
      entryPoints: [join(here, '../main.ts')], outfile: 'viewer.js',
    })
    const inputs = Object.keys(result.metafile.inputs)
    expect(inputs.some(i => i.includes('pdfjs-dist/build/pdf.mjs'))).toBe(true)
    expect(inputs.filter(i => /sandbox|pdfjs-dist\/web\//.test(i))).toEqual([])
    expect(result.outputFiles[0].text).not.toMatch(SCRIPTING)
  })

  it('is not given pdf.js’s script engine among the viewer’s files', () => {
    const script = readFileSync(join(here, '../../../scripts/build.mjs'), 'utf8')
    const copied = script.slice(script.indexOf("for (const name of ["), script.indexOf(']) cpSync'))
    expect(copied).toContain('openjpeg.wasm')
    expect(copied).not.toMatch(/quickjs|sandbox/)
    expect(script).not.toMatch(/cpSync\([^)]*'wasm'\)/)
  })
})
