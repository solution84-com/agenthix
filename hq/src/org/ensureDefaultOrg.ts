import { prisma } from 'wasp/server'

// The name the dev seed already uses; the onboarding Organisation step renames it.
export const DEFAULT_ORG_NAME = 'My Organisation'

/**
 * hq always has an organisation: onboarding renames this one rather than
 * creating it, and registering a site needs one to exist.
 */
export async function ensureDefaultOrg(): Promise<'created' | 'existing'> {
  const existing = await prisma.org.findFirst()
  if (existing) return 'existing'
  await prisma.org.create({ data: { name: DEFAULT_ORG_NAME } })
  return 'created'
}
