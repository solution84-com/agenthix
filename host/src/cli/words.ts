/**
 * How the CLI writes: the product's and the command's names from the branding module, and sentences wrapped to a
 * terminal's width. HQ is written in capitals in everything a person reads; commands keep `hq`.
 */
import { BRANDING } from '@agenthix/core'

export const WIDTH = 70

/** A command as a person types it: `agenthix hq invite-admin`. */
export const cmd = (rest: string) => `${BRANDING.cliCommand} ${rest}`

export const product = BRANDING.displayName

/**
 * Wraps prose to `width`, every line indented by `indent`. A command after a colon goes on its own line
 * when it would not fit, so it is never split.
 */
export function wrap(text: string, indent = '', width = WIDTH): string {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line && indent.length + line.length + 1 + word.length > width) {
      lines.push(indent + line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(indent + line)
  return lines.join('\n')
}

/** A sentence that ends in a command to run: the prose wrapped, the command whole on its own line if needed. */
export function nextStep(prose: string, command: string, indent = '', width = WIDTH): string {
  const oneLine = `${prose} ${command}`
  if (indent.length + oneLine.length <= width) return indent + oneLine
  const wrapped = wrap(prose, indent, width)
  const last = wrapped.split('\n').pop() ?? ''
  if (last.length + 1 + command.length <= width) return `${wrapped} ${command}`
  return `${wrapped}\n${indent}  ${command}`
}

/** A step of a long action: its name, dots, and how it went. */
export function stepLine(step: string, outcome: string, width = 60): string {
  const dots = Math.max(3, width - step.length - 1)
  return `${step} ${'.'.repeat(dots)} ${outcome}`
}
