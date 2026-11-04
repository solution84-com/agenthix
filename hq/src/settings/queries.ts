import { type GetUserSettings, type GetSiteConfig, type GetOrg, type GetEnvStatus, type GetVersionInfo } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { BUILD_INFO } from '../server/buildInfo'
import { requireRole } from '../server/identity/requireRole'
import { getApp } from '../github/githubApp'
import { githubAppStatusView, type GithubAppStatusResult } from '../github/appStatusView'
import { isOrgAdmin } from '../projects/membership'
import { filesPlace } from '../server/files/filesOrigin'
import type { UserSettingsView } from '@agenthix/core'
import { userSettingsView } from './userSettingsView'

type GetUserSettingsArgs = void

export const getUserSettings: GetUserSettings<GetUserSettingsArgs, UserSettingsView> = async (_args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authenticated')
  }

  let settings = await context.entities.UserSettings.findUnique({
    where: { userId: context.user.id },
  })

  // Auto-create settings on first access (sensible defaults)
  if (!settings) {
    settings = await context.entities.UserSettings.create({
      data: {
        userId: context.user.id,
        role: 'MEMBER',
        config: {},
      },
    })
  }

  return userSettingsView(settings)
}

type SiteConfigResult = {
  id: string
  siteId: string
  name: string
  description: string
  riskRules: any
}

export const getSiteConfig: GetSiteConfig<void, SiteConfigResult> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  const config = await context.entities.SiteConfig.findFirst()
  if (!config) {
    return { id: '', siteId: '', name: 'Agenthix Site', description: '', riskRules: null }
  }
  return config
}

type OrgResult = { id: string; name: string; vision: string; mission: string }

export const getOrg: GetOrg<void, OrgResult> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  const org = await context.entities.Org.findFirst()
  if (!org) return { id: '', name: 'My Organisation', vision: '', mission: '' }
  return { id: org.id, name: org.name, vision: org.vision, mission: org.mission }
}

export const getGithubAppStatus = async (_args: unknown, context: { user?: { id: string } }): Promise<GithubAppStatusResult> => {
  if (!context.user) throw new HttpError(401)
  const app = await getApp()
  if (!app) return githubAppStatusView(null, [], false)
  const installations = await prisma.gitHubInstallation.findMany({ select: { accountLogin: true, accountType: true } })
  return githubAppStatusView(app, installations, await isOrgAdmin(context.user.id))
}

type EnvKey = {
  key: string
  set: boolean
  required: 'always' | 'production' | 'optional'
}

type EnvStatusResult = {
  /** hq's own address, which browsers and every site's machine reach it at; null when unset. */
  address: string | null
  /** Where uploaded files are served from (adr-0114); `downloadsOnly` when HQ has no host name to give them. */
  files: { mode: 'origin' | 'downloadsOnly'; origin: string; bareAddress: boolean }
  sections: { label: string; keys: EnvKey[] }[]
}

const isSet = (key: string) => !!process.env[key]

function filesFacts(): EnvStatusResult['files'] {
  const place = filesPlace()
  return { mode: place.mode, origin: place.origin, bareAddress: place.mode === 'downloadsOnly' && place.reason === 'bareAddress' }
}

export const getEnvStatus: GetEnvStatus<void, EnvStatusResult> = async (_args, context) => {
  await requireRole(context, 'ADMIN', 'Reading the environment', 'Admin access required')
  return readEnvStatus()
}

/** The environment's facts, with no check of who asks: for callers that have made their own (the support bundle). */
export function readEnvStatus(): EnvStatusResult {
  return {
    address: process.env.WASP_SERVER_URL || null,
    files: filesFacts(),
    sections: [
      {
        label: 'Site Security',
        keys: [
          { key: 'SECRETS_MASTER_KEY', set: isSet('SECRETS_MASTER_KEY'), required: 'always' },
        ],
      },
      {
        label: 'Database',
        keys: [
          { key: 'DATABASE_URL', set: isSet('DATABASE_URL'), required: 'production' },
          { key: 'DB_PASSWORD',  set: isSet('DB_PASSWORD'),  required: 'optional' },
        ],
      },
      {
        label: 'Server',
        keys: [
          { key: 'PORT',               set: isSet('PORT'),               required: 'optional' },
          { key: 'WASP_SERVER_URL',    set: isSet('WASP_SERVER_URL'),    required: 'production' },
          { key: 'WASP_WEB_CLIENT_URL',set: isSet('WASP_WEB_CLIENT_URL'),required: 'production' },
          { key: 'HQ_TRUSTED_PROXIES', set: isSet('HQ_TRUSTED_PROXIES'), required: 'optional' },
          // Optional because live previews are optional: a deployment that sets none has
          // them off, and HQ on localhost uses p-<id>.preview.localhost (adr-0169).
          { key: 'PREVIEW_PATTERN',    set: isSet('PREVIEW_PATTERN'),    required: 'optional' },
          // Optional because HQ on localhost needs none, and without one uploads are downloads only (adr-0114).
          { key: 'FILES_ORIGIN',       set: isSet('FILES_ORIGIN'),       required: 'optional' },
        ],
      },
      {
        label: 'Filesystem',
        keys: [
          // hq's own storage: agent images, the voice cache, board templates and
          // library skills all live under it. It falls back to a directory beside
          // the build output, which survives a local checkout and does not survive
          // a container — so a deployment must set it, and both production compose
          // files do.
          { key: 'HQ_STORAGE_ROOT',  set: isSet('HQ_STORAGE_ROOT'),  required: 'production' },
        ],
      },
    ],
  }
}

type VersionInfo = { version: string; built: string }

export const getVersionInfo: GetVersionInfo<void, VersionInfo> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  return BUILD_INFO
}
