// Free ports for a run, asked of the operating system: bind port 0, read the port that was given, close.
import net from 'node:net'

function bindOnce(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolvePromise, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') return reject(new Error('the operating system gave no port'))
      resolvePromise({ server, port: address.port })
    })
  })
}

const close = (server: net.Server) => new Promise<void>((resolvePromise) => server.close(() => resolvePromise()))

/**
 * `count` distinct free ports. All are held open until every one is chosen, so the operating system cannot hand the
 * same port out twice; they are released together on return.
 */
export async function freePorts(count: number): Promise<number[]> {
  const held: Array<{ server: net.Server; port: number }> = []
  try {
    for (let i = 0; i < count; i++) held.push(await bindOnce())
    return held.map((h) => h.port)
  } finally {
    await Promise.all(held.map((h) => close(h.server)))
  }
}
