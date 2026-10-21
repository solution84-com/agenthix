// A test that needs N database connections at once fails confusingly on a
// pool smaller than N: Prisma's pool-acquisition timeout surfaces as an
// assertion failure a long way from the cause. This holds N connections open
// at the same time — which a smaller pool cannot do — and says so plainly.

export type AcquireWhileHeld = (whileHeld: () => Promise<void>) => Promise<unknown>

export async function assertPoolHolds(
  connections: number,
  acquire: AcquireWhileHeld,
  waitMs = 4000
): Promise<void> {
  let arrived = 0
  // Counted when the barrier opens: a connection freed by the first arrivals
  // giving up must not let a late one make a short pool look big enough.
  let heldAtRelease = -1
  let open!: () => void
  const allArrived = new Promise<void>((resolve) => {
    open = resolve
  })
  const release = () => {
    if (heldAtRelease >= 0) return
    heldAtRelease = arrived
    open()
  }
  const giveUp = setTimeout(release, waitMs)

  const settled = await Promise.allSettled(
    Array.from({ length: connections }, () =>
      acquire(async () => {
        arrived += 1
        if (arrived === connections) release()
        await allArrived
      })
    )
  )
  clearTimeout(giveUp)

  if (heldAtRelease < connections) {
    throw new Error(
      `This test needs ${connections} database connections at once but the pool handed out ${heldAtRelease}. ` +
        'Raise the pool size (`connection_limit` in DATABASE_URL, or a Postgres max_connections that allows it) ' +
        'before looking at the code under test.'
    )
  }
  const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed) throw failed.reason
}
