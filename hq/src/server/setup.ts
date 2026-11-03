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
import { installImageTemplates } from '../assets/templates/imageTemplates'
import { ensurePersonalProjectsForEveryone } from '../projects/personalProject'
import { seedPlatformSkills } from '../agents/skillsLibraryService'
import { writePlatformPackage } from '../packages/platformPackageService'
import { ensureBuiltInSkills } from '../assets/builtins/boot'
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
import { ensureKernelSkills } from '../assets/templates/kernelSkills'
import { HQ_SITE_CHANNEL_PATH } from '@agenthix/core'
import { startSiteChannel, markAllOfflineAtBoot } from '../sites/channel'
import { startContentChannel } from '../sites/content'
import { startFleetLinks } from '../fleet'
import { ensureHqRelay, NO_HQ_RELAY_MESSAGE, placeUnplacedSites, startRelayLink } from '../relays'
import { registerCertificateAskRoute } from '../relays/previewCertificateAsk'
import { certificateAskDeps } from '../relays/previewCertificateAskDeps'
import { reconcileDanglingSessionsForOnlineSites } from '../sessions/danglingSessionReconciler'
import { whenWaspHttpServerReady } from './waspHttpServer'
import { registerUploadLinkRoute } from './files/uploadLinkDeps'
import { listPresets, servePreset } from './presetHandlers'
import { startLivePreviewSweep } from '../livePreviews/reconcile'
import { provideLivePreviewWorkflowDelivery } from '../livePreviews/workflowSecrets'
import { deliverLivePreviewWorkflow } from '../workflows/livePreviewRuns'
import { startScheduler } from '../automation/scheduler'
import { cloudConnection } from '../cloud'
import { startProviderHealth } from '../providers/health'
import { startArchiveSweep } from '../projects/finishedArchive/archiveSweep'
import { startConversationRecovery } from '../conversations/coordinator/recovery'
import { startConversationArchiveSweep } from '../conversations/archive/sweep'
import { startRejectedProposalSweep } from '../assets/proposals/sweep'
import { registerTaskOperationListener } from '../conversations/work/tasks'
import { registerRunResultListener } from './controlplane/runResults'
import { registerWorkerRunListener } from '../conversations/work/workers'
import { reconcileSiteWork } from '../conversations/work/reconcile'
import { onSiteReconciled } from '../agents/reconcileService'
import { onRunStatus } from '../sites/channel/siteEventHandler'
import { handleOperationRunStatus } from '../sites/channel/operationLinesForward'
import { startScheduledChangeSweep } from '../sites/scheduled/scheduledChanges'
import { trustedProxyCount } from './trustedProxies'
import { envProblems } from './envValidation'
import { startFirstAdminAndControlSocket } from '../auth/machine/startOnBoot'
import { KERNEL_HANDLE, KERNEL_NAME, KERNEL_ROLE } from '../agents/kernelGuards'
import { Logger } from './utils/logger'
import { startLedger } from '../billing/start'
import { startRotationNotices } from '../secrets/rotation'
import { resumeReviews } from '../workflows/review/afterProposal'
import { startDiagnostics, startLogging } from '../diagnostics/startDiagnostics'

const logger = new Logger('startup')

// ── Env validation ────────────────────────────────────────────────────────────
function validateEnv() {
  const errors = envProblems()
  if (errors.length > 0) {
    logger.error('Missing required env vars:\n' + errors.join('\n'))
    process.exit(1)
  }

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

  // hq's own relay connects by HQ_RELAY_SECRET, as its site does by the pairing secret (adr-0153); every site without
  // a relay is placed on it. Never log the secret.
  try {
    const outcome = await ensureHqRelay()
    if (outcome === 'unset') logger.warn(NO_HQ_RELAY_MESSAGE)
    else logger.info(`HQ's relay ${outcome}; ${await placeUnplacedSites()} site(s) placed on it.`)
  } catch (err) {
    logger.error(`HQ's relay not ensured: ${err instanceof Error ? err.message : String(err)}`)
  }

  // The platform package every run loads (spec §6.5); empty since the built-in skills are assets.
  try {
    const platformPackage = await writePlatformPackage()
    logger.info(`Platform package at ${platformPackage.ref.digest.slice(0, 12)}${platformPackage.changed ? ' (written now)' : ''}.`)
  } catch (err) {
    logger.error(`Platform package not written: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Agenthix's built-in skills, installed as assets and given to runs by hq (adr-0156).
  try {
    await ensureBuiltInSkills()
  } catch (err) {
    logger.error(`Built-in skills not installed: ${err instanceof Error ? err.message : String(err)}`)
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

  // Kernel's own skills, installed as assets and granted to it once (D14): an administrator's removal stays.
  try {
    const kernelRow = await prisma.agent.findUniqueOrThrow({ where: { handle: KERNEL_HANDLE } })
    for (const s of await ensureKernelSkills(prisma, kernelRow.id)) {
      if (s.problem) logger.warn(`Kernel's skill ${s.identity} not installed: ${s.problem}`)
      else if (s.outcome === 'new' || s.outcome === 'update') logger.info(`Kernel's skill ${s.identity} ${s.outcome === 'new' ? 'installed and given to Kernel' : 'offered as an update'} at ${s.version}.`)
    }
  } catch (err) {
    logger.error(`Kernel's skills not installed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── Personal projects — one per person (agents own schedule spec §4) ──────
  // Only accounts without one are touched, so this is a no-op once each has it.
  await ensurePersonalProjectsForEveryone()

  // ── Agenthix's agent, board and team templates — installed from hq's image (adr-0157), without what they carry (D14) ──
  for (const t of await installImageTemplates(prisma)) {
    if (t.problem) logger.warn(`Template ${t.identity ?? t.root} in hq's image not installed: ${t.problem}`)
    else if (t.outcome !== 'same') logger.info(`Template ${t.identity}: ${t.outcome}.`)
  }

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
  // Rejected skill proposals, 90 days after their review, once a day (skills spec part 5).
  startRejectedProposalSweep()
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

  // Each provider's state, from a check with its vendor that costs nothing: hourly, and every 5 minutes while one is
  // not working (providers/health.ts). Keys enter only through the provider store, never from hq's environment.
  startProviderHealth()

  // Secrets due for rotation: a notice to the place's administrators a week before, overdue after (secrets/).
  startRotationNotices()

  // Workflow versions a stop of hq left without their review and approval card (workflows/review/).
  void resumeReviews()

  // Every call costed on the ledger: subscription runs as they end, the relay's reports as they wait (billing/).
  startLedger()

  // A connection to Agenthix Cloud checks in at once, then within every hour (cloudConnection.ts).
  void cloudConnection()?.startCheckIns().catch(err => logger.warn(`Could not check in with Agenthix Cloud: ${err instanceof Error ? err.message : err}`))

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

  // Relays dial in on their own path, to be told who they are and to report their load (adr-0153).
  whenWaspHttpServerReady('relay links', server => {
    startRelayLink(server)
  })

  // ═══════════════════════════════════════════════════════════════════
  // File Serving Endpoints
  // ═══════════════════════════════════════════════════════════════════
  // Registered directly on Express (not via Wasp api blocks) because
  // Wasp 0.21 does not support wildcard (*) path segments in api routes.

  // Uploaded files (adr-0153): hq-server makes a link, on a ticket for hq's relay, and never sends the file. The
  // relay serves it from hq's storage folder, mounted read-only.
  registerUploadLinkRoute(app)

  // The front door asks before it gets a live app's address a certificate (on-demand TLS); hq answers yes or no.
  registerCertificateAskRoute(app, certificateAskDeps)

  // Preset endpoints — serves files directly from assets/{avatars,covers}/
  app.get('/presets/:type', listPresets)
  app.get('/presets/:type/:filename', servePreset)

  logger.info(`File serving endpoints registered.`)

  // Live previews' idle stop and the openings never answered (livePreviews/reconcile.ts). Their apps are served
  // through the relays, never from hq's own origin (adr-0169).
  startLivePreviewSweep()
  // A live preview's secrets reach its app's container only through the workflows' own run path (adr-0171).
  provideLivePreviewWorkflowDelivery(deliverLivePreviewWorkflow)
}
