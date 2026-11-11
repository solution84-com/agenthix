/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

// The guard for the design system (ui/DESIGN-SYSTEM.md, "The guard test"): it reads every source file of ui, hq and
// console-web (tests excluded) and fails, naming file and line, on a retired pattern that can be matched as text.
// A match left in the code on purpose goes on ALLOW below, with the reason; a stale entry fails too.

// Tests, test folders and the model checks are left out by the negative globs.
const SOURCES: Record<string, string> = import.meta.glob(
  [
    '../**/*.{ts,tsx}', '../../../hq/src/**/*.{ts,tsx}', '../../../console-web/src/**/*.{ts,tsx}',
    '!**/__tests__/**', '!**/__modelchecks__/**', '!**/*.test.{ts,tsx}',
  ],
  { query: '?raw', import: 'default', eager: true },
)

interface Rule { name: string; pattern: RegExp; appliesTo: 'all' | 'hq-ui' }

const PALETTE = '(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)'
const UTILITY = '(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|shadow|decoration|accent|caret|placeholder)'

const RULES: Rule[] = [
  { name: 'indigo selection (bg-accent-subtle)', pattern: /\bbg-accent-subtle\b/, appliesTo: 'hq-ui' },
  { name: 'indigo selection (bg-accent/<n>)', pattern: /\bbg-accent\/\d+/, appliesTo: 'hq-ui' },
  { name: 'border-accent on a choice or a field', pattern: /\bborder-accent(?:\/\d+)?(?![\w-])/, appliesTo: 'hq-ui' },
  { name: 'accent edge or ring on focus', pattern: /\bfocus(?:-within)?:(?:border|ring)-accent\b/, appliesTo: 'hq-ui' },
  { name: 'disabled opacity other than 40', pattern: /\bdisabled:opacity-(?!40\b)\d+/, appliesTo: 'hq-ui' },
  { name: 'shadow-2xl', pattern: /\bshadow-2xl\b/, appliesTo: 'hq-ui' },
  { name: 'font-semibold or font-bold (regular and medium only)', pattern: /\bfont-(?:semibold|bold|extrabold)\b/, appliesTo: 'hq-ui' },
  { name: 'an em font size', pattern: /\btext-\[[\d.]+em\]|fontSize:\s*['"][\d.]+em['"]/, appliesTo: 'hq-ui' },
  { name: 'a hex colour', pattern: /(?<![\w&/#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b(?!-)/, appliesTo: 'all' },
  { name: 'a raw <select> (NativeSelect or PlainSelect)', pattern: /<select\b/, appliesTo: 'hq-ui' },
  { name: 'an arbitrary text size (the type scale)', pattern: /\btext-\[[\d.]+px\]/, appliesTo: 'hq-ui' },
  { name: 'hover without not-disabled: beside disabled', pattern: /^(?=.*(?:\$\{DISABLED\}|(?<![\w-])disabled:))(?=.*(?:^|[\s'"`{])hover:)/, appliesTo: 'hq-ui' },
  // An initials mark is identity and keeps its colour, but through INITIALS_MARK (the avatar gradient), so the accent
  // fill with white text is always a copy of the main button.
  { name: 'a hand-copied main button (BUTTON_PRIMARY)', pattern: /^(?=.*(?<![\w:-])bg-accent(?![\w/-]))(?=.*\btext-on-accent\b)/, appliesTo: 'hq-ui' },
  // Messages (DESIGN-SYSTEM.md, *Messages*): a message about the screen is the attention dialog or the refused control.
  { name: 'an inline alert (role="alert" outside the attention dialog)', pattern: /\brole=\{?["']alert["']/, appliesTo: 'all' },
  { name: 'a retired message helper (RefusedAction, ErrorDialog, FormError, ErrorLine)', pattern: /\b(?:RefusedAction|ErrorDialog|FormError|ErrorLine)\b/, appliesTo: 'all' },
  { name: 'the retired read-failure dialog builder (readFailure)', pattern: /\breadFailure\(/, appliesTo: 'all' },
  { name: 'a palette colour class', pattern: new RegExp(`\\b${UTILITY}-${PALETTE}-\\d{2,3}\\b|\\b(?:bg|text|border|ring|fill|stroke|from|to|via)-(?:white|black)\\b`), appliesTo: 'all' },
]

const INLINE_ALERT = 'an inline alert (role="alert" outside the attention dialog)'
const BROWSER_DIALOG = "the browser's alert, confirm or prompt"
const NO_KIND = 'a message without a kind (useAttentionWhen, ShowAttention, Notice)'
const SILENCE_AS_DIALOG = "a site's silence drawn as a dialog"

// Rules that need more than one line: a call or an element read whole, or a name looked up in the whole file.

/** The index just past the bracket that closes the one at `from`, skipping strings. */
function closing(source: string, from: number): number {
  let depth = 0
  for (let i = from; i < source.length; i++) {
    const c = source[i]
    if (c === "'" || c === '"' || c === '`') { i = source.indexOf(c, i + 1); if (i < 0) return source.length; continue }
    if (c === '(' || c === '{' || c === '[') depth++
    else if (c === ')' || c === '}' || c === ']') { depth--; if (depth === 0) return i + 1 }
  }
  return source.length
}

/** The opening tag that starts at `from`, braces skipped, up to its `>`. */
function openingTag(source: string, from: number): string {
  for (let i = from; i < source.length; i++) {
    if (source[i] === '{') { i = closing(source, i) - 1; continue }
    if (source[i] === '>') return source.slice(from, i + 1)
  }
  return source.slice(from)
}

const lineOf = (source: string, at: number) => source.slice(0, at).split('\n').length
const textAt = (source: string, at: number) => source.split('\n')[lineOf(source, at) - 1].trim().slice(0, 120)

// A message says how it is said: a dialog (`alert`) or a nudge in the page (`nudge`). The hook's own file passes its
// options through.
function withoutKind(file: string, source: string): number[] {
  if (file === 'ui/src/attention/useAttentionWhen.tsx') return []
  const at: number[] = []
  for (const m of source.matchAll(/(?<!function )\buseAttentionWhen\(/g)) {
    const start = m.index + m[0].length - 1
    if (!/[{,]\s*kind\s*[:,}]/.test(source.slice(start, closing(source, start)))) at.push(m.index)
  }
  const tags = file.startsWith('console-web/') ? /<(?:ShowAttention|Notice)\b/g : /<ShowAttention\b/g
  for (const m of source.matchAll(tags)) if (!/\skind=/.test(openingTag(source, m.index))) at.push(m.index)
  return at
}

// The browser's own dialogs. A function of the file's own named `confirm` (a dialog's action) is not one.
function browserDialogs(source: string): number[] {
  const at: number[] = []
  for (const m of source.matchAll(/(?<![\w.$])(window\.)?(alert|confirm|prompt)\(/g)) {
    const name = m[2]
    const bound = new RegExp(`\\b(?:function|const|let|var)\\s+${name}\\b|[{,(]\\s*${name}\\s*[,})=:]`).test(source)
    if (m[1] || !bound) at.push(m.index)
  }
  return at
}

// A site that did not answer is a nudge in the page (handler 8), never the dialog.
const SITE_SILENCE = ['ui/src/primitives/UnansweredSitesNotice.tsx', 'hq/src/storage/pages/SilentSitesLine.tsx']

// The role="alert" lines that stay, by why. Grouped so the reasons stay few; a new line needs a reason here.
const ALERTS_THAT_STAY: { reason: string; files: string[] }[] = [
  { reason: 'the attention dialog itself', files: ['ui/src/primitives/AttentionDialog.tsx'] },
  {
    reason: 'a form field\'s own error, under its field',
    files: [
      'ui/src/projects/AutomationLimitsForm.tsx', 'ui/src/agents/tabs/ConfigurationTab.tsx',
      'hq/src/storage/pages/knowledge/EditorFields.tsx', 'hq/src/storage/pages/knowledge/NewSection.tsx', 'hq/src/storage/pages/knowledge/PageActions.tsx',
      'hq/src/assets/pages/editor/EditFile.tsx', 'hq/src/assets/pages/editor/EditorTree.tsx',
    ],
  },
  {
    reason: 'the page is the refusal: a gate or a thing that is not there, with nothing else to show',
    files: [
      ],
  },
  {
    reason: 'part of the thing shown (a run\'s failure, the agent\'s question, a page\'s problems, what a check found in a package, a merge\'s clashes, a withdrawn version): a record, not a message',
    files: [
      'hq/src/workspaceView/components/LivePreviewStrip.tsx', 'hq/src/storage/pages/knowledge/PageView.tsx',
      'hq/src/assets/pages/add/InstallDialog.tsx', 'hq/src/assets/pages/asset/dialogs/OnPurposeDialog.tsx', 'hq/src/workspaceView/components/MergeDialog.tsx',
      'hq/src/assets/pages/asset/dialogs/MoveDialog.tsx',
    ],
  },
]

// Files the message lanes deleted; the one way to say each thing is in `@agenthix/ui/attention` and the primitives.
const DELETED = [
  'hq/src/attention/', 'hq/src/shared/components/ShowAttention.tsx', 'hq/src/shared/components/RefusedAction.tsx',
  'hq/src/assets/components/Notice.tsx', 'hq/src/workflows/components/ErrorLine.tsx',
  // One confirm dialog, `ConfirmDialog` in the primitives, replaced these.
  'hq/src/shared/components/ConfirmDialog.tsx', 'ui/src/sessions/ConfirmDialog.tsx', 'console-web/src/components/ConfirmModal.tsx',
  'hq/src/projects/pages/useListReadFailure.ts',
]

// File (relative to the repository) and rule name, with why the match stays. Keep it short.
const ALLOW: { file: string; rule: string; reason: string }[] = [
  ...ALERTS_THAT_STAY.flatMap(g => g.files.map(file => ({ file, rule: INLINE_ALERT, reason: g.reason }))),
  { file: 'hq/src/shared/components/MarkdownMessage.tsx', rule: 'font-semibold or font-bold (regular and medium only)', reason: 'rendered Markdown: a bold span is bold' },
  { file: 'ui/src/agents/helpers.tsx', rule: 'font-semibold or font-bold (regular and medium only)', reason: 'renders an agent prompt\'s Markdown headings' },
  { file: 'hq/src/github/githubAppApi.ts', rule: 'a hex colour', reason: 'a standalone HTML page GitHub returns to, served outside the app, so it has no tokens' },
  { file: 'ui/src/tasks/RunAvatar.tsx', rule: 'border-accent on a choice or a field', reason: 'the running ring is a data mark, not a choice' },
  { file: 'ui/src/timeline/barStyle.ts', rule: 'indigo selection (bg-accent/<n>)', reason: 'the in-progress bar encodes state, not a choice' },
  { file: 'ui/src/timeline/barStyle.ts', rule: 'border-accent on a choice or a field', reason: 'the in-progress bar encodes state, not a choice' },
  { file: 'ui/src/primitives/StatCard.tsx', rule: 'indigo selection (bg-accent/<n>)', reason: 'the icon tile of a card nothing in hq uses' },
  { file: 'ui/src/tasks/TaskListRow.tsx', rule: 'border-accent on a choice or a field', reason: 'a checkbox that is on is accent: a thing switched on' },
  { file: 'hq/src/dock/InboxRow.tsx', rule: 'border-accent on a choice or a field', reason: 'a checkbox that is on is accent: a thing switched on' },
  { file: 'hq/src/projects/workroom/StartDialogs.tsx', rule: 'border-accent on a choice or a field', reason: 'a checkbox that is on is accent: a thing switched on' },
  { file: 'hq/src/projects/sprints/SprintDialogs.tsx', rule: 'border-accent on a choice or a field', reason: 'a radio that is on is accent: a thing switched on' },
  { file: 'hq/src/projects/pages/settings/types/NewTaskTypePage.tsx', rule: 'border-accent on a choice or a field', reason: 'a radio that is on is accent: a thing switched on' },
  { file: 'ui/src/primitives/NativeSelect.tsx', rule: 'a raw <select> (NativeSelect or PlainSelect)', reason: 'the one select itself' },
  { file: 'ui/src/primitives/PlainSelect.tsx', rule: 'a raw <select> (NativeSelect or PlainSelect)', reason: 'the plain-text picker itself' },
  { file: 'ui/src/primitives/buttonStyles.ts', rule: 'a hand-copied main button (BUTTON_PRIMARY)', reason: 'the main button\'s one copy' },
  { file: 'ui/src/tasks/TaskListRow.tsx', rule: 'a hand-copied main button (BUTTON_PRIMARY)', reason: 'a checkbox that is on is accent: a thing switched on' },
  { file: 'hq/src/auth/pages/parts/BrandSide.tsx', rule: 'a hand-copied main button (BUTTON_PRIMARY)', reason: 'the sign-in brand panel: an identity surface, not a button' },
  { file: 'hq/src/dock/InboxRow.tsx', rule: 'a hand-copied main button (BUTTON_PRIMARY)', reason: 'a checkbox that is on is accent: a thing switched on' },
  { file: 'hq/src/projects/workroom/StartDialogs.tsx', rule: 'a hand-copied main button (BUTTON_PRIMARY)', reason: 'a checkbox that is on is accent: a thing switched on' },
  { file: 'ui/src/tasks/RunAvatar.tsx', rule: 'an arbitrary text size (the type scale)', reason: 'the "!" inside the run ring\'s 11 px mark, a data mark below the type scale' },
  // Today's browser dialogs: lane 3.6 moves each to its handler and removes its entry here.
  ...[
    ].map(file => ({ file, rule: BROWSER_DIALOG, reason: 'moved by lane 3.6' })),
]

function repoPath(key: string): string {
  const parts = key.split('/').filter(p => p !== '..')
  return key.startsWith('../../../') ? parts.join('/') : `ui/src/${parts.join('/')}`
}

function scan() {
  const found: { file: string; line: number; rule: string; text: string }[] = []
  for (const [key, source] of Object.entries(SOURCES)) {
    const file = repoPath(key)
    const hqUi = !file.startsWith('console-web/')
    const add = (rule: string) => (at: number) => found.push({ file, line: lineOf(source, at), rule, text: textAt(source, at) })
    withoutKind(file, source).forEach(add(NO_KIND))
    browserDialogs(source).forEach(add(BROWSER_DIALOG))
    if (SITE_SILENCE.includes(file)) for (const m of source.matchAll(/\b(?:useAttention|ShowAttention)\b/g)) add(SILENCE_AS_DIALOG)(m.index)
    source.split('\n').forEach((text, i) => {
      for (const rule of RULES) {
        if (rule.appliesTo === 'hq-ui' && !hqUi) continue
        if (rule.pattern.test(text)) found.push({ file, line: i + 1, rule: rule.name, text: text.trim().slice(0, 120) })
      }
    })
  }
  return found
}

describe('the design system guard @SC-1905', () => {
  const found = scan()

  it('finds no retired pattern outside the allow-list', () => {
    const open = found.filter(f => !ALLOW.some(a => a.file === f.file && a.rule === f.rule))
    expect(open.map(f => `${f.file}:${f.line}  ${f.rule}  ${f.text}`)).toEqual([])
  })

  it('keeps no allow-list entry that nothing needs', () => {
    const stale = ALLOW.filter(a => !found.some(f => f.file === a.file && f.rule === a.rule))
    expect(stale.map(a => `${a.file}  ${a.rule}`)).toEqual([])
  })

  it('has none of the deleted message helpers back', () => {
    const files = Object.keys(SOURCES).map(repoPath)
    expect(files.filter(f => DELETED.some(d => d.endsWith('/') ? f.startsWith(d) : f === d))).toEqual([])
  })

  it('reads a message without a kind, and a browser dialog, as they are written', () => {
    expect(withoutKind('hq/src/x.tsx', 'const d = useAttentionWhen(error)\n<ShowAttention text={a ? "b" : null} />')).toHaveLength(2)
    expect(withoutKind('hq/src/x.tsx', "useAttentionWhen(e, { title: 'x', kind: 'alert' })\n<ShowAttention\n  text={e}\n  kind=\"nudge\" />")).toEqual([])
    expect(withoutKind('console-web/src/x.tsx', '<Notice title="x">y</Notice>')).toHaveLength(1)
    expect(browserDialogs("if (!confirm('Sure?')) return\nwindow.alert('x')\nprompt('y')")).toHaveLength(3)
    expect(browserDialogs('const confirm = async () => {}\nonClick={() => void confirm()}')).toEqual([])
  })

  it('reads the sources it is meant to', () => {
    const files = Object.keys(SOURCES).map(repoPath)
    for (const root of ['ui/src/', 'hq/src/', 'console-web/src/']) expect(files.filter(f => f.startsWith(root)).length).toBeGreaterThan(50)
    expect(files.some(f => /__tests__|\.test\./.test(f))).toBe(false)
  })
})
