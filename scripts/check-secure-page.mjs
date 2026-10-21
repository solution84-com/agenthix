// A browser gives some features only to a secure page (https, or localhost), and HQ is also opened over plain http
// at a network address, where they are simply missing. This fails while browser code uses one directly instead of
// through a helper that handles its absence, so a call that works at localhost cannot freeze a page elsewhere.
//   node scripts/check-secure-page.mjs
// The browser code is hq's (every file its client entry points and pages reach), the Fleet Console's screens and ui.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const CRYPTO = new Set(['crypto', 'window.crypto', 'self.crypto', 'globalThis.crypto'])
const NAVIGATOR = new Set(['navigator', 'window.navigator', 'self.navigator', 'globalThis.navigator'])
const CRYPTO_ONLY = ['randomUUID', 'subtle']
const NAVIGATOR_ONLY = [
  'clipboard', 'mediaDevices', 'serviceWorker', 'credentials', 'share', 'canShare', 'storage', 'wakeLock', 'locks',
  'geolocation', 'usb', 'hid', 'serial', 'bluetooth', 'gpu', 'xr', 'virtualKeyboard',
]
const GLOBAL_ONLY = ['Notification', 'caches', 'AudioWorkletNode', 'ClipboardItem', 'PaymentRequest', 'PublicKeyCredential']
const CALL_ONLY = ['showOpenFilePicker', 'showSaveFilePicker', 'showDirectoryPicker']

/** Every feature this check knows, as it reports them. */
export const FEATURES = [
  ...CRYPTO_ONLY.map(p => `crypto.${p}`),
  ...NAVIGATOR_ONLY.map(p => `navigator.${p}`),
  'audioWorklet',
  ...GLOBAL_ONLY,
  ...CALL_ONLY,
]

/**
 * The helpers that handle a feature's absence, and why each may use it directly. A use anywhere else fails; an
 * entry no longer used fails too, so the list stays true.
 */
export const HANDLED = {
  'hq/src/shared/randomId.ts': { 'crypto.randomUUID': 'falls back to crypto.getRandomValues, which every page has' },
  'ui/src/primitives/copyText.ts': { 'navigator.clipboard': 'falls back to a selected field and execCommand' },
  'hq/src/shared/securePage.ts': { 'navigator.mediaDevices': 'the microphone: says in words that it needs https or localhost' },
  'hq/src/conversations/voiceClient/adapters/microphone.ts': {
    audioWorklet: 'reached only once the microphone opened through securePage.ts',
    AudioWorkletNode: 'reached only once the microphone opened through securePage.ts',
  },
  'hq/src/conversations/voiceClient/lab/RecordingPanel.tsx': {
    audioWorklet: 'reached only once the microphone opened through securePage.ts',
    AudioWorkletNode: 'reached only once the microphone opened through securePage.ts',
  },
  'hq/src/conversations/voiceClient/models/modelFiles.ts': {
    'crypto.subtle': 'voice only; refuses in the words of securePage.ts when missing',
  },
}

const text = node => node.getText().replace(/\?\./g, '.').replace(/\s/g, '')
const name = node => (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) ? node.text : ts.isStringLiteralLike(node) ? node.text : null)

/** What an expression names, as `window.navigator`, seen through casts and brackets: `(navigator as X)` is `navigator`. */
function named(node) {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
    || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node)) node = node.expression
  if (ts.isIdentifier(node)) return node.text
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const on = named(node.expression)
    const prop = name(ts.isPropertyAccessExpression(node) ? node.name : node.argumentExpression)
    return on && prop ? `${on}.${prop}` : null
  }
  return null
}

function featureOf(node) {
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const prop = name(ts.isPropertyAccessExpression(node) ? node.name : node.argumentExpression)
    if (!prop) return null
    const on = named(node.expression)
    if (!on) return prop === 'audioWorklet' ? 'audioWorklet' : null
    if (CRYPTO.has(on) && CRYPTO_ONLY.includes(prop)) return `crypto.${prop}`
    if (NAVIGATOR.has(on) && NAVIGATOR_ONLY.includes(prop)) return `navigator.${prop}`
    if (prop === 'audioWorklet') return 'audioWorklet'
    // Notification.requestPermission, window.caches.open
    const bare = on.replace(/^(window|self|globalThis)\./, '')
    if (GLOBAL_ONLY.includes(bare)) return bare
    // window.showOpenFilePicker(), new window.ClipboardItem(…)
    if (['window', 'self', 'globalThis'].includes(on) && [...GLOBAL_ONLY, ...CALL_ONLY].includes(prop)) return prop
    return null
  }
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && GLOBAL_ONLY.includes(node.expression.text)) {
    return node.expression.text
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CALL_ONLY.includes(node.expression.text)) {
    return node.expression.text
  }
  // const { clipboard } = navigator
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isObjectBindingPattern(node.name)) {
    const from = named(node.initializer)
    for (const el of node.name.elements) {
      const prop = name(el.propertyName ?? el.name)
      if (NAVIGATOR.has(from) && NAVIGATOR_ONLY.includes(prop)) return `navigator.${prop}`
      if (CRYPTO.has(from) && CRYPTO_ONLY.includes(prop)) return `crypto.${prop}`
    }
  }
  return null
}

const parse = (file, source) =>
  ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

/** Each direct use of a secure-page-only feature in one file's source: its feature and line. */
export function directUses(source, file = 'file.ts') {
  const sf = parse(file, source)
  const uses = []
  const visit = node => {
    const feature = featureOf(node)
    if (feature) uses.push({ feature, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1 })
    // `navigator.mediaDevices.getUserMedia` is one use, not one per step of it.
    if (!feature) ts.forEachChild(node, visit)
  }
  visit(sf)
  return uses
}

/** The modules a file imports, by specifier: static, dynamic, re-exported, and `new URL('…', import.meta.url)`. */
export function importsOf(source, file = 'file.ts') {
  const sf = parse(file, source)
  const found = []
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!(node.importClause?.isTypeOnly || node.isTypeOnly)) found.push(node.moduleSpecifier.text)
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteralLike(node.arguments[0] ?? {})) {
      found.push(node.arguments[0].text)
    } else if (ts.isNewExpression(node) && text(node.expression) === 'URL' && node.arguments?.length === 2
      && ts.isStringLiteralLike(node.arguments[0]) && text(node.arguments[1]) === 'import.meta.url') {
      found.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js']

function resolve(from, spec) {
  if (!spec.startsWith('.')) return null
  const base = path.resolve(path.dirname(from), spec.replace(/\?.*$/, ''))
  for (const ext of EXTENSIONS) {
    const file = base + ext
    if (fs.existsSync(file) && fs.statSync(file).isFile() && /\.[mc]?[jt]sx?$/.test(file)) return file
  }
  return null
}

/** hq's client entry points: the client's setup and root component in main.wasp.ts, and every page. */
export function hqEntries(hqDir) {
  const declarations = [path.join(hqDir, 'main.wasp.ts'), ...walk(path.join(hqDir, 'src')).filter(f => f.endsWith('.wasp.ts'))]
  const entries = []
  for (const file of declarations) {
    const sf = parse(file, fs.readFileSync(file, 'utf8'))
    const refs = new Map()
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !st.importClause?.namedBindings || !ts.isNamedImports(st.importClause.namedBindings)) continue
      for (const el of st.importClause.namedBindings.elements) refs.set(el.name.text, st.moduleSpecifier.text)
    }
    const take = id => { const spec = refs.get(id); const to = spec && resolve(file, spec); if (to) entries.push(to) }
    const visit = node => {
      if (ts.isCallExpression(node) && text(node.expression) === 'page' && node.arguments[0] && ts.isIdentifier(node.arguments[0])) {
        take(node.arguments[0].text)
      }
      if (ts.isPropertyAssignment(node) && name(node.name) === 'client' && ts.isObjectLiteralExpression(node.initializer)) {
        for (const p of node.initializer.properties) if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.initializer)) take(p.initializer.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return entries
}

/** Every source file reachable from the entries through relative imports. */
export function reachable(entries) {
  const seen = new Set()
  const queue = [...entries]
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    for (const spec of importsOf(fs.readFileSync(file, 'utf8'), file)) {
      const to = resolve(file, spec)
      if (to && !seen.has(to)) queue.push(to)
    }
  }
  return seen
}

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.[mc]?[jt]sx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

const isTest = file => /(^|\/)__tests__\/|\.test\.[jt]sx?$|\.spec\.[jt]sx?$/.test(file)

/** The browser files this check reads, relative to the repository's root. */
export function browserFiles(root) {
  const hq = reachable(hqEntries(path.join(root, 'hq')))
  const rest = ['console-web/src', 'ui/src'].flatMap(dir => walk(path.join(root, dir)))
  return [...new Set([...hq, ...rest])].map(f => path.relative(root, f).split(path.sep).join('/')).filter(f => !isTest(f)).sort()
}

/** What fails: each direct use outside its helper, and each helper entry no longer used. */
export function check(root, handled = HANDLED) {
  const problems = []
  const used = new Set()
  const files = browserFiles(root)
  for (const file of files) {
    for (const { feature, line } of directUses(fs.readFileSync(path.join(root, file), 'utf8'), file)) {
      if (handled[file]?.[feature]) { used.add(`${file} ${feature}`); continue }
      problems.push(`${file}:${line} uses ${feature} directly. A browser gives it only to a secure page (https, or localhost), and HQ is also opened over plain http: go through a helper that handles its absence (hq/src/shared/randomId.ts, hq/src/shared/copyText.ts, hq/src/shared/securePage.ts), or add one.`)
    }
  }
  for (const [file, features] of Object.entries(handled)) {
    for (const feature of Object.keys(features)) {
      if (!used.has(`${file} ${feature}`)) problems.push(`${file} is listed as handling ${feature}, but ${files.includes(file) ? 'no longer uses it' : 'is not browser code this check reads'}: take it off the list in scripts/check-secure-page.mjs.`)
    }
  }
  return { problems, files }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const { problems, files } = check(root)
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  console.log(`${files.length} browser files use no secure-page-only feature (${FEATURES.join(', ')}) except through a helper.`)
}
