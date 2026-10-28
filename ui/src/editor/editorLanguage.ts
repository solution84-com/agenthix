import type { Extension } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { shell } from '@codemirror/legacy-modes/mode/shell'

const extensionOf = (name: string): string => {
  const base = name.split('/').pop() ?? name
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase()
}

/** The language support for a file name, by its extension; none for a kind with no grammar (plain text). */
export function languageFor(name: string): Extension | null {
  switch (extensionOf(name)) {
    case 'md': case 'markdown': return markdown()
    case 'json': return json()
    case 'yaml': case 'yml': return yaml()
    case 'js': case 'mjs': case 'cjs': case 'jsx': return javascript({ jsx: true })
    case 'ts': case 'mts': case 'cts': return javascript({ typescript: true })
    case 'tsx': return javascript({ typescript: true, jsx: true })
    case 'py': return python()
    case 'sh': case 'bash': case 'zsh': return StreamLanguage.define(shell)
    default: return null
  }
}
