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
  { name: 'a palette colour class', pattern: new RegExp(`\\b${UTILITY}-${PALETTE}-\\d{2,3}\\b|\\b(?:bg|text|border|ring|fill|stroke|from|to|via)-(?:white|black)\\b`), appliesTo: 'all' },
]

const INLINE_ALERT = 'an inline alert (role="alert" outside the attention dialog)'

// The role="alert" lines that stay, by why. Grouped so the reasons stay few; a new line needs a reason here.
const ALERTS_THAT_STAY: { reason: string; files: string[] }[] = [
  { reason: 'the attention dialog itself', files: ['ui/src/primitives/AttentionDialog.tsx'] },
  {
    reason: 'a form field\'s own error, under its field',
    files: [
      'ui/src/projects/AutomationLimitsForm.tsx', 'ui/src/agents/tabs/ConfigurationTab.tsx', 'ui/src/primitives/InlineEdit.tsx',
      'hq/src/settings/pages/CloudAccountRow.tsx', 'hq/src/projects/pages/settings/usePartSave.tsx', 'hq/src/providers/components/AddProviderDialog.tsx',
      'hq/src/storage/pages/knowledge/EditorFields.tsx', 'hq/src/storage/pages/knowledge/NewSection.tsx', 'hq/src/storage/pages/knowledge/PageActions.tsx',
      'hq/src/assets/pages/editor/EditFile.tsx', 'hq/src/assets/pages/editor/EditorTree.tsx',
    ],
  },
  {
    reason: 'the page is the refusal: a gate or a thing that is not there, with nothing else to show',
    files: [
      'hq/src/org/pages/OrgAdminPage.tsx', 'hq/src/org/pages/people/OrgPeopleGate.tsx', 'hq/src/admin/components/AdminGate.tsx',
      'hq/src/agents/pages/manage/ManageGate.tsx', 'hq/src/projects/pages/settings/types/TypeColumnsPage.tsx',
      'hq/src/projects/sprints/PlanSprintPage.tsx', 'hq/src/assets/pages/asset/AssetPage.tsx',
      'hq/src/assets/pages/review/ProposalReviewPage.tsx', 'hq/src/library/pages/TaskTemplateProposalPage.tsx',
    ],
  },
  {
    reason: 'part of the thing shown (a run\'s failure, the agent\'s question, a page\'s problems, what a check found in a package, a merge\'s clashes, a withdrawn version): a record, not a message',
    files: [
      'hq/src/workflows/pages/RunView.tsx', 'hq/src/workspaceView/components/LivePreviewStrip.tsx', 'hq/src/storage/pages/knowledge/PageView.tsx',
      'hq/src/assets/pages/add/InstallDialog.tsx', 'hq/src/assets/pages/asset/dialogs/OnPurposeDialog.tsx', 'hq/src/workspaceView/components/MergeDialog.tsx',
      'hq/src/assets/pages/asset/dialogs/MoveDialog.tsx',
    ],
  },
]

// Files the message lanes deleted; the one way to say each thing is in `@agenthix/ui/attention` and the primitives.
const DELETED = [
  'hq/src/attention/', 'hq/src/shared/components/ShowAttention.tsx', 'hq/src/shared/components/RefusedAction.tsx',
  'hq/src/assets/components/Notice.tsx', 'hq/src/workflows/components/ErrorLine.tsx',
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

  it('reads the sources it is meant to', () => {
    const files = Object.keys(SOURCES).map(repoPath)
    for (const root of ['ui/src/', 'hq/src/', 'console-web/src/']) expect(files.filter(f => f.startsWith(root)).length).toBeGreaterThan(50)
    expect(files.some(f => /__tests__|\.test\./.test(f))).toBe(false)
  })
})
