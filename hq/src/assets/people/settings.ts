/**
 * The organisation's skill settings, administrators only (spec part 3 *The organisation's settings* P2–P3, part 4
 * C1 and *The person's skills*): unsigned assets allowed after the warning or never; who installs from outside;
 * skills found in files (shipped Off by default, or On by default, or Never); and whether a person's own skills
 * follow them outside Your space. Choosing On by default says that agents' writes then run unreviewed, and needs
 * that confirmed (security review H4). A place's stricter default is a place's own setting, not this one.
 */
import { HttpError, prisma } from 'wasp/server'
import { organisationTarget, requireMay } from '../policyActors'

type Ctx = { user?: { id: string } | null }

export type AssetSettings = {
  unsignedAssets: 'allowed' | 'never'
  outsideInstallers: 'ADMINS' | 'ADMINS_AND_MAINTAINERS'
  fileSkillsDefault: 'ON' | 'OFF' | 'NEVER'
  personalSkillsOutsideSpace: boolean
}

export type AssetSettingsChange = Partial<AssetSettings> & { confirmUnreviewed?: boolean }

const NOTHING = 'Nothing was changed.'

export const ON_BY_DEFAULT_WARNING =
  'On by default runs every skill found in files, including ones agents write, without anyone reviewing them first.'

type Data = {
  unsignedAssetsAllowed?: boolean
  outsideInstallers?: AssetSettings['outsideInstallers']
  fileSkillsDefault?: AssetSettings['fileSkillsDefault']
  personalSkillsOutsideSpace?: boolean
}

/** The change as columns, or why it can't be made. Pure. */
export function settingsData(change: unknown, current: AssetSettings['fileSkillsDefault']): { ok: true; data: Data } | { ok: false; message: string } {
  const c = (change ?? {}) as Record<string, unknown>
  const data: Data = {}
  if (c.unsignedAssets !== undefined) {
    if (c.unsignedAssets !== 'allowed' && c.unsignedAssets !== 'never') return { ok: false, message: `Unsigned assets are allowed after the warning, or never. ${NOTHING}` }
    data.unsignedAssetsAllowed = c.unsignedAssets === 'allowed'
  }
  if (c.outsideInstallers !== undefined) {
    if (c.outsideInstallers !== 'ADMINS' && c.outsideInstallers !== 'ADMINS_AND_MAINTAINERS') {
      return { ok: false, message: `Installing from outside is for administrators, or administrators and Library maintainers. ${NOTHING}` }
    }
    data.outsideInstallers = c.outsideInstallers
  }
  if (c.fileSkillsDefault !== undefined) {
    if (c.fileSkillsDefault !== 'ON' && c.fileSkillsDefault !== 'OFF' && c.fileSkillsDefault !== 'NEVER') {
      return { ok: false, message: `Skills found in files are On by default, Off by default, or Never. ${NOTHING}` }
    }
    if (c.fileSkillsDefault === 'ON' && current !== 'ON' && c.confirmUnreviewed !== true) {
      return { ok: false, message: `${ON_BY_DEFAULT_WARNING} Confirm that to choose it. ${NOTHING}` }
    }
    data.fileSkillsDefault = c.fileSkillsDefault
  }
  if (c.personalSkillsOutsideSpace !== undefined) {
    if (typeof c.personalSkillsOutsideSpace !== 'boolean') return { ok: false, message: `Personal skills outside Your space are on or off. ${NOTHING}` }
    data.personalSkillsOutsideSpace = c.personalSkillsOutsideSpace
  }
  return { ok: true, data }
}

const SELECT = { id: true, unsignedAssetsAllowed: true, outsideInstallers: true, fileSkillsDefault: true, personalSkillsOutsideSpace: true } as const

type OrgRow = { unsignedAssetsAllowed: boolean; outsideInstallers: AssetSettings['outsideInstallers']; fileSkillsDefault: AssetSettings['fileSkillsDefault']; personalSkillsOutsideSpace: boolean }

function view(org: OrgRow): AssetSettings {
  return {
    unsignedAssets: org.unsignedAssetsAllowed ? 'allowed' : 'never',
    outsideInstallers: org.outsideInstallers,
    fileSkillsDefault: org.fileSkillsDefault,
    personalSkillsOutsideSpace: org.personalSkillsOutsideSpace,
  }
}

async function organisation() {
  const org = await prisma.org.findFirst({ select: SELECT })
  if (!org) throw new HttpError(409, `HQ isn't set up yet. ${NOTHING}`)
  return org
}

export const getAssetSettings = async (_args: unknown, context: Ctx): Promise<AssetSettings> => {
  await requireMay(context, 'settings', await organisationTarget(prisma))
  return view(await organisation())
}

export const updateAssetSettings = async (args: AssetSettingsChange, context: Ctx): Promise<AssetSettings> => {
  await requireMay(context, 'settings', await organisationTarget(prisma))
  const org = await organisation()
  const checked = settingsData(args, org.fileSkillsDefault)
  if (!checked.ok) throw new HttpError(400, checked.message)
  const updated = await prisma.org.update({ where: { id: org.id }, data: checked.data, select: SELECT })
  return view(updated)
}
