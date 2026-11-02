/**
 * The differences between a committed snapshot and what the code declares now, each classed by the spec's table:
 * an addition of something optional (a new type, a new value of a closed set, a new message) is `minor`; a removal, a changed type, a
 * renamed field or a new required field is `major`; a type renamed with nothing else changed is `none`, since a
 * type's name never crosses the connection.
 */
import { canonical, describeShape, type Entry, type Field, type Shape, type Snapshot } from './shape.js'

export type Level = 'none' | 'minor' | 'major'

export type Change = {
  at: string
  what: string
  level: Level
  /** A deprecation mark that is new or changed here, which must name the version it ships in. */
  newMark?: string
  /**
   * Set on a removal of something a mark can be written on (a type, a field, a union member that is a named type):
   * the mark it carried in the committed snapshot, or null when it carried none.
   */
  removedMark?: string | null
}

/**
 * `methodMaps` names the entries that map each method or event of a connection to its shape (`SiteMethods`,
 * `ConsoleLinkMethods`): a key added to one is a new method, which a peer that does not know it answers
 * `unknown_method` or ignores, so it is an addition however its own shape is written.
 */
export function compareSnapshots(before: Snapshot, now: Snapshot, methodMaps: ReadonlySet<string> = new Set()): Change[] {
  const changes: Change[] = []
  const renamed = new Map<string, string>()
  const removed = Object.keys(before.types).filter(k => !(k in now.types))
  const added = new Set(Object.keys(now.types).filter(k => !(k in before.types)))

  for (const k of removed) {
    const body = entryBody(before.types[k])
    const match = [...added].find(a => entryBody(now.types[a]) === body)
    if (match) {
      renamed.set(k, match)
      added.delete(match)
      changes.push({ at: k, what: `renamed to ${match}, its shape unchanged`, level: 'none' })
    } else {
      changes.push({ at: k, what: 'removed', level: 'major', removedMark: before.types[k].deprecated ?? null })
    }
  }
  for (const k of added) {
    changes.push({ at: k, what: 'added', level: 'minor' })
    const mark = now.types[k].deprecated
    if (mark !== undefined) changes.push({ at: k, what: 'added already deprecated', level: 'minor', newMark: mark })
  }

  for (const k of Object.keys(before.types)) {
    const target = k in now.types ? k : renamed.get(k)
    if (!target) continue
    const ctx: Ctx = { changes, renamed, before, methodMap: methodMaps.has(target) ? target : null }
    const a = before.types[k]
    const b = now.types[target]
    if (canonical(a.params ?? []) !== canonical(b.params ?? [])) {
      changes.push({ at: target, what: `type parameters changed from <${(a.params ?? []).join(', ')}> to <${(b.params ?? []).join(', ')}>`, level: 'major' })
    }
    markChange(ctx, target, a.deprecated, b.deprecated)
    shape(ctx, target, a.shape, b.shape)
  }
  return changes
}

type Ctx = { changes: Change[]; renamed: Map<string, string>; before: Snapshot; methodMap: string | null }

function entryBody(e: Entry): string {
  return canonical({ params: e.params ?? [], shape: e.shape })
}

function markChange(ctx: Ctx, at: string, a: string | undefined, b: string | undefined): void {
  if (a === b) return
  if (b === undefined) ctx.changes.push({ at, what: 'no longer deprecated', level: 'minor' })
  else ctx.changes.push({ at, what: a === undefined ? 'deprecated' : 'its deprecation mark changed', level: 'minor', newMark: b })
}

function shape(ctx: Ctx, at: string, a: Shape, b: Shape): void {
  if ('ref' in a && 'ref' in b && (a.ref === b.ref || ctx.renamed.get(a.ref) === b.ref)) return
  if ('fields' in a && 'fields' in b) return fields(ctx, at, a, b)
  if ('union' in a && 'union' in b) return union(ctx, at, a.union, b.union)
  if ('array' in a && 'array' in b) return shape(ctx, `${at}[]`, a.array, b.array)
  if ('tuple' in a && 'tuple' in b && a.tuple.length === b.tuple.length) {
    a.tuple.forEach((m, i) => shape(ctx, `${at}[${i}]`, m, b.tuple[i]))
    return
  }
  if (canonical(a) === canonical(b)) return
  // A value that became one of several: a new value beside it.
  if ('literal' in a && 'union' in b && b.union.some(m => canonical(m) === canonical(a))) return union(ctx, at, [a], b.union)
  ctx.changes.push({ at, what: `type changed from \`${describeShape(a)}\` to \`${describeShape(b)}\``, level: 'major' })
}

type FieldsShape = Extract<Shape, { fields: unknown }>

function fields(ctx: Ctx, at: string, a: FieldsShape, b: FieldsShape): void {
  for (const [name, fa] of Object.entries(a.fields)) {
    const fb = b.fields[name]
    const where = `${at}.${name}`
    if (!fb) {
      ctx.changes.push({ at: where, what: 'removed', level: 'major', removedMark: fa.deprecated ?? null })
      continue
    }
    if (!!fa.optional !== !!fb.optional) {
      ctx.changes.push({ at: where, what: fb.optional ? 'became optional' : 'became required', level: 'major' })
    }
    markChange(ctx, where, fa.deprecated, fb.deprecated)
    shape(ctx, where, fa.type, fb.type)
  }
  for (const [name, fb] of Object.entries(b.fields)) {
    if (name in a.fields) continue
    const where = `${at}.${name}`
    ctx.changes.push(fb.optional
      ? { at: where, what: 'added, optional', level: 'minor' }
      : at === ctx.methodMap
        ? { at: where, what: 'added, a new method', level: 'minor' }
        : { at: where, what: 'added, required', level: 'major' })
    if (fb.deprecated !== undefined) ctx.changes.push({ at: where, what: 'added already deprecated', level: 'minor', newMark: fb.deprecated })
  }
  const ia = a.index
  const ib = b.index
  if (ia && ib && ia.key === ib.key) shape(ctx, `${at}[${ia.key}]`, ia.value, ib.value)
  else if (ia && !ib) ctx.changes.push({ at, what: 'its index signature was removed', level: 'major' })
  else if (!ia && ib) ctx.changes.push({ at, what: 'an index signature was added', level: 'major' })
  else if (ia && ib) ctx.changes.push({ at, what: `its index key changed to ${ib.key}`, level: 'major' })
}

/**
 * Members are matched by value, and object members (the messages of a discriminated union) by the field whose
 * literal value tells them apart, so a field added to one message is classed as that, not as a message replaced.
 * Messages that share that value (`install` for hq and for a site) are told apart by a second such field.
 */
function union(ctx: Ctx, at: string, a: Shape[], b: Shape[]): void {
  const ka = keyed(a)
  const kb = keyed(b)
  for (const [k, kNew, ma, mb] of samePlaceMessages(ka, kb)) {
    shape(ctx, `${at}<${k}>`, ma, mb)
    ka.delete(k)
    kb.delete(kNew)
  }
  for (const [k, ma] of ka) {
    const mb = kb.get(k)
    if (mb) shape(ctx, `${at}<${k}>`, ma, mb)
    else {
      // Only a named type can carry a mark; a literal value or an inline message cannot, so the major move is all
      // its removal needs.
      const named = 'ref' in ma ? { removedMark: ctx.before.types[ma.ref]?.deprecated ?? null } : {}
      ctx.changes.push({ at, what: `\`${describeShape(ma)}\` is no longer one of its values`, level: 'major', ...named })
    }
  }
  for (const [k, mb] of kb) {
    if (ka.has(k)) continue
    // A new value of a closed set, or a new message, is an addition the other side ignores; `null` or another
    // type where one was always sent is not.
    const level = 'literal' in mb || 'fields' in mb || 'ref' in mb ? 'minor' : 'major'
    ctx.changes.push({ at, what: `\`${describeShape(mb)}\` was added to its values`, level })
  }
}

/**
 * Messages no key tells apart (two that share their tag, and no second field splits them), matched when the union
 * keyed them by value and one of them changed: an old message and a new one left unmatched are the same message when
 * they carry the same fields with the same literal values, and no other unmatched message does. So a change inside
 * such a message is classed as that change, not as the message replaced.
 */
function samePlaceMessages(ka: Map<string, Shape>, kb: Map<string, Shape>): [string, string, Shape, Shape][] {
  const loose = (from: Map<string, Shape>, other: Map<string, Shape>) =>
    [...from].filter((e): e is [string, FieldsShape] => !other.has(e[0]) && 'fields' in e[1])
  const olds = loose(ka, kb)
  const news = loose(kb, ka)
  const pairs: [string, string, Shape, Shape][] = []
  for (const [k, ma] of olds) {
    const candidates = news.filter(([, mb]) => sameFrame(ma, mb))
    if (candidates.length !== 1) continue
    const [kNew, mb] = candidates[0]
    if (olds.filter(([, other]) => sameFrame(other, mb)).length === 1) pairs.push([k, kNew, ma, mb])
  }
  return pairs
}

function sameFrame(a: FieldsShape, b: FieldsShape): boolean {
  const names = Object.keys(a.fields).sort()
  if (canonical(names) !== canonical(Object.keys(b.fields).sort())) return false
  return names.every(n => {
    const fa = a.fields[n].type
    const fb = b.fields[n].type
    return 'literal' in fa || 'literal' in fb ? canonical(fa) === canonical(fb) : true
  })
}

function keyed(members: Shape[]): Map<string, Shape> {
  const objects = members.filter((m): m is FieldsShape => 'fields' in m)
  const keyOf = messageKeys(objects)
  const out = new Map<string, Shape>()
  for (const m of members) {
    const key = 'fields' in m ? keyOf?.get(m) : undefined
    out.set(key ?? canonical(m), m)
  }
  return out
}

/** A tag's value: one literal, or a union of literals (`'ping' | 'pong'`, one message for both). */
function literalTag(s: Shape): boolean {
  return 'literal' in s || ('union' in s && s.union.every(m => 'literal' in m))
}

/** `name` tags every one of `objects`: present, required and a literal in each. */
function tagsAll(objects: FieldsShape[], name: string): boolean {
  return objects.every(o => {
    const f = o.fields[name] as Field | undefined
    return !!f && !f.optional && literalTag(f.type)
  })
}

function tagValue(o: FieldsShape, name: string): string {
  return `${name}=${canonical(o.fields[name].type)}`
}

/**
 * Each message's key: the value of the one field that tells all of them apart; failing that, the value of a field
 * every message carries, and, for the messages that share it, the value of a second field that tells those apart.
 * Null when neither finds a key for every message.
 */
function messageKeys(objects: FieldsShape[]): Map<FieldsShape, string> | null {
  if (objects.length < 2) return null
  const names = Object.keys(objects[0].fields).sort().filter(name => tagsAll(objects, name))
  const single = names.find(name => new Set(objects.map(o => tagValue(o, name))).size === objects.length)
  if (single) return new Map(objects.map(o => [o, tagValue(o, single)]))
  for (const first of names) {
    const groups = new Map<string, FieldsShape[]>()
    for (const o of objects) groups.set(tagValue(o, first), [...(groups.get(tagValue(o, first)) ?? []), o])
    const out = new Map<FieldsShape, string>()
    for (const [value, group] of groups) {
      if (group.length === 1) {
        out.set(group[0], value)
        continue
      }
      const second = Object.keys(group[0].fields).sort().find(name =>
        name !== first && tagsAll(group, name) && new Set(group.map(o => tagValue(o, name))).size === group.length)
      if (!second) break
      for (const o of group) out.set(o, `${value},${tagValue(o, second)}`)
    }
    if (out.size === objects.length) return out
  }
  return null
}

/** The level a set of changes needs: the highest of them. */
export function levelOf(changes: Change[]): Level {
  if (changes.some(c => c.level === 'major')) return 'major'
  if (changes.some(c => c.level === 'minor')) return 'minor'
  return 'none'
}
