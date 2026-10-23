// Ports on this machine, for the install test, which runs beside whatever else is installed here.
//   node scripts/install-test/ports.mjs taken 4180 4181 4300   which of these are held: one that answers on 127.0.0.1,
//                                                               or cannot be bound on every address (space-separated;
//                                                               nothing when all are free)
//   node scripts/install-test/ports.mjs free 3 1024 32767      3 distinct free ports from that range, one per line
import net from 'node:net'
import { fileURLToPath } from 'node:url'

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

export async function taken(ports) {
  const held = []
  for (const port of ports) if (await answers(port) || !(await bindable(port))) held.push(port)
  return held
}

export async function free(count, first, last) {
  const chosen = []
  for (let tries = 0; chosen.length < count && tries < 200; tries++) {
    const port = first + Math.floor(Math.random() * (last - first + 1))
    if (chosen.includes(port) || (await taken([port])).length) continue
    chosen.push(port)
  }
  if (chosen.length < count) throw new Error(`could not find ${count} free ports between ${first} and ${last}`)
  return chosen
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2)
  const numbers = args.map(Number)
  if (!['taken', 'free'].includes(mode) || numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 65535)) {
    console.error('Usage: ports.mjs taken <port>... | ports.mjs free <count> <first> <last>')
    process.exit(2)
  }
  if (mode === 'taken') console.log((await taken(numbers)).join(' '))
  else console.log((await free(numbers[0], numbers[1], numbers[2])).join('\n'))
}
