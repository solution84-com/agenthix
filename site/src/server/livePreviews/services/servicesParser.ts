/**
 * The program a helper container runs to read a workspace's services file (live previews spec part 4, X6, X21): the
 * workspace mounted read-only at `/w`, no network, no Docker socket, none of the site's code. It reads
 * `.agents/services.yaml` without following a link, and parses the small part of YAML a services file needs: block
 * mappings and sequences, one-line flow collections, plain and quoted scalars, comments. Anchors, aliases, tags, block
 * scalars, merge keys, several documents and duplicate keys are refused, so nothing in the file can stand for
 * something written elsewhere. It produces plain values only; core's `readServicesFile` judges them in the site.
 *
 * It writes one JSON answer: `{ ok: true, parsed }`, `{ absent: true }` when there is no file, or
 * `{ refused: 'notAFile', detail }` with the sentence the agent reads. Plain JavaScript in a string, as `fileTool.ts`
 * is; the tests run it with Node directly.
 */
export const SERVICES_PARSER = String.raw`
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const ROOT = process.env.TOOL_ROOT || '/w'
const PARTS = ['.agents', 'services.yaml']
const MAX_BYTES = 64 * 1024
const MAX_DEPTH = 32
const MAX_NODES = 20000

class Bad extends Error {}
const say = (o) => process.stdout.write(JSON.stringify(o) + '\n')

function readFile() {
  let at = ROOT
  for (let i = 0; i < PARTS.length; i++) {
    at = path.join(at, PARTS[i])
    let st
    try { st = fs.lstatSync(at) } catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null; throw e }
    if (st.isSymbolicLink()) throw new Bad('.agents/services.yaml, or its folder, is a link; write it as a plain file.')
    if (i < PARTS.length - 1 ? !st.isDirectory() : !st.isFile()) throw new Bad('.agents/services.yaml must be a plain file in the .agents folder.')
  }
  const fd = fs.openSync(at, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | (fs.constants.O_NONBLOCK || 0))
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Bad('.agents/services.yaml must be a plain file.')
    const buf = Buffer.alloc(MAX_BYTES + 1)
    let n = 0
    for (;;) {
      const r = fs.readSync(fd, buf, n, buf.length - n, null)
      if (r <= 0) break
      n += r
      if (n > MAX_BYTES) throw new Bad('.agents/services.yaml is larger than 64 KiB.')
    }
    let text
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(0, n)) } catch { throw new Bad('.agents/services.yaml is not UTF-8 text.') }
    return text.replace(/^﻿/, '')
  } finally { fs.closeSync(fd) }
}

let nodes = 0
const count = () => { if (++nodes > MAX_NODES) throw new Bad('The file has too many values.') }
const newMap = () => Object.create(null)

/** A line without its comment and trailing spaces; quotes are respected. */
function stripComment(s, no) {
  let quote = null
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quote === "'") { if (c === "'") { if (s[i + 1] === "'") i++; else quote = null } }
    else if (quote === '"') { if (c === '\\') i++; else if (c === '"') quote = null }
    else if (c === "'" || c === '"') {
      // A quote opens a scalar only where one can start: after an indicator or a space, or at the start.
      if (i === 0 || /[\s\[{,:-]/.test(s[i - 1])) quote = c
    } else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).replace(/\s+$/, '')
  }
  if (quote) throw new Bad('line ' + no + ': a quote is not closed on its line; write the value on one line.')
  return s.replace(/\s+$/, '')
}

function lines(text) {
  const out = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const no = i + 1
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(raw)) throw new Bad('line ' + no + ': the line holds a control character.')
    const indent = /^ */.exec(raw)[0].length
    if (raw[indent] === '\t') throw new Bad('line ' + no + ': indent with spaces, not tabs.')
    const body = stripComment(raw.slice(indent), no)
    if (!body) return
    if (indent === 0 && /^(---|\.\.\.)(\s|$)/.test(body)) throw new Bad('line ' + no + ': write one document, without --- or ....')
    if (indent === 0 && body[0] === '%') throw new Bad('line ' + no + ': directives are not accepted.')
    out.push({ indent, text: body, no })
  })
  return out
}

/** Where a mapping entry's key ends: the first ': ' (or a final ':') outside quotes and brackets; -1 if none. */
function keyEnd(s) {
  let quote = null, depth = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quote === "'") { if (c === "'") { if (s[i + 1] === "'") i++; else quote = null } continue }
    if (quote === '"') { if (c === '\\') i++; else if (c === '"') quote = null; continue }
    if ((c === "'" || c === '"') && (i === 0 || /[\s\[{,]/.test(s[i - 1]))) quote = c
    else if (c === '[' || c === '{') depth++
    else if (c === ']' || c === '}') depth--
    else if (c === ':' && depth === 0 && (i + 1 === s.length || s[i + 1] === ' ')) return i
  }
  return -1
}

const isItem = (t) => t === '-' || t.startsWith('- ')

function refuseIndicator(s, no) {
  const c = s[0]
  if (c === '&' || c === '*') throw new Bad('line ' + no + ': anchors and aliases are not accepted; write each value where it is used.')
  if (c === '!') throw new Bad('line ' + no + ': tags are not accepted.')
  if (c === '|' || c === '>') throw new Bad('line ' + no + ': block text (| or >) is not accepted; write the value on one line.')
  if (c === '@' || c === String.fromCharCode(96) || c === '%') throw new Bad('line ' + no + ': a value cannot start with ' + c + '; quote it.')
  if (c === '?') throw new Bad('line ' + no + ': complex keys are not accepted.')
}

function plain(s, no) {
  refuseIndicator(s, no)
  if (/^(null|Null|NULL|~)$/.test(s)) return null
  if (/^(true|True|TRUE)$/.test(s)) return true
  if (/^(false|False|FALSE)$/.test(s)) return false
  if (/^[-+]?[0-9]+$/.test(s)) { const n = Number(s); return Number.isSafeInteger(n) ? n : s }
  if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(s)) return Number(s)
  return s
}

const ESCAPES = { '0': null, a: '\u0007', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\u000b', f: '\f', r: '\r', e: '\u001b', ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\u0085', _: ' ', L: ' ', P: ' ' }

/** A quoted scalar starting at s[i]; returns [value, index after it]. */
function quoted(s, i, no) {
  const q = s[i]
  let out = ''
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j]
    if (q === "'") {
      if (c === "'") { if (s[j + 1] === "'") { out += "'"; j++; continue } return [out, j + 1] }
      out += c
    } else if (c === '"') return [out, j + 1]
    else if (c === '\\') {
      const e = s[++j]
      const hex = { x: 2, u: 4, U: 8 }[e]
      if (hex) {
        const h = s.slice(j + 1, j + 1 + hex)
        if (!/^[0-9a-fA-F]+$/.test(h) || h.length !== hex) throw new Bad('line ' + no + ': a \\' + e + ' escape needs ' + hex + ' hex digits.')
        out += String.fromCodePoint(parseInt(h, 16)); j += hex
      } else if (e in ESCAPES && ESCAPES[e] !== null) out += ESCAPES[e]
      else throw new Bad('line ' + no + ': the escape \\' + (e || '') + ' is not accepted.')
    } else out += c
  }
  throw new Bad('line ' + no + ': a quote is not closed.')
}

/** One value written on a line: a flow collection, a quoted or a plain scalar. */
function inline(s, no, depth) {
  if (depth > MAX_DEPTH) throw new Bad('line ' + no + ': the values nest too deeply.')
  count()
  const c = s[0]
  if (c === '[' || c === '{' || c === '"' || c === "'") {
    const [value, end] = flow(s, 0, no, depth)
    if (s.slice(end).trim()) throw new Bad('line ' + no + ': something follows the value: ' + s.slice(end).trim().slice(0, 40))
    return value
  }
  return plain(s, no)
}

const skip = (s, i) => { while (s[i] === ' ') i++; return i }

/** A value inside a flow collection (or a quoted scalar) at s[i]; returns [value, index after it]. */
function flow(s, i, no, depth) {
  if (depth > MAX_DEPTH) throw new Bad('line ' + no + ': the values nest too deeply.')
  count()
  i = skip(s, i)
  const c = s[i]
  if (c === '"' || c === "'") return quoted(s, i, no)
  if (c === '[') {
    const out = []
    i = skip(s, i + 1)
    if (s[i] === ']') return [out, i + 1]
    for (;;) {
      const [v, j] = flow(s, i, no, depth + 1)
      out.push(v)
      i = skip(s, j)
      if (s[i] === ',') { i = skip(s, i + 1); if (s[i] === ']') return [out, i + 1]; continue }
      if (s[i] === ']') return [out, i + 1]
      throw new Bad('line ' + no + ': a [list] is not closed on its line.')
    }
  }
  if (c === '{') {
    const out = newMap()
    i = skip(s, i + 1)
    if (s[i] === '}') return [out, i + 1]
    for (;;) {
      let key, j
      if (s[i] === '"' || s[i] === "'") [key, j] = quoted(s, i, no)
      else {
        j = i
        while (j < s.length && !/[,{}\[\]]/.test(s[j]) && !(s[j] === ':' && (j + 1 === s.length || /[ ,}]/.test(s[j + 1])))) j++
        key = plain(s.slice(i, j).trim(), no)
      }
      key = String(key)
      if (Object.prototype.hasOwnProperty.call(out, key)) throw new Bad('line ' + no + ': ' + key + ' is written twice.')
      j = skip(s, j)
      let value = null
      if (s[j] === ':') { [value, j] = (s[skip(s, j + 1)] === ',' || s[skip(s, j + 1)] === '}') ? [null, skip(s, j + 1)] : flow(s, j + 1, no, depth + 1) }
      out[key] = value
      i = skip(s, j)
      if (s[i] === ',') { i = skip(s, i + 1); if (s[i] === '}') return [out, i + 1]; continue }
      if (s[i] === '}') return [out, i + 1]
      throw new Bad('line ' + no + ': a {mapping} is not closed on its line.')
    }
  }
  let j = i
  while (j < s.length && !/[,{}\[\]]/.test(s[j])) j++
  const text = s.slice(i, j).trim()
  if (!text) throw new Bad('line ' + no + ': a value is missing in a list or mapping.')
  return [plain(text, no), j]
}

function parse(text) {
  const ls = lines(text)
  let at = 0
  if (!ls.length) throw new Bad('The file is empty; declare services, such as services: { postgres: { image: postgres:16 } }.')
  const next = () => ls[at]

  function block(indent, depth) {
    if (depth > MAX_DEPTH) throw new Bad('line ' + next().no + ': the values nest too deeply.')
    return isItem(next().text) ? sequence(indent, depth) : mapping(indent, depth)
  }

  /** The value after "key:" or "-" with nothing on its line: what is indented beneath it, or null. */
  function beneath(indent, depth, sameIndentList) {
    const n = next()
    if (n && n.indent > indent) return block(n.indent, depth + 1)
    if (n && sameIndentList && n.indent === indent && isItem(n.text)) return sequence(indent, depth + 1)
    return null
  }

  function mapping(indent, depth) {
    const out = newMap()
    count()
    while (at < ls.length && next().indent === indent && !isItem(next().text)) {
      const { text, no } = next()
      const k = keyEnd(text)
      if (k < 0) throw new Bad('line ' + no + ': expected name: value.')
      let key = text.slice(0, k).trim()
      if (key[0] === '"' || key[0] === "'") {
        const [q, end] = quoted(key, 0, no)
        if (end !== key.length) throw new Bad('line ' + no + ': expected name: value.')
        key = q
      } else {
        if (key === '<<') throw new Bad('line ' + no + ': merge keys (<<) are not accepted.')
        if (/^[\[{]/.test(key)) throw new Bad('line ' + no + ': complex keys are not accepted.')
        key = String(plain(key, no))
      }
      if (Object.prototype.hasOwnProperty.call(out, key)) throw new Bad('line ' + no + ': ' + key + ' is written twice.')
      const rest = text.slice(k + 1).trim()
      at++
      out[key] = rest ? inline(rest, no, depth + 1) : beneath(indent, depth, true)
    }
    if (at < ls.length && next().indent > indent) throw new Bad('line ' + next().no + ': this line is indented more than the one before it allows.')
    return out
  }

  function sequence(indent, depth) {
    const out = []
    count()
    while (at < ls.length && next().indent === indent && isItem(next().text)) {
      const { text, no } = next()
      const rest = text.slice(1).replace(/^ +/, '')
      if (!rest) { at++; out.push(beneath(indent, depth, false)); continue }
      const inner = indent + (text.length - rest.length)
      if (isItem(rest) || keyEnd(rest) >= 0) {
        // "- name: value" or "- - x": the item is a block starting on this line, at the column after the dash.
        ls[at] = { indent: inner, text: rest, no }
        out.push(block(inner, depth + 1))
      } else {
        at++
        out.push(inline(rest, no, depth + 1))
      }
    }
    if (at < ls.length && next().indent > indent) throw new Bad('line ' + next().no + ': this line is indented more than the one before it allows.')
    return out
  }

  const first = ls[0]
  if (first.indent !== 0) throw new Bad('line ' + first.no + ': the file starts indented.')
  const value = keyEnd(first.text) < 0 && !isItem(first.text) ? (at++, inline(first.text, first.no, 0)) : block(0, 0)
  if (at < ls.length) throw new Bad('line ' + ls[at].no + ': this line does not belong to anything above it.')
  return value
}

try {
  const text = readFile()
  if (text === null) say({ absent: true })
  else say({ ok: true, parsed: parse(text) })
} catch (e) {
  if (e instanceof Bad) say({ refused: 'notAFile', detail: e.message })
  else say({ refused: 'unreadable', detail: String(e && e.code || 'error') })
}
`
