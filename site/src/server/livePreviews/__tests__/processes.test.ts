/** What the guard reads inside a live preview's container, and what it counts as no one's. */
import { describe, expect, it } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import { privilegedProcesses, readSnapshot, unexpectedProcesses } from '../guard/processes'

const priv = 'Uid: 1001 1001 1001 1001 Gid: 1001 1001 1001 1001 CapPrm: 0000000000000000 CapEff: 0000000000000000 NoNewPrivs: 1'
const proc = (pid: number, ppid: number, cmd: string, u = priv) => [`P ${pid} (x) S ${ppid} 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${pid}`, `C ${cmd}`, `U ${u}`]
// 127.0.0.1:5173 and 0.0.0.0:4000 listening; little-endian addresses as the kernel writes them.
const tcp = [
  'sl local_address rem_address st',
  '0: 0100007F:1435 00000000:0000 0A',
  '1: 00000000:0FA0 00000000:0000 0A',
]

function snapshot(...procs: string[][]) {
  return readSnapshot(['self 50', ...procs.flat(), 'NET', ...tcp, 'END'].join('\n'))!
}

withFeature('livePreview', () => {
  describe('a look inside a live preview @SC-1738', () => {
    it('reads ports listening on loopback only apart from the open ones', () => {
      const s = snapshot(proc(1, 0, 'init'), proc(7, 1, 'tail'), proc(50, 0, 'sh'))
      expect(s.listening).toEqual({ open: [4000], loopback: [5173] })
    })

    it('spares the apps\' trees and its own look, and finds an exec and an escaped process', () => {
      const s = snapshot(proc(1, 0, 'init'), proc(7, 1, 'tail'), proc(50, 0, 'sh'), proc(60, 0, 'app'), proc(61, 60, 'node'),
        proc(70, 0, 'stranger'), proc(80, 1, 'daemon'))
      const found = unexpectedProcesses(s, { spared: new Set([60]), siteExecGoing: false }).map(p => p.pid)
      expect(found).toEqual([70, 80])
      expect(unexpectedProcesses(s, { spared: new Set([60]), siteExecGoing: true }).map(p => p.pid)).toEqual([80])
    })

    it('finds a process that runs as another user or holds capabilities', () => {
      const root = 'Uid: 0 0 0 0 Gid: 0 0 0 0 CapPrm: 0000000000000000 CapEff: 0000000000000000 NoNewPrivs: 1'
      const caps = priv.replace('CapEff: 0000000000000000', 'CapEff: 0000000000003000')
      const s = snapshot(proc(1, 0, 'init'), proc(9, 1, 'a', root), proc(10, 1, 'b', caps))
      expect(privilegedProcesses(s, '1001:1001').map(p => p.process.pid)).toEqual([9, 10])
    })

    it('reads an answer that did not end as no look at all', () => {
      expect(readSnapshot('self 5\nP 1 (x) S 0\n')).toBeNull()
    })
  })
})
