import { HttpError, prisma } from 'wasp/server'
import { roleAtLeast, type OrgRole } from './rolePolicy'

/**
 * Browser-action floor: 401 unauthenticated, 403 below the floor. Same table
 * as the MCP gates (rolePolicy.ts) — spec §H2's "the same check it would
 * apply to that person's browser request".
 */
export async function requireRole(
  context: { user?: { id: string } | null },
  floor: OrgRole,
  what: string,
  deniedMessage?: string,
): Promise<void> {
  if (!context.user) throw new HttpError(401)
  const settings = await prisma.userSettings.findUnique({
    where: { userId: context.user.id },
    select: { role: true },
  })
  if (!roleAtLeast(settings?.role ?? null, floor)) {
    throw new HttpError(403, deniedMessage ?? `${what} requires the ${floor} or higher role`)
  }
}
