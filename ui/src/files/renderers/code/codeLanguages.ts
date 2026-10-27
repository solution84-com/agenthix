import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/light'
import bash from 'react-syntax-highlighter/dist/esm/languages/hljs/bash'
import c from 'react-syntax-highlighter/dist/esm/languages/hljs/c'
import cpp from 'react-syntax-highlighter/dist/esm/languages/hljs/cpp'
import csharp from 'react-syntax-highlighter/dist/esm/languages/hljs/csharp'
import css from 'react-syntax-highlighter/dist/esm/languages/hljs/css'
import dart from 'react-syntax-highlighter/dist/esm/languages/hljs/dart'
import dockerfile from 'react-syntax-highlighter/dist/esm/languages/hljs/dockerfile'
import go from 'react-syntax-highlighter/dist/esm/languages/hljs/go'
import ini from 'react-syntax-highlighter/dist/esm/languages/hljs/ini'
import java from 'react-syntax-highlighter/dist/esm/languages/hljs/java'
import javascript from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript'
import kotlin from 'react-syntax-highlighter/dist/esm/languages/hljs/kotlin'
import lua from 'react-syntax-highlighter/dist/esm/languages/hljs/lua'
import makefile from 'react-syntax-highlighter/dist/esm/languages/hljs/makefile'
import php from 'react-syntax-highlighter/dist/esm/languages/hljs/php'
import powershell from 'react-syntax-highlighter/dist/esm/languages/hljs/powershell'
import python from 'react-syntax-highlighter/dist/esm/languages/hljs/python'
import r from 'react-syntax-highlighter/dist/esm/languages/hljs/r'
import ruby from 'react-syntax-highlighter/dist/esm/languages/hljs/ruby'
import rust from 'react-syntax-highlighter/dist/esm/languages/hljs/rust'
import scss from 'react-syntax-highlighter/dist/esm/languages/hljs/scss'
import sql from 'react-syntax-highlighter/dist/esm/languages/hljs/sql'
import swift from 'react-syntax-highlighter/dist/esm/languages/hljs/swift'
import typescript from 'react-syntax-highlighter/dist/esm/languages/hljs/typescript'
import xml from 'react-syntax-highlighter/dist/esm/languages/hljs/xml'
import yaml from 'react-syntax-highlighter/dist/esm/languages/hljs/yaml'

/** The highlighter's grammar for each language core names; one the highlighter lacks (prisma, graphql) is absent. */
const GRAMMARS: Record<string, unknown> = {
  bash, c, cpp, csharp, css, dart, dockerfile, go, ini, java, javascript, kotlin, lua, makefile, php, powershell,
  python, r, ruby, rust, scss, sql, swift, typescript, xml, yaml,
}
/** Languages core names that a neighbouring grammar draws. */
const ALIASES: Record<string, string> = { tsx: 'typescript', jsx: 'javascript', html: 'xml', toml: 'ini' }

for (const [name, grammar] of Object.entries(GRAMMARS)) SyntaxHighlighter.registerLanguage(name, grammar)

/** The grammar to highlight a core language with, or `text` (line numbers, no colour) for one that has none. */
export function grammarFor(language: string | undefined): string {
  const name = language ? ALIASES[language] ?? language : ''
  return name in GRAMMARS ? name : 'text'
}

export { SyntaxHighlighter }
