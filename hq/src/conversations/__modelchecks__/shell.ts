/**
 * A shell command as a check's world answers it: the commands a run uses to look around, answered from the world's
 * files, so a run is never left thinking its shell is broken. A command line is split at `;`, `&&` and `||`; a pipe
 * passes the first command's output on as it is (`| cat`, `| head`), and `> file` writes it into the world's files.
 * Git is the world's own; any other command prints nothing, as a command that succeeds quietly does.
 */

export interface ShellWorld {
  /** The working folder, absolute. */
  folder: string
  /** The files, by their path in the working folder; a redirect adds to them. */
  files: Record<string, string>
  /** A git command's output (the words after `git`); null for one the world doesn't know, which prints nothing. */
  git?(args: string): string | null
  /** What an address answers, for curl: a page the world serves, or null when nothing answers there. */
  fetch?(url: string): string | null
}

/** The tools a run checks are there, and the versions they say. */
const INSTALLED: Readonly<Record<string, string>> = { node: 'v24.11.0', npm: '11.6.2', git: 'git version 2.51.0', curl: 'curl 8.7.1' }

/** A path as a command gave it, relative to the working folder; null when it is outside it. */
export function inFolder(world: ShellWorld, given: string): string | null {
  const bare = given.replace(/^['"]|['"]$/g, '')
  if (bare === world.folder || bare === '.' || bare === '') return ''
  if (bare.startsWith(`${world.folder}/`)) return bare.slice(world.folder.length + 1)
  if (bare.startsWith('/')) return null
  return bare.replace(/^\.\//, '')
}

/** The files under a path: the working folder's by their relative path, any other by its full one. */
function list(world: ShellWorld, given: string | undefined): string {
  const at = given === undefined ? '' : inFolder(world, given) ?? given.replace(/\/+$/, '')
  const keys = Object.keys(world.files).filter(k => (at === '' ? !k.startsWith('/') : k === at || k.startsWith(`${at}/`)))
  return keys.sort().join('\n')
}

function unquote(text: string): string {
  return text.trim().replace(/^(['"])([\s\S]*)\1$/, '$2')
}

function one(command: string, world: ShellWorld): string {
  const [word = '', ...rest] = command.trim().split(/\s+/)
  const args = command.trim().slice(word.length).trim()
  switch (word) {
    case '': case 'cd': case 'true': return ''
    case 'pwd': return world.folder
    case 'echo': return unquote(args.replace(/^-[ne]+\s+/, ''))
    case 'printf': return unquote(args).replace(/\\n/g, '\n')
    case 'ls': case 'find': case 'tree': return list(world, rest.find(a => !a.startsWith('-')))
    case 'cat': case 'head': case 'tail': {
      const paths = rest.filter(a => !a.startsWith('-'))
      return paths.map(p => {
        // A file written outside the folder (`> /tmp/out.txt`) is kept by its full path.
        const at = inFolder(world, p) ?? p
        return at in world.files ? world.files[at]! : `${word}: ${p}: No such file or directory`
      }).join('\n')
    }
    case 'grep': case 'rg': {
      const pattern = unquote(rest.filter(a => !a.startsWith('-'))[0] ?? '').toLowerCase()
      return Object.entries(world.files).filter(([, text]) => text.toLowerCase().includes(pattern)).map(([f]) => (f.startsWith('/') ? f : `${world.folder}/${f}`)).join('\n')
    }
    case 'git':
      if (/^--version\b/.test(args)) return INSTALLED.git!
      return world.git?.(args.replace(/^--no-pager\s+/, '')) ?? ''
    case 'which': return rest.filter(a => a in INSTALLED).map(a => `/usr/bin/${a}`).join('\n')
    case 'command': return rest.filter(a => a in INSTALLED).map(a => `/usr/bin/${a}`).join('\n')
    case 'node': case 'npm': return /^(-v|--version)\b/.test(args) ? INSTALLED[word]! : ''
    case 'curl': {
      if (/^--version\b/.test(args)) return INSTALLED.curl!
      const url = rest.find(a => /^(https?:\/\/)?(localhost|127\.0\.0\.1)/.test(a))
      return (url && world.fetch?.(url)) ?? `curl: (7) Failed to connect to ${url ?? 'the address'}: Connection refused`
    }
    default: return ''
  }
}

/** One segment of a command line: its first command's output, written to a file when it is redirected there. */
function segment(text: string, world: ShellWorld): string {
  const first = text.split(/\s\|\s?|\|(?!\|)/)[0] ?? ''
  const cleaned = first.replace(/\s\d?>&\d/g, '').replace(/\s\d>\s*\/dev\/null/g, '')
  const redirect = /\s>>?\s*(\S+)\s*$/.exec(cleaned)
  const output = one(redirect ? cleaned.slice(0, redirect.index) : cleaned, world)
  if (!redirect) return output
  const at = inFolder(world, redirect[1]!) ?? redirect[1]!
  if (at !== '/dev/null') world.files[at] = output
  return ''
}

export function runShell(command: string, world: ShellWorld): string {
  return command.split(/\s*(?:&&|\|\||;|\n)\s*/).map(part => segment(part, world)).filter(Boolean).join('\n')
}
