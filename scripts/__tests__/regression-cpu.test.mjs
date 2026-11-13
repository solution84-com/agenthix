// The processors each running step uses: its process tree's, plus a share of Docker's for the Docker steps, from the
// processor time each process used between two readings.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CpuMeter, cpuByStep, cpuSeconds, parseCpu } from '../regression/cpu.mjs'

const VM = '/System/Library/Frameworks/Virtualization.framework/XPCServices/com.apple.Virtualization.VirtualMachine.xpc'
const at = (t) => parseCpu([
  `  10     1 0:${String(t.run).padStart(2, '0')}.00 node run.mjs`,
  `  20    10 0:${String(t.vitest).padStart(2, '0')}.00 node vitest`,
  `  21    20 0:${String(t.worker).padStart(2, '0')}.00 node worker`,
  `  30    10 0:${String(t.images).padStart(2, '0')}.00 sh scripts/images/start-test-all.sh`,
  `  40     1 0:${String(t.vm).padStart(2, '0')}.00 ${VM}`,
].join('\n'))

test('processor time reads in every form ps prints it', () => {
  assert.equal(cpuSeconds('0:09.40'), 9.4)
  assert.equal(cpuSeconds('7:40.99'), 460.99)
  assert.equal(cpuSeconds('1:02:03.00'), 3723)
  assert.equal(cpuSeconds('1-00:00:01.00'), 86_401)
})

test('a step counts the processor time its tree used, and the Docker steps share what Docker used', () => {
  const before = new Map(at({ run: 0, vitest: 0, worker: 0, images: 0, vm: 0 }).map((r) => [r.pid, r.cpu]))
  const rows = at({ run: 1, vitest: 20, worker: 10, images: 2, vm: 40 })
  const got = cpuByStep(rows, new Map([['hq-test', { pid: 20, docker: false }], ['images', { pid: 30, docker: true }]]), before, 10)
  assert.equal(got.get('hq-test'), 3)
  assert.equal(got.get('images'), 4.2)
})

test('the meter keeps each step\'s mean and peak over its readings', () => {
  const readings = [at({ run: 0, vitest: 0, worker: 0, images: 0, vm: 0 }), at({ run: 0, vitest: 10, worker: 10, images: 0, vm: 0 }), at({ run: 0, vitest: 15, worker: 15, images: 0, vm: 0 })]
  let clock = 0
  const meter = new CpuMeter({ read: () => readings.shift(), now: () => (clock += 10_000) })
  meter.track('hq-test', 20)
  meter.sample()
  meter.sample()
  meter.sample()
  assert.deepEqual(meter.result('hq-test'), { cores: 1.5, peak: 2 })
  assert.equal(meter.result('never'), null)
})
