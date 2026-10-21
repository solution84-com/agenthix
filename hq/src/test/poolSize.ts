// Prisma sizes its connection pool from the machine's CPU count unless the address says otherwise, so a 2-CPU
// runner gets 3 connections and a test that holds more at once fails there alone. The integration client asks for a
// fixed size instead: enough for the largest test (20 concurrent writers), and with 4 test processes
// at most 80 connections, under Postgres's default limit of 100. A connection_limit already in the address wins.
export const TEST_POOL_SIZE = 20

export function withTestPoolSize(address: string, size = TEST_POOL_SIZE): string {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return address
  }
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', String(size))
  return url.toString()
}
