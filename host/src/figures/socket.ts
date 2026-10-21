/**
 * The figures socket (host-management spec §6): read-only, shared with the site the host service runs so that
 * the site can report its capacity to hq. It answers `figures.read` and nothing else — not even the other
 * operations of the closed set, which only the owner socket takes.
 */
import type { HostFigures } from '@agenthix/core'
import type { Handler } from '../sockets/lineServer'

export function figuresHandler(collect: () => Promise<HostFigures>): Handler {
  return async data => {
    const op = data && typeof data === 'object' && !Array.isArray(data) ? (data as { op?: unknown }).op : undefined
    if (op !== 'figures.read' || Object.keys(data as object).length !== 1) {
      return { ok: false, op: null, refusal: { code: 'unknown_operation', message: 'This socket gives the machine’s figures only.' } }
    }
    return { ok: true, op: 'figures.read', result: await collect() }
  }
}
