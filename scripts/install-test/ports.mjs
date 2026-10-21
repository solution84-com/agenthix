// Which of the ports given are already held on this machine: one that answers on 127.0.0.1, or cannot be bound on
// every address. Prints them, space-separated; prints nothing when all are free.
//   node scripts/install-test/ports.mjs 4180 4181 4300
import net from 'node:net'

const answers = (port) => new Promise((resolve) => {
  const c = net.connect({ host: '127.0.0.1', port, timeout: 500 })
  c.once('connect', () => { c.destroy(); resolve(true) })
  c.once('timeout', () => { c.destroy(); resolve(false) })
  c.once('error', () => resolve(false))
})

const bindable = (port) => new Promise((resolve) => {
  const s = net.createServer()
  s.once('error', () => resolve(false))
  s.listen(port, '0.0.0.0', () => s.close(() => resolve(true)))
})

const taken = []
for (const port of process.argv.slice(2).map(Number)) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`${port} is not a port.`)
    process.exit(2)
  }
  if (await answers(port) || !(await bindable(port))) taken.push(port)
}
console.log(taken.join(' '))
