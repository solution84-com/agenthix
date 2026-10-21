/**
 * Reads a connection's declarations with the TypeScript compiler's own checker and writes them as a `Snapshot`.
 * The roots are the type aliases, interfaces and enums its modules export (and any constants it names); every named
 * type declared in core that a root reaches is recorded too, so a change to a type a message carries is seen even
 * when that type lives elsewhere in core. A type or field marked `@experimental` is left out.
 */
import ts from 'typescript'
import { SNAPSHOT_COMMENT, canonical, sortKeys, type Entry, type Field, type Shape, type Snapshot } from './shape.js'

export type ConnectionSource = {
  name: string
  /** The modules whose exports are the connection's roots, relative to the source root. */
  modules: string[]
  /** Exported constants recorded as entries (by their type), as `module#NAME`. */
  constants?: string[]
  /** The constant holding the connection's version, as `module#NAME`. */
  version: string
}

const MAX_DEPTH = 24

export function extractConnection(program: ts.Program, sourceRoot: string, source: ConnectionSource): Snapshot {
  const checker = program.getTypeChecker()
  // The compiler names every file with forward slashes, whatever the system.
  const root = ts.sys.resolvePath(sourceRoot).replace(/\\/g, '/').replace(/\/$/, '')
  const isCore = (d: ts.Declaration) => {
    const f = d.getSourceFile().fileName
    return f.startsWith(`${root}/`) && !f.includes('/node_modules/')
  }
  const relative = (d: ts.Declaration) => d.getSourceFile().fileName.slice(root.length + 1)

  const keys = new Map<ts.Symbol, string>()
  const taken = new Set<string>()
  const keyOf = (s: ts.Symbol): string => {
    let k = keys.get(s)
    if (!k) {
      k = taken.has(s.name) ? `${s.name}@${relative(s.declarations![0])}` : s.name
      keys.set(s, k)
      taken.add(k)
    }
    return k
  }

  const queue: ts.Symbol[] = []
  const queued = new Set<ts.Symbol>()
  const want = (s: ts.Symbol) => {
    if (!queued.has(s)) { queued.add(s); queue.push(s) }
  }

  const moduleSymbol = (m: string): ts.Symbol => {
    const file = program.getSourceFile(`${root}/${m}`)
    const sym = file && checker.getSymbolAtLocation(file)
    if (!sym) throw new Error(`${source.name}: no module ${m}`)
    return sym
  }
  const exportsOf = (m: string) => checker.getExportsOfModule(moduleSymbol(m))
    .map(s => (s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s))
  const exported = (spec: string): ts.Symbol => {
    const [m, name] = spec.split('#')
    const s = exportsOf(m).find(x => x.name === name)
    if (!s) throw new Error(`${source.name}: ${m} exports no ${name}`)
    return s
  }

  const TYPE_DECL = ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface | ts.SymbolFlags.Enum
  for (const m of source.modules) {
    for (const s of exportsOf(m)) if (s.flags & TYPE_DECL && !experimental(s, checker)) want(s)
  }

  const text = (t: ts.Type) => checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation)

  // A named, non-generic type declared in core, which gets its own entry; otherwise null.
  const namedCore = (t: ts.Type): ts.Symbol | null => {
    const alias = t.aliasSymbol
    if (alias) {
      if (t.aliasTypeArguments?.length) return null
      return alias.declarations?.some(isCore) ? alias : null
    }
    const s = t.getSymbol()
    if (!s || !(s.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.Enum))) return null
    if (!s.declarations?.some(isCore)) return null
    const ref = t as ts.TypeReference
    if (ref.typeArguments?.length || (objectFlags(t) & ts.ObjectFlags.Reference && checker.getTypeArguments(ref).length)) return null
    return s
  }

  const render = (t: ts.Type, depth: number, declaring?: ts.Symbol): Shape => {
    if (depth > MAX_DEPTH) return { text: text(t) }
    const named = namedCore(t)
    if (named && named !== declaring) {
      if (!experimental(named, checker)) want(named)
      return { ref: keyOf(named) }
    }
    const f = t.flags
    if (f & ts.TypeFlags.Any) return { type: 'any' }
    if (f & ts.TypeFlags.Unknown) return { type: 'unknown' }
    if (f & ts.TypeFlags.Never) return { type: 'never' }
    if (f & ts.TypeFlags.Void) return { type: 'void' }
    if (f & ts.TypeFlags.Undefined) return { type: 'undefined' }
    if (f & ts.TypeFlags.Null) return { type: 'null' }
    if (f & ts.TypeFlags.NonPrimitive) return { type: 'object' }
    if (f & ts.TypeFlags.TypeParameter) return { param: t.getSymbol()?.name ?? text(t) }
    if (f & ts.TypeFlags.EnumLike) return { text: text(t) }
    if (f & ts.TypeFlags.Boolean) return { type: 'boolean' }
    if (f & ts.TypeFlags.String) return { type: 'string' }
    if (f & ts.TypeFlags.Number) return { type: 'number' }
    if (f & ts.TypeFlags.BigInt) return { type: 'bigint' }
    if (t.isStringLiteral() || t.isNumberLiteral()) return { literal: t.value }
    if (f & ts.TypeFlags.BooleanLiteral) return { literal: text(t) === 'true' }
    if (t.isUnion()) return unionShape(t.types, depth)
    if (t.isIntersection()) {
      if (t.types.some(m => m.flags & ts.TypeFlags.TypeParameter)) {
        return { intersection: t.types.map(m => render(m, depth + 1)) }
      }
      return objectShape(t, depth)
    }
    if (f & ts.TypeFlags.Object) {
      if (checker.isArrayType(t)) return { array: render(checker.getTypeArguments(t as ts.TypeReference)[0], depth + 1) }
      if (checker.isTupleType(t)) return { tuple: checker.getTypeArguments(t as ts.TypeReference).map(m => render(m, depth + 1)) }
      const s = t.getSymbol()
      const fromLib = s?.declarations?.length && !s.declarations.some(isCore)
      if (fromLib && s.name === 'Date') return { type: 'date' }
      if (fromLib && !(objectFlags(t) & ts.ObjectFlags.Mapped)) return { text: text(t) }
      if (t.getCallSignatures().length && !t.getProperties().length) return { text: text(t) }
      return objectShape(t, depth)
    }
    return { text: text(t) }
  }

  const unionShape = (types: readonly ts.Type[], depth: number): Shape => {
    const hasTrue = types.some(m => m.flags & ts.TypeFlags.BooleanLiteral && checker.typeToString(m) === 'true')
    const hasFalse = types.some(m => m.flags & ts.TypeFlags.BooleanLiteral && checker.typeToString(m) === 'false')
    const out: Shape[] = []
    if (hasTrue && hasFalse) out.push({ type: 'boolean' })
    for (const m of types) {
      if (hasTrue && hasFalse && m.flags & ts.TypeFlags.BooleanLiteral) continue
      out.push(render(m, depth + 1))
    }
    if (out.length === 1) return out[0]
    return { union: out.sort((a, b) => canonical(a).localeCompare(canonical(b))) }
  }

  const objectShape = (t: ts.Type, depth: number): Shape => {
    const fields: Record<string, Field> = {}
    for (const p of [...checker.getPropertiesOfType(t)].sort((a, b) => a.name.localeCompare(b.name))) {
      if (experimental(p, checker)) continue
      const optional = (p.flags & ts.SymbolFlags.Optional) !== 0
      let pt = checker.getTypeOfSymbol(p)
      if (optional && pt.isUnion()) {
        const kept = pt.types.filter(m => !(m.flags & ts.TypeFlags.Undefined))
        if (kept.length !== pt.types.length) {
          fields[p.name] = withMarks({ type: unionShape(kept, depth) }, optional, p)
          continue
        }
      }
      fields[p.name] = withMarks({ type: render(pt, depth + 1) }, optional, p)
    }
    const index = checker.getIndexInfosOfType(t)[0]
    if (!index) return { fields }
    const key = index.keyType.flags & ts.TypeFlags.Number ? 'number' : 'string'
    return { fields, index: { key, value: render(index.type, depth + 1) } }
  }

  const withMarks = (field: Field, optional: boolean, s: ts.Symbol): Field => {
    if (optional) field.optional = true
    const mark = deprecation(s, checker)
    if (mark !== undefined) field.deprecated = mark
    return field
  }

  const entries: Record<string, Entry> = {}
  const declare = (s: ts.Symbol, shape: Shape, params?: string[]) => {
    const decl = s.declarations![0]
    const entry: Entry = { file: relative(decl), shape }
    if (params?.length) entry.params = params
    const mark = deprecation(s, checker)
    if (mark !== undefined) entry.deprecated = mark
    entries[keyOf(s)] = entry
  }

  for (const spec of source.constants ?? []) {
    const s = exported(spec)
    keyOf(s)
    declare(s, render(checker.getTypeOfSymbol(s), 0))
  }
  while (queue.length) {
    const s = queue.shift()!
    keyOf(s)
    const declared = checker.getDeclaredTypeOfSymbol(s)
    const params = (s.declarations ?? []).flatMap(d =>
      ts.isTypeAliasDeclaration(d) || ts.isInterfaceDeclaration(d) ? (d.typeParameters ?? []).map(p => p.name.text) : [])
    const aliasDecl = s.declarations?.find(ts.isTypeAliasDeclaration)
    const body = aliasDecl ? checker.getTypeFromTypeNode(aliasDecl.type) : declared
    declare(s, render(body, 0, s), [...new Set(params)])
  }

  return {
    $comment: SNAPSHOT_COMMENT,
    connection: source.name,
    version: versionOf(exported(source.version), source),
    types: sortKeys(entries) as Record<string, Entry>,
  }
}

function objectFlags(t: ts.Type): ts.ObjectFlags {
  return t.flags & ts.TypeFlags.Object ? (t as ts.ObjectType).objectFlags : 0
}

function versionOf(s: ts.Symbol, source: ConnectionSource): string {
  const d = s.valueDeclaration
  if (d && ts.isVariableDeclaration(d) && d.initializer && ts.isStringLiteral(d.initializer)) return d.initializer.text
  throw new Error(`${source.name}: ${source.version} is not a string constant`)
}

function tags(s: ts.Symbol, checker: ts.TypeChecker): ts.JSDocTagInfo[] {
  return s.getJsDocTags(checker)
}

export function experimental(s: ts.Symbol, checker: ts.TypeChecker): boolean {
  return tags(s, checker).some(t => t.name === 'experimental')
}

/** The `@deprecated` mark's text, whitespace collapsed; '' for a bare `@deprecated`; undefined when unmarked. */
export function deprecation(s: ts.Symbol, checker: ts.TypeChecker): string | undefined {
  const tag = tags(s, checker).find(t => t.name === 'deprecated')
  if (!tag) return undefined
  return ts.displayPartsToString(tag.text).replace(/\s+/g, ' ').trim()
}
