import { prisma } from '#db'

/** Digests eviction must leave: every package digest a pending or running run records. No package is bound into a container (ruling T1). */
export async function protectedPackageDigests(): Promise<Set<string>> {
  const digests = new Set<string>()
  const runs = await prisma.agentRun.findMany({
    where: { status: { in: ['PENDING', 'RUNNING'] } },
    select: { agentPackageDigest: true, orgPackageDigest: true, platformPackageDigest: true },
  })
  for (const run of runs) {
    for (const digest of [run.agentPackageDigest, run.orgPackageDigest, run.platformPackageDigest]) {
      if (digest) digests.add(digest)
    }
  }
  return digests
}
