/**
 * Server Bootstrap — First Admin & the Built-in Agent
 * ===================================================
 *
 * Runs ONCE when the Wasp server starts (registered as `server.setupFn`).
 *
 * ## Bootstrap sequence
 *
 * 1. **The first admin** — While hq has no users, makes a fresh one-time
 *    first-admin link and prints it from hq's own address (getting-in spec);
 *    the earlier one stops working. Commands run on hq's machine reach hq
 *    through its control socket (`auth/machine/controlSocket.ts`).
 *
 * 2. **The built-in agent** — Provisions the system agent and writes
 *    its content (instructions, skills); a site stages that content per run
 *    rather than reading it from hq's disk.
 */
import type { ServerSetupFn } from 'wasp/server'
import { prisma } from 'wasp/server'
import { ensureSiteSecret } from './siteSecretService'
import { ensureDefaultOrg } from '../org/ensureDefaultOrg'
import { ensureDefaultSite } from '../sites/defaultSite'
import { ensureSystemTemplates } from '../library/systemTemplates'
import { ensurePersonalProjectsForEveryone } from '../projects/personalProject'
import { seedPlatformSkills } from '../agents/skillsLibraryService'
import { writePlatformPackage } from '../packages/platformPackageService'
import { ensureOrgPackage } from '../packages/orgPackageService'
import { startPackageContentSweep } from '../packages/packageContentSweep'
import { startMemoryMaintenance } from '../memory/maintenance'
// Statically, not `await import(...)` like its neighbours below. Nothing else
// in the server graph imports this module, so a dynamic-only import makes it a
// second Rollup chunk, and the generated server bundles to `output.file` — which
// refuses multiple chunks and fails the whole bundle. Every other dynamic import
// in this file names a module something else already imports statically, so
// each stays in the one chunk. Keep this one static.
import { discardPlaintextSecrets } from './boot/discardPlaintextSecrets'
import { ensureKernelDefinition } from '../packages/kernelPackage'
import { HQ_SITE_CHANNEL_PATH } from '@agenthix/core'
import { startSiteChannel, markAllOfflineAtBoot } from '../sites/channel'
import { startContentChannel } from '../sites/content'
import { startFleetLinks } from '../fleet'
import { reconcileDanglingSessionsForOnlineSites } from '../sessions/danglingSessionReconciler'
import { whenWaspHttpServerReady } from './waspHttpServer'
import { getTaskFile, resolveSessionUserId } from './fileServingHandlers'
import { fileLinkHandler } from './files/fileAccess'
import { filesPlace } from './files/filesOrigin'
import { getAgentImage, getPersonImage } from './imageHandlers'
import { hqCors } from './middleware'
import { listPresets, servePreset } from './presetHandlers'
import { registerPreviewHost } from '../preview/previewHostWiring'
import { startPreviewSweep } from '../preview/previewSweep'
import { startScheduler } from '../automation/scheduler'
import { cloudConnection } from '../cloud'
import { startArchiveSweep } from '../projects/finishedArchive/archiveSweep'
import { startConversationRecovery } from '../conversations/coordinator/recovery'
import { startConversationArchiveSweep } from '../conversations/archive/sweep'
import { registerTaskOperationListener } from '../conversations/work/tasks'
import { registerRunResultListener } from './controlplane/runResults'
import { registerWorkerRunListener } from '../conversations/work/workers'
import { reconcileSiteWork } from '../conversations/work/reconcile'
import { onSiteReconciled } from '../agents/reconcileService'
import { onRunStatus } from '../sites/channel/siteEventHandler'
import { handleOperationRunStatus } from '../sites/channel/operationLinesForward'
import { startScheduledChangeSweep } from '../sites/scheduled/scheduledChanges'
import { trustedProxyCount } from './trustedProxies'
import { envProblems, sharedSubscriptionSwitchIgnoredError } from './envValidation'
import { startFirstAdminAndControlSocket } from '../auth/machine/startOnBoot'
import { orgImageHandler, teamImageHandler } from '../org/identityImages'
import { KERNEL_HANDLE, KERNEL_NAME, KERNEL_ROLE } from '../agents/kernelGuards'
import { Logger } from './utils/logger'
import { startDiagnostics, startLogging } from '../diagnostics/startDiagnostics'

const logger = new Logger('startup')

// ── Env validation ────────────────────────────────────────────────────────────
function validateEnv() {
  const errors = envProblems()
  if (errors.length > 0) {
    logger.error('Missing required env vars:\n' + errors.join('\n'))
    process.exit(1)
  }

  const switchError = sharedSubscriptionSwitchIgnoredError()
  if (switchError) logger.error(`ERROR: ${switchError}`)

  logger.info(`Env validation passed.`)
}

export const setupServer: ServerSetupFn = async ({ app }) => {
  // HQ's own log file, before anything else logs (adr-0106).
  startLogging()
  validateEnv()

  // Trust reverse proxy for client IP resolution (X-Forwarded-For) (ADR-0067)
  app.set('trust proxy', trustedProxyCount())

  // @SC-341: no blind task reset at boot. Containers, AgentRun crash-sweeping,
  // and orphan/idle container teardown all moved to site (plan 5d-2 task 8 —
  // site/src/server/runtime/bootSweep.ts, site's own setup.ts). hq no longer
  // runs agent containers and holds no live AgentRun rows of its own to sweep.
  // A task left RUN_ACTIVE across an hq restart is reconciled per-site
  // by `reconcileSite` (wired in sites/channel/index.ts's
  // `onSiteConnected`) once that task's site reconnects — read from its
  // site's own run history, not blindly requeued here. A task whose site
  // never reconnects surfaces through the existing site-OFFLINE status UI,
  // not a silent reset.

  // ═══════════════════════════════════════════════════════════════════
  // Step 1: Bootstrap mode detection
  // ═══════════════════════════════════════════════════════════════════
  const userCount = await prisma.user.count()
  const bootstrapRequired = userCount === 0
  const siteConfig = await prisma.siteConfig.findFirst()
  if (siteConfig) {
    await prisma.siteConfig.update({
      where: { id: siteConfig.id },
      data: { bootstrapRequired },
    })
  } else {
    await prisma.siteConfig.create({ data: { bootstrapRequired } })
  }
  logger.info(`Bootstrap mode: ${bootstrapRequired ? 'REQUIRED' : 'not required'} (${userCount} user(s)).`)

  // hq always has an organisation, before anything below reads it. Setup's
  // Your organisation step renames this one rather than creating it.
  if ((await ensureDefaultOrg()) === 'created') {
    logger.info(`Default organisation created.`)
  }

  // The first admin's one-time link, and the commands run on hq's machine.
  // Printed, not kept: the first-admin link is a credential (startOnBoot.ts).
  await startFirstAdminAndControlSocket(bootstrapRequired, line => logger.printOnly(line))

  // hq's own site connects by the shared HQ_PAIRING_SECRET rather than by
  // registering. Never log the secret — only which outcome happened.
  try {
    const outcome = await ensureDefaultSite()
    logger.info(outcome === 'unpaired'
      ? `No default site — HQ_PAIRING_SECRET is not set (or is shorter than 32 characters).`
      : `Default site ${outcome}.`)
  } catch (err) {
    logger.error(`Default site not ensured: ${err instanceof Error ? err.message : String(err)}`)
  }

  // The platform's built-in skills, as a package every run loads (spec §6.5).
  try {
    const platformPackage = await writePlatformPackage()
    logger.info(`Platform package at ${platformPackage.ref.digest.slice(0, 12)}${platformPackage.changed ? ' (written now)' : ''}.`)
  } catch (err) {
    logger.error(`Platform package not written: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ═══════════════════════════════════════════════════════════════════
  // Step 2: The built-in agent
  // ═══════════════════════════════════════════════════════════════════
  const existingKernel = await prisma.agent.findUnique({
    where: { handle: KERNEL_HANDLE },
  })

  if (!existingKernel) {
    // Identity only — ensureKernelDefinition below writes its content; its
    // approval is the schema's default, Deferred.
    await prisma.agent.create({
      data: {
        name: KERNEL_NAME,
        handle: KERNEL_HANDLE,
        role: KERNEL_ROLE,
        isKernel: true,
      },
    })
    logger.info(`Built-in agent created.`)
  } else {
    logger.info(`Built-in agent already exists.`)
  }

  // Writes the built-in agent's content on a fresh install, and keeps a
  // person's edits after that.
  try {
    const kernelRow = await prisma.agent.findUniqueOrThrow({ where: { handle: KERNEL_HANDLE } })
    const kernelPackage = await ensureKernelDefinition(kernelRow)
    logger.info(`Built-in agent's content at ${kernelPackage.ref.digest.slice(0, 12)}${kernelPackage.changed ? ' (written now)' : ''}.`)
  } catch (err) {
    logger.error(`Built-in agent's content not written: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── Personal projects — one per person (agents own schedule spec §4) ──────
  // Only accounts without one are touched, so this is a no-op once each has it.
  await ensurePersonalProjectsForEveryone()

  // ── System board templates — ensure defaults exist ────────────────────────
  await ensureSystemTemplates()
  logger.info(`System board templates ensured.`)

  // ── Platform skills library — seed DB from assets/library/skills/ ────────────────
  await seedPlatformSkills()
  logger.info(`Platform skills seeded.`)

  try {
    const orgPackage = await ensureOrgPackage()
    if (orgPackage) logger.info(`Org package written at ${orgPackage.ref.digest.slice(0, 12)}.`)
  } catch (err) {
    logger.error(`Org package not written: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Content no package points at any more, kept a day for runs that started before an edit.
  startPackageContentSweep()

  // Memory's background re-embed, each minute, and its tidy, once a day.
  startMemoryMaintenance()

  // The one scheduler (adr-0088): every pulse and scheduled task that is due,
  // at the top of every minute; due times recomputed from the database first.
  startScheduler()
  // Failed runs become recent errors; those older than 7 days go hourly.
  startDiagnostics()
  logger.info(`Automation scheduler started.`)

  // Finished tasks past their project's archive setting, hourly (spec §3).
  startArchiveSweep()

  // Conversations left mid-turn or with messages waiting, now and every lease (conversation layer spec).
  startConversationRecovery()
  // Conversations idle for the organisation's days, once a day (on-screen spec).
  startConversationArchiveSweep()
  // A run's end: its result marked, then any conversation's task operation it carries out (after the task's own state).
  registerRunResultListener()
  registerTaskOperationListener()
  // Conversations' standing workers: their runs' events into the operations they carry out.
  registerWorkerRunListener()
  onRunStatus('conversation-activity', handleOperationRunStatus)
  // When a site connects: its conversations' briefs and task runs, read against what it holds.
  onSiteReconciled('conversation-work', reconcileSiteWork)

  // Runs held around scheduled changes, by hq's own clock as well as their notices (host-management spec §14).
  startScheduledChangeSweep()

  // A connection to Agenthix Cloud checks in at once, then within every hour (cloudConnection.ts).
  void cloudConnection()?.startCheckIns().catch(err => logger.warn(`Could not check in with Agenthix Cloud: ${err instanceof Error ? err.message : err}`))

  // ── Workforce templates — seed from assets/library/workforce/ ────────────
  const { ensureWorkforceTemplates } = await import('../library/workforceTemplateService')
  await ensureWorkforceTemplates()
  logger.info(`Workforce templates seeded.`)

  // ── Agent templates — seed from assets/library/agents/ ───────────────────
  const { ensureAgentTemplates } = await import('../library/agentTemplateService')
  await ensureAgentTemplates()
  logger.info(`Agent templates seeded.`)

  // ── Site secrets — auto-generate on first boot if missing ────────────────
  const newJwt = await ensureSiteSecret('JWT_SIGNING_SECRET')
  if (newJwt) logger.info(`JWT signing secret provisioned.`)

  // HQ token-signing keypair (hq/site split §2). Needs SECRETS_MASTER_KEY —
  // if unset, identity endpoints 503 until it is provided and hq restarts.
  try {
    const { ensureHqSigningKey } = await import('./identity/signingKeyService')
    if (await ensureHqSigningKey()) logger.info(`HQ signing key provisioned.`)
  } catch (err: any) {
    logger.warn(`HQ signing key not provisioned: ${err.message}`)
  }

  // Seed Anthropic key from env var if present and not yet in DB. The write
  // encrypts, so it depends on SECRETS_MASTER_KEY — warn-and-continue like
  // the signing key above rather than failing the whole boot over a seed
  // that is a convenience, not a requirement.
  const anthropicEnv = process.env.ANTHROPIC_API_KEY
  if (anthropicEnv) {
    try {
      const { seedLlmApiKey } = await import('../server/providerService')
      if (await seedLlmApiKey('anthropic', anthropicEnv)) logger.info(`Anthropic key seeded.`)
    } catch (err: any) {
      logger.warn(`Anthropic key not seeded: ${err.message}`)
    }
  }

  // Provider keys (LLM + voice) are encrypted at rest. A row still in the
  // clear, from before that, is removed rather than converted, and the key is
  // entered again (boot/discardPlaintextSecrets.ts). Never throws.
  await discardPlaintextSecrets()

  // ADR-0058: memory of a person lives in hq now — a site's own setup.ts sets aside any leftover, not this one.

  // ═══════════════════════════════════════════════════════════════════
  // Execution Site control channel (spec §4) — sites dial in, hq never dials out
  // ═══════════════════════════════════════════════════════════════════
  // Under ADR-0042 hq is the top of the hierarchy: this is the server half that
  // registered sites connect to.
  //
  // Connections live in memory, so nothing survives this restart. Any row still
  // reading ONLINE is a leftover from the previous process, and leaving it
  // would have dispatch route work to a site that is not there.
  await markAllOfflineAtBoot()

  whenWaspHttpServerReady('Execution Site channel', server => {
    startSiteChannel(server)
    logger.info(`Execution Site channel listening on ${HQ_SITE_CHANNEL_PATH}.`)
    // @SC-346: the meaningful trigger is per-connection (onSiteConnected in
    // sites/channel/index.ts, which fires after THIS site's own reconcileSite
    // completes) — no site has dialed in yet at the instant the channel
    // itself starts listening, so this call is a documented no-op in the
    // common case, kept for the (recovered-process) case where a site is
    // already marked online in the status store before this boot's own
    // connections have re-established.
    void reconcileDanglingSessionsForOnlineSites()
  })

  whenWaspHttpServerReady('Execution Site content transport', server => {
    startContentChannel(server)
  })

  // Host management (host-management spec §4 C3, C8): host services and the Fleet Console dial in on their own
  // paths, and hq relays sealed envelopes between them. hq holds no machine authority: it passes what it cannot read.
  whenWaspHttpServerReady('host and console links', server => {
    startFleetLinks(server)
  })

  // ═══════════════════════════════════════════════════════════════════
  // File Serving Endpoints
  // ═══════════════════════════════════════════════════════════════════
  // Registered directly on Express (not via Wasp api blocks) because
  // Wasp 0.21 does not support wildcard (*) path segments in api routes.

  // Uploaded files (host-management spec §16, adr-0114): served on the files origin, each to a short-lived link
  // HQ makes for one file and one person, never to a session. The link is asked for on HQ's own address, with
  // the session's token, so it answers a page on another origin (the dev client) as the other APIs do.
  app.options('/file-link', hqCors())
  app.get('/file-link', hqCors(), fileLinkHandler(resolveSessionUserId))
  app.get('/files/task/:taskId/:uuid/*path', getTaskFile)
  app.get('/agents/:agentId/images/:filename', getAgentImage)
  app.get('/people/:userId/images/:filename', getPersonImage)
  app.get('/org/images/:filename', orgImageHandler)
  app.get('/teams/:teamId/images/:filename', teamImageHandler)
  const files = filesPlace()
  logger.info(files.mode === 'origin'
    ? `Uploaded files served from ${files.origin}.`
    : `Uploaded files are served from HQ's own address, as downloads only: set FILES_ORIGIN to give them their own.`)

  // Preset endpoints — serves files directly from assets/{avatars,covers}/
  app.get('/presets/:type', listPresets)
  app.get('/presets/:type/:filename', servePreset)

  logger.info(`File serving endpoints registered.`)

  // ═══════════════════════════════════════════════════════════════════
  // Live preview — served from p-<id>.<preview domain>, routed by Host on
  // Wasp's underlying http server, never from hq's own origin (adr-0071)
  // ═══════════════════════════════════════════════════════════════════
  startPreviewSweep()
  whenWaspHttpServerReady('Live preview host', server => {
    const domain = registerPreviewHost(server)
    logger.info(
      domain
        ? `Live preview served on *.${domain}.`
        : `Live preview is off: set PREVIEW_DOMAIN to turn it on.`,
    )
  })
}
