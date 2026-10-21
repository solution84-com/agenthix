/** Small connections declared in memory, for the snapshot's own tests. */
import ts from 'typescript'
import { extractConnection } from './extract.js'
import type { Snapshot } from './shape.js'

const ROOT = '/fixture/src'
const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true, noEmit: true, skipLibCheck: true, lib: ['lib.es2020.d.ts'],
}
const base = ts.createCompilerHost(OPTIONS)
const libFiles = new Map<string, ts.SourceFile | undefined>()

/**
 * Declares `files` (by name under the fixture's source root; `index.ts` is the connection's entry) and snapshots
 * them. `index.ts` is given `export const VERSION = '<version>'` unless it declares one.
 */
export function snapshotOf(files: Record<string, string>, version = '1.0', modules = ['index.ts']): Snapshot {
  const all: Record<string, string> = { ...files }
  if (!/export const VERSION/.test(all['index.ts'] ?? '')) all['index.ts'] = `export const VERSION = '${version}'\n${all['index.ts'] ?? ''}`
  const own = new Map(Object.entries(all).map(([name, text]) => [`${ROOT}/${name}`, text]))
  const host: ts.CompilerHost = {
    ...base,
    fileExists: f => own.has(f) || base.fileExists(f),
    readFile: f => own.get(f) ?? base.readFile(f),
    directoryExists: d => d === ROOT || d.startsWith(`${ROOT}/`) || '/fixture' === d || (base.directoryExists?.(d) ?? false),
    realpath: f => (f.startsWith('/fixture') ? f : base.realpath?.(f) ?? f),
    getSourceFile: (f, lang) => {
      const text = own.get(f)
      if (text !== undefined) return ts.createSourceFile(f, text, lang, true)
      if (!libFiles.has(f)) libFiles.set(f, base.getSourceFile(f, lang))
      return libFiles.get(f)
    },
  }
  const program = ts.createProgram([...own.keys()], OPTIONS, host)
  const errors = ts.getPreEmitDiagnostics(program).filter(d => d.file && own.has(d.file.fileName))
  if (errors.length) throw new Error(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'))
  return extractConnection(program, ROOT, { name: 'fixture', modules, version: 'index.ts#VERSION' })
}
