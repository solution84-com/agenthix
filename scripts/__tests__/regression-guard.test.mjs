import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryVerdict, otherHeavyRun, ownTree, parseProcesses, MemoryWatch } from '../regression/guard.mjs'

test('a step goes only with a quarter of memory free and swap not growing; under a tenth the run stops', () => {
  assert.equal(memoryVerdict({ free: 60, swapNow: 1000, swapBefore: 1000 }), 'go')
  assert.equal(memoryVerdict({ free: 24, swapNow: 1000, swapBefore: 1000 }), 'hold')
  assert.equal(memoryVerdict({ free: 60, swapNow: 1300, swapBefore: 1000 }), 'hold')
  assert.equal(memoryVerdict({ free: 60, swapNow: 900, swapBefore: 1000 }), 'go')
  assert.equal(memoryVerdict({ free: 9, swapNow: 1000, swapBefore: 1000 }), 'abort')
  assert.equal(memoryVerdict({ free: null, swapNow: null, swapBefore: null }), 'go')
})

const ps = `
  1     0 /sbin/launchd
 100     1 node scripts/regression/run.mjs --full
 101   100 npm exec vitest run
 102   101 node /w/hq/node_modules/.bin/vitest run
 200     1 node /other/hq/node_modules/.bin/vitest run
 300     1 /bin/zsh heavy.sh npx tsc --noEmit
 400     1 node /x/node_modules/.bin/playwright test
 500     1 /x/wasp-bin compile
 700     1 /x/wasp-bin start
 600     1 node tsserver.js
`

test('reads the process list and the run’s own tree', () => {
  const list = parseProcesses(ps)
  assert.equal(list.length, 10)
  assert.deepEqual([...ownTree(list, 100)].sort(), [100, 101, 102])
})

test('close-out refuses beside a vitest, playwright or wasp compile of another process tree, not beside a development server', () => {
  const list = parseProcesses(ps)
  assert.match(otherHeavyRun({ processes: list, self: 100 }), /process 200 .*vitest/)
  const mine = list.filter((p) => ![200, 400, 500].includes(p.pid))
  assert.equal(otherHeavyRun({ processes: mine, self: 100 }), null)
  assert.match(otherHeavyRun({ processes: list.filter((p) => p.pid !== 200), self: 100 }), /process 400 .*playwright/)
  assert.match(otherHeavyRun({ processes: list.filter((p) => ![200, 400].includes(p.pid)), self: 100 }), /process 500 .*wasp/)
  assert.equal(otherHeavyRun({ processes: list.filter((p) => ![200, 400, 500].includes(p.pid)), self: 100 }), null)
})

test('the memory watch stops the run once when free memory drops under a tenth', async () => {
  const readings = [50, 40, 8, 5]
  const aborted = []
  const watch = new MemoryWatch({ read: () => readings.shift() ?? 50, everyMs: 1, onAbort: (free) => aborted.push(free) })
  watch.start()
  await new Promise((r) => setTimeout(r, 30))
  watch.stop()
  assert.deepEqual(aborted, [8])
})

test('a shell naming a test command is not a heavy run: heavy waiting in the queue, an agent\'s zsh -c', () => {
  const list = [
    { pid: 10, ppid: 1, command: "/bin/zsh -c cd /x && heavy env CI=1 npx playwright test e2e/a.spec.ts" },
    { pid: 11, ppid: 10, command: '/bin/bash /Users/u/.local/bin/heavy env CI=1 npx playwright test e2e/a.spec.ts' },
    { pid: 12, ppid: 1, command: 'bash -c vitest run' },
  ]
  assert.equal(otherHeavyRun({ processes: list, self: 100 }), null)
  const running = [...list, { pid: 13, ppid: 11, command: 'node /x/node_modules/.bin/playwright test' }]
  assert.match(otherHeavyRun({ processes: running, self: 100 }), /process 13 .*playwright/)
})
