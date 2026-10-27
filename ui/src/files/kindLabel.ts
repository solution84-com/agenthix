import type { FileFacts } from '@agenthix/core'

const KIND_LABELS = {
  markdown: 'Markdown', text: 'Text', code: 'Code', json: 'JSON', csv: 'CSV', image: 'Image', pdf: 'PDF',
} as const

const LANGUAGE_LABELS: Record<string, string> = {
  typescript: 'TypeScript', tsx: 'TSX', javascript: 'JavaScript', jsx: 'JSX', csharp: 'C#', cpp: 'C++', php: 'PHP',
  powershell: 'PowerShell', yaml: 'YAML', toml: 'TOML', ini: 'INI', css: 'CSS', scss: 'SCSS', html: 'HTML', xml: 'XML',
  sql: 'SQL', graphql: 'GraphQL', r: 'R', c: 'C',
}

/** A file name's extension, lower-cased, or '' when it has none. */
export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

function languageLabel(language: string): string {
  return LANGUAGE_LABELS[language] ?? language.charAt(0).toUpperCase() + language.slice(1)
}

/** What the facts line calls a file's kind: the language for code, the extension for a kind with no renderer. */
export function fileKindLabel(facts: Pick<FileFacts, 'name' | 'kind' | 'language'>): string {
  if (facts.kind === 'code' && facts.language) return languageLabel(facts.language)
  if (facts.kind === 'none') return extensionOf(facts.name).toUpperCase() || 'File'
  return KIND_LABELS[facts.kind]
}
