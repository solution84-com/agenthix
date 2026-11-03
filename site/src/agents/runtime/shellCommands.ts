/**
 * A bash command line read as the shell would run it, for the tool gate's
 * command rules (toolGate.ts): every simple command in it — each side of
 * `&&`, `||`, `;`, `|`, `&` and a new line, and each command inside `$(…)`,
 * back-quotes, `( … )`, `<(…)`, `>(…)`, `$((…))`, `${…}` and an unquoted
 * here-document — with its words as the shell passes them on: quotes and
 * escapes removed, redirections left out.
 *
 * It reads; it never expands. A word that depends on an expansion or a file
 * pattern is marked, so a rule cannot be met by a command name worked out
 * when it runs. A line it cannot read (an open quote, a stray `)`, `case`)
 * is null, and the gate treats it as unmatched.
 */

export interface SimpleCommand {
  /** Its words, quotes removed: leading `NAME=value` assignments first, then the command and its arguments. */
  words: string[]
  /** How many of `words` are leading assignments. */
  assignments: number
  /** The command's name depends on an expansion or a file pattern, so no rule can tell what runs. */
  dynamic: boolean
}

const RESERVED_LEAD = new Set(['!', '{', '}', 'if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', 'time'])
/** Commands whose words after the keyword are not a command: `for x in …`. Their substitutions are still read. */
const NOT_A_COMMAND = new Set(['for', 'select', 'function'])
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/
const MAX_DEPTH = 32

class Unreadable extends Error {}

interface Word { text: string; dynamic: boolean }
interface HereDoc { delimiter: string; quoted: boolean; stripTabs: boolean }

class Parser {
  private pos = 0
  private words: Word[] = []
  private cur = ''
  private started = false
  private quoted = false
  private dynamic = false
  /** An unquoted `*`, `?`, `[` or `{`: the word may be a file pattern or a brace expansion. */
  private globbed = false
  /** The next word is a redirection's target, not part of the command. */
  private target: 'file' | 'heredoc' | 'heredoc-strip' | null = null
  private hereDocs: HereDoc[] = []

  constructor(private readonly src: string, private readonly out: SimpleCommand[], private readonly depth: number) {
    if (depth > MAX_DEPTH) throw new Unreadable()
  }

  parseAll(): void {
    this.parseList(null)
  }

  /** Reads commands until `)` (consumed) when `close` is set, else to the end. */
  private parseList(close: ')' | null): void {
    const outer = {
      words: this.words, cur: this.cur, started: this.started, quoted: this.quoted, dynamic: this.dynamic, globbed: this.globbed, target: this.target,
    }
    this.resetCommand()
    const src = this.src
    while (this.pos < src.length) {
      const c = src[this.pos]!
      const next = src[this.pos + 1]
      if (c === '\\') {
        if (next === '\n') { this.pos += 2; continue }
        this.append(next ?? '\\'); this.quoted = true; this.pos += next === undefined ? 1 : 2
      } else if (c === "'") {
        const end = src.indexOf("'", this.pos + 1)
        if (end === -1) throw new Unreadable()
        this.append(src.slice(this.pos + 1, end)); this.quoted = true; this.pos = end + 1
      } else if (c === '"') {
        this.pos++; this.doubleQuoted()
      } else if (c === '`') {
        this.backQuoted()
      } else if (c === '$') {
        this.dollar()
      } else if (c === ' ' || c === '\t') {
        this.finishWord(); this.pos++
      } else if (c === '\n') {
        this.finishCommand(); this.pos++; this.readHereDocs()
      } else if (c === ';') {
        this.finishCommand(); this.pos++
      } else if (c === '&') {
        if (next === '>') { this.redirection() } else { this.finishCommand(); this.pos += next === '&' ? 2 : 1 }
      } else if (c === '|') {
        this.finishCommand(); this.pos += next === '|' || next === '&' ? 2 : 1
      } else if ((c === '<' || c === '>') && next === '(') {
        this.pos += 2; this.nested(); this.started = true; this.dynamic = true; this.cur += '$'
      } else if (c === '<' || c === '>') {
        this.redirection()
      } else if (c === '(') {
        this.finishWord(); this.pos++; this.nested()
      } else if (c === ')') {
        if (close !== ')') throw new Unreadable()
        this.finishCommand(); this.pos++
        Object.assign(this, outer)
        return
      } else if (c === '#' && !this.started) {
        while (this.pos < src.length && src[this.pos] !== '\n') this.pos++
      } else {
        if ('*?[{'.includes(c)) this.globbed = true
        this.append(c); this.pos++
      }
    }
    if (close) throw new Unreadable()
    this.finishCommand()
    this.readHereDocs()
  }

  /** Scans text where only escapes and expansions mean anything: a here-document's body. */
  parseBody(): void {
    while (this.pos < this.src.length) {
      const c = this.src[this.pos]!
      if (c === '\\') this.pos += 2
      else if (c === '$') this.dollar()
      else if (c === '`') this.backQuoted()
      else this.pos++
    }
  }

  private append(s: string): void {
    this.cur += s
    this.started = true
  }

  private nested(): void {
    this.parseList(')')
  }

  private resetCommand(): void {
    this.words = []; this.cur = ''; this.started = false; this.quoted = false; this.dynamic = false; this.globbed = false; this.target = null
  }

  private finishWord(): void {
    if (this.started) {
      if (this.target === 'heredoc' || this.target === 'heredoc-strip') {
        this.hereDocs.push({ delimiter: this.cur, quoted: this.quoted, stripTabs: this.target === 'heredoc-strip' })
      } else if (!this.target) {
        const pattern = this.globbed && !['[', '[[', '{', '}'].includes(this.cur)
        this.words.push({ text: this.cur, dynamic: this.dynamic || pattern })
      }
      this.target = null
    }
    this.cur = ''; this.started = false; this.quoted = false; this.dynamic = false; this.globbed = false
  }

  private finishCommand(): void {
    this.finishWord()
    if (this.target) throw new Unreadable()
    let words = this.words
    while (words.length && RESERVED_LEAD.has(words[0]!.text)) words = words.slice(1)
    this.words = []
    if (!words.length) return
    if (words[0]!.text === 'case') throw new Unreadable()
    if (NOT_A_COMMAND.has(words[0]!.text)) return
    let assignments = 0
    while (assignments < words.length && ASSIGNMENT.test(words[assignments]!.text)) assignments++
    if (assignments === words.length) return
    this.out.push({ words: words.map(w => w.text), assignments, dynamic: words[assignments]!.dynamic })
  }

  /** `<`, `>`, `>>`, `>&`, `>|`, `<>`, `<&`, `<<`, `<<-`, `<<<`, `&>`, `&>>`: left out, with the word they name. */
  private redirection(): void {
    if (this.started && !this.quoted && /^\d+$/.test(this.cur)) { this.cur = ''; this.started = false } else this.finishWord()
    const op = /^(&>>|&>|<<<|<<-|<<|<>|<&|>>|>&|>\||<|>)/.exec(this.src.slice(this.pos))![1]!
    this.pos += op.length
    this.target = op === '<<' ? 'heredoc' : op === '<<-' ? 'heredoc-strip' : 'file'
  }

  /** After a new line, the bodies of the here-documents opened on the line before it. */
  private readHereDocs(): void {
    const docs = this.hereDocs
    this.hereDocs = []
    for (const doc of docs) {
      while (this.pos < this.src.length) {
        const end = this.src.indexOf('\n', this.pos)
        const lineEnd = end === -1 ? this.src.length : end
        const line = this.src.slice(this.pos, lineEnd)
        this.pos = end === -1 ? this.src.length : end + 1
        if ((doc.stripTabs ? line.replace(/^\t+/, '') : line) === doc.delimiter) break
        if (!doc.quoted) new Parser(line, this.out, this.depth + 1).parseBody()
      }
    }
  }

  private doubleQuoted(): void {
    this.started = true; this.quoted = true
    while (this.pos < this.src.length) {
      const c = this.src[this.pos]!
      if (c === '"') { this.pos++; return }
      if (c === '\\') {
        const next = this.src[this.pos + 1]
        if (next === '\n') { this.pos += 2; continue }
        this.cur += next !== undefined && '$`"\\'.includes(next) ? next : '\\'
        this.pos += next !== undefined && '$`"\\'.includes(next) ? 2 : 1
      } else if (c === '$') this.dollar()
      else if (c === '`') this.backQuoted()
      else { this.cur += c; this.pos++ }
    }
    throw new Unreadable()
  }

  private backQuoted(): void {
    let i = this.pos + 1
    let inner = ''
    for (; i < this.src.length && this.src[i] !== '`'; i++) {
      if (this.src[i] === '\\' && i + 1 < this.src.length && '$`\\'.includes(this.src[i + 1]!)) inner += this.src[++i]
      else inner += this.src[i]
    }
    if (i >= this.src.length) throw new Unreadable()
    new Parser(inner, this.out, this.depth + 1).parseAll()
    this.pos = i + 1
    this.started = true; this.dynamic = true; this.cur += '$'
  }

  private dollar(): void {
    const src = this.src
    this.started = true; this.dynamic = true; this.cur += '$'
    if (src.startsWith('$((', this.pos)) {
      this.pos += 3; this.arithmetic()
    } else if (src.startsWith('$(', this.pos)) {
      this.pos += 2; this.nested()
    } else if (src.startsWith('${', this.pos)) {
      this.pos += 2; this.braced()
    } else {
      this.pos++
    }
  }

  private arithmetic(): void {
    let depth = 0
    while (this.pos < this.src.length) {
      const c = this.src[this.pos]!
      if (c === '$' || c === '`') { c === '$' ? this.dollar() : this.backQuoted(); continue }
      this.pos++
      if (c === '(') depth++
      else if (c === ')') {
        if (depth > 0) { depth--; continue }
        if (this.src[this.pos] !== ')') throw new Unreadable()
        this.pos++
        return
      }
    }
    throw new Unreadable()
  }

  private braced(): void {
    while (this.pos < this.src.length) {
      const c = this.src[this.pos]!
      if (c === '}') { this.pos++; return }
      if (c === '\\') this.pos += 2
      else if (c === '$') this.dollar()
      else if (c === '`') this.backQuoted()
      else if (c === "'") {
        const end = this.src.indexOf("'", this.pos + 1)
        if (end === -1) throw new Unreadable()
        this.pos = end + 1
      } else if (c === '"') {
        const keep = this.cur
        this.pos++; this.doubleQuoted(); this.cur = keep
      } else this.pos++
    }
    throw new Unreadable()
  }
}

/** Every simple command in `command`, or null when it cannot be read. */
export function splitShellCommand(command: string): SimpleCommand[] | null {
  const out: SimpleCommand[] = []
  try {
    new Parser(command, out, 0).parseAll()
  } catch (err) {
    if (err instanceof Unreadable) return null
    throw err
  }
  return out
}

/** A rule's words, as a command's are read; null when the rule is not one simple command. */
export function shellWords(pattern: string): string[] | null {
  const commands = splitShellCommand(pattern)
  return commands?.length === 1 ? commands[0]!.words : null
}
