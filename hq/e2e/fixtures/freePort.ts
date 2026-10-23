import net from 'node:net'

/** A free port, asked of the operating system: bind port 0, read the port that was given, close. */
export function freePort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') return reject(new Error('the operating system gave no port'))
      server.close(() => resolvePromise(address.port))
    })
  })
}
