// node --test scripts/__tests__/check-secure-page.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { check, directUses } from '../check-secure-page.mjs'

const features = (source, file) => directUses(source, file).map(u => u.feature)

test('a direct call of a secure-page-only feature is caught @SC-1147', () => {
  assert.deepEqual(features('const id = crypto.randomUUID()'), ['crypto.randomUUID'])
  assert.deepEqual(features('const id = window.crypto.randomUUID()'), ['crypto.randomUUID'])
  assert.deepEqual(features('await navigator.clipboard.writeText(t)'), ['navigator.clipboard'])
  assert.deepEqual(features('await navigator.clipboard?.writeText(t)'), ['navigator.clipboard'])
  assert.deepEqual(features('await navigator.mediaDevices.getUserMedia({ audio: true })'), ['navigator.mediaDevices'])
  assert.deepEqual(features("navigator['serviceWorker'].register('/sw.js')"), ['navigator.serviceWorker'])
  assert.deepEqual(features('const { clipboard } = navigator'), ['navigator.clipboard'])
  assert.deepEqual(features('(navigator as { clipboard?: Clipboard }).clipboard?.writeText(t)'), ['navigator.clipboard'])
  assert.deepEqual(features('(window as Window).navigator.mediaDevices!.getUserMedia({})'), ['navigator.mediaDevices'])
  assert.deepEqual(features('await crypto.subtle.digest("SHA-256", b)'), ['crypto.subtle'])
  assert.deepEqual(features('await ctx.audioWorklet.addModule("/p.js"); new AudioWorkletNode(ctx, "p")'), ['audioWorklet', 'AudioWorkletNode'])
  assert.deepEqual(features('Notification.requestPermission(); new Notification("hi")'), ['Notification', 'Notification'])
  assert.deepEqual(features('await window.showOpenFilePicker()'), ['showOpenFilePicker'])
  assert.deepEqual(features('const c = <button onClick={() => navigator.clipboard.writeText(t)} />', 'a.tsx'), ['navigator.clipboard'])
})

test('words about a feature, and what only looks like one, are not uses @SC-1147', () => {
  assert.deepEqual(features('// crypto.randomUUID is missing over plain http\nconst s = "navigator.clipboard"'), [])
  assert.deepEqual(features('let node: AudioWorkletNode | null = null'), [])
  assert.deepEqual(features('await context.entities.Notification.findFirst({})'), [])
  assert.deepEqual(features("import { randomUUID } from 'node:crypto'\nrandomUUID()"), [])
  assert.deepEqual(features('crypto.getRandomValues(new Uint8Array(16))'), [])
})

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-page-'))
  for (const [file, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), source)
  }
  return root
}

const app = {
  'hq/main.wasp.ts': 'import { App } from "./src/App" with { type: "ref" };\nexport default app({ client: { rootComponent: App } })',
  'hq/src/feature/feature.wasp.ts': 'import { Page } from "./Page" with { type: "ref" };\nexport const spec = [route("R", "/r", page(Page, {}))]',
  'console-web/src/main.tsx': 'export {}',
  'ui/src/index.ts': 'export {}',
}

test('hq’s browser code is what its client and pages reach, not its server code @SC-1147', () => {
  const root = repo({
    ...app,
    'hq/src/App.tsx': "import { id } from './shared/id'\nexport const App = () => id()",
    'hq/src/shared/id.ts': 'export const id = () => crypto.randomUUID()',
    'hq/src/feature/Page.tsx': "export const Page = () => { void import('./lazy') }",
    'hq/src/feature/lazy.ts': 'export const copy = (t: string) => navigator.clipboard.writeText(t)',
    'hq/src/server/actions.ts': 'export const make = () => crypto.randomUUID()',
  })
  const { problems, files } = check(root, {})
  assert.ok(!files.includes('hq/src/server/actions.ts'))
  assert.equal(problems.length, 2)
  assert.match(problems[0], /^hq\/src\/feature\/lazy\.ts:1 uses navigator\.clipboard directly/)
  assert.match(problems[1], /^hq\/src\/shared\/id\.ts:1 uses crypto\.randomUUID directly/)
})

test('a helper may use the feature it handles, and one that no longer does is taken off the list @SC-1147', () => {
  const root = repo({
    ...app,
    'hq/src/App.tsx': "import { id } from './shared/id'\nexport const App = () => id()",
    'hq/src/shared/id.ts': 'export const id = () => crypto.randomUUID?.() ?? "x"',
    'hq/src/feature/Page.tsx': 'export const Page = () => null',
    'console-web/src/copy.ts': 'export const copy = (t: string) => navigator.clipboard.writeText(t)',
  })
  const handled = {
    'hq/src/shared/id.ts': { 'crypto.randomUUID': 'falls back' },
    'console-web/src/copy.ts': { 'navigator.clipboard': 'falls back', 'crypto.subtle': 'no longer used' },
  }
  assert.deepEqual(check(root, handled).problems, [
    'console-web/src/copy.ts is listed as handling crypto.subtle, but no longer uses it: take it off the list in scripts/check-secure-page.mjs.',
  ])
})

test('the repository passes @SC-1147', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  assert.deepEqual(check(root).problems, [])
})
