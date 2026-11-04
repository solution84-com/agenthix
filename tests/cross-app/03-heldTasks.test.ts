// A task dispatched while the site is down is held on hq, not dropped or
// failed outright — TaskRunner's stepToRunning catches SiteUnreachableError
// and parks the task RUN_QUEUED with a "held for reconnect" reason instead.
// site's reconnect hook (onSiteConnected) then drains it through the ordinary
// dispatch path. Runs last, after 02-dispatch (which pairs its own default
// site before dispatching anything — see that file's header — and leaves it
// ONLINE, with an archived task session left behind) — this suite reuses
// 02's agent and leaves the site ONLINE.
//
// Environment invariant: site's SITE_ROOT is an empty temp dir (no credential
// seed, no usable Docker image), so the redispatched run deterministically
// reaches FAILED — assertions below check for a terminal execution state with
// a non-empty reason, never a specific failure reason.
import { beforeAll, describe, expect, it } from 'vitest'
import { HQ_URL } from './harness/env'
import { hqDb, siteDb } from './harness/db'
import { login, op, until } from './harness/hqApi'
import { stopSite, startSite, waitForSite } from './harness/apps'

// A run's end settles the task's run state to one of these (agents own schedule spec §6).
const RUN_SETTLED_STATES = new Set(['RUN_NONE', 'RUN_FAILED', 'RUN_BLOCKED'])
const RUN_TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

// TaskRunner.ts:43 — stepToRunning's SiteUnreachableError catch writes this
// exact reason, and drainHeldTasks (same file) filters on the same literal,
// so the two stay in lockstep by construction. Pinned here as the literal
// this suite asserts against, confirmed by reading the source directly
// (the task brief's own pinned wording matched this exactly).
const HELD_FOR_RECONNECT_REASON = 'site unreachable — held for reconnect'

let adminToken: string
let siteLogicalId: string
let projectId: string
let taskId: string
let agentId: string

// B: @SC-341 dropped from the describe title below — hq is never restarted
// in this file (only site is), so this suite never exercises reconcileSite's
// own contract (a terminal run that finished while hq itself was down and
// only surfaces once hq comes back). Unit coverage for that is
// hq/src/agents/__tests__/reconcileService.test.ts.
//
// K3: @SC-293 added — the connection-drop→OFFLINE half of SC-293 genuinely
// belongs here (a real stopSite() below), not in 01-registration's
// boot-marking describe (that OFFLINE comes from markAllOfflineAtBoot,
// SC-294's own contract). SC-293's OTHER half — a site that has never
// connected at all still shows as REGISTERED, not OFFLINE — isn't exercised
// anywhere in this cross-app tier; grepped the unit suites for it and found
// only markOffline's own `where: { status: 'ONLINE' }` filter
// (siteStatusStore.test.ts) as adjacent, non-explicit coverage — uncovered
// here.
describe('a task dispatched while the site is down is held and drained on reconnect @SC-293 @SC-339 @SC-340', () => {
  beforeAll(async () => {
    adminToken = await login('e2e-admin', 'E2eAdmin!2026')

    // The one site left ONLINE — 02-dispatch's own beforeAll paired it as
    // hq's default before that file's tests ran (01-registration's registered
    // site is a separate, now-orphaned, OFFLINE row — see 02-dispatch's
    // header). createProject (SC-287) requires picking one explicitly — args.siteId is
    // the ExecutionSite's own logical siteId (site's SiteConfig.siteId), not
    // its hq-side row id (hq/src/projects/actions.ts:64-80 resolves it via
    // `prisma.executionSite.findUnique({ where: { siteId } })`).
    //
    // H: wrapped in `until` rather than a bare findFirstOrThrow — 02-dispatch's
    // last describe only just confirmed the registry ONLINE again after its
    // own restart, so a beforeAll running immediately after that could still
    // race a registry read that hasn't caught up yet.
    const site = await until(
      async () => {
        const row = await hqDb.executionSite.findFirst({
          where: { status: 'ONLINE' },
          select: { id: true, siteId: true },
        })
        return row ?? null
      },
      'hq registry to show a site ONLINE at the start of 03-heldTasks',
      30_000,
    )
    siteLogicalId = site.siteId

    // createProject wire `create-project`, args {name, siteId}. requireRole
    // OPERATOR (hq/src/projects/actions.ts:68) — e2e-admin satisfies it.
    const createProjectRes = await op(
      HQ_URL,
      'create-project',
      { name: `Cross-App Held Task ${Date.now()}`, siteId: siteLogicalId },
      adminToken,
    )
    expect(createProjectRes.status).toBe(200)
    expect(typeof createProjectRes.json.id).toBe('string')
    projectId = createProjectRes.json.id

    // Reuses 02-dispatch's agent (handle 'crossapp-dispatch') rather than
    // minting a fresh one. An agent needs no site relationship to the
    // project it is assigned to — a run's site comes from the storage it
    // works in, resolved at dispatch time — so no site setup is needed here
    // beyond the project already being on the one real registered site.
    const agent = await hqDb.agent.findFirstOrThrow({
      where: { handle: 'crossapp-dispatch' },
      select: { id: true },
    })
    agentId = agent.id

    // create-task refuses an assignee that is not on the project's roster.
    await hqDb.projectAgent.create({ data: { projectId, agentId: agent.id } })

    // createTask (hq/src/projects/actions.ts:174-189) wire `create-task`,
    // args {projectId, title, assignedAgentId} — no boardId needed (a task's
    // board placement is only resolved when boardId is passed; runTask only
    // requires task.assignedAgentId, not a board).
    const createTaskRes = await op(
      HQ_URL,
      'create-task',
      { projectId, title: 'Cross-App Held Task', assignedAgentId: agent.id },
      adminToken,
    )
    expect(createTaskRes.status).toBe(200)
    expect(typeof createTaskRes.json.id).toBe('string')
    taskId = createTaskRes.json.id
  })

  it(
    'holds the task RUN_QUEUED with the held-for-reconnect reason while the site is down',
    async () => {
      await stopSite()

      // ExecutionSite.status flips OFFLINE on socket disconnect
      // (hq/src/sites/channel/siteStatusStore.ts) — poll hqDb directly
      // rather than an operation round trip, for speed. K3/@SC-293: this is
      // the connection-drop→OFFLINE half of that scenario — see this file's
      // own header comment above the describe block.
      await until(
        async () => {
          const row = await hqDb.executionSite.findUnique({
            where: { siteId: siteLogicalId },
            select: { status: true },
          })
          return row?.status === 'OFFLINE' ? row : null
        },
        'hq registry to show the site OFFLINE after stop',
        30_000,
      )

      // runTask (hq/src/projects/actions.ts:210-223) wire `run-task`, args
      // {taskId} — sets the task QUEUED itself ('queued by user'), then fires
      // TaskRunner.runTask fire-and-forget (`void`), so this operation must
      // return 200 even though the site it is about to try dispatching to is
      // down — the action itself never awaits the dispatch attempt.
      const runRes = await op(HQ_URL, 'run-task', { taskId }, adminToken)
      expect(runRes.status).toBe(200)

      // TaskRunner.stepToRunning's SiteUnreachableError catch
      // (hq/src/agents/TaskRunner.ts:124-134) returns the task to QUEUED with
      // HELD_FOR_RECONNECT_REASON. siteRuntimeStore's `request` helper
      // (hq/src/sessions/siteRuntimeStore.ts:78-88) throws that error off the
      // channel registry's own in-memory connection state — no network wait —
      // so this resolves fast.
      const held = await until(
        async () => {
          const row = await hqDb.task.findUnique({ where: { id: taskId } })
          return row && row.runState === 'RUN_QUEUED' && row.runStateReason === HELD_FOR_RECONNECT_REASON
            ? row
            : null
        },
        'held task to land RUN_QUEUED with the held-for-reconnect reason',
        20_000,
      )
      expect(held.runState).toBe('RUN_QUEUED')
      expect(held.runStateReason).toBe(HELD_FOR_RECONNECT_REASON)

      // Leaves the site stopped on purpose — the next `it` (K7) needs the
      // same outage window to probe the chat-dispatch side of SC-340, and
      // the `it` after that is the one that calls startSite() again.
    },
    60_000,
  )

  // K7 — SC-340's other half: a CHAT dispatch attempted during the same
  // outage the previous `it` left in place, not just a task one. Read
  // triggerAgentRun (hq/src/sessions/actions.ts:233-271) directly to answer
  // an open question before writing this:
  //
  // Does an ARCHIVED session refuse dispatch? No — triggerAgentRun only
  // checks the session exists and is owned by the caller; it never inspects
  // `.status`. So 02-dispatch's own chat session (already ARCHIVED by the
  // time this suite runs — see 02's last describe) is reused as-is below,
  // rather than minting a fresh one.
  //
  // Plan 5f task 7 wrapped triggerAgentRun's dispatchChatRun call in
  // rethrowSiteUnreachableAsHttp — the same mapping updateSession/
  // archiveSession/getSession already used — so this now surfaces the same
  // explicit, typed 503 the task side gets via TaskRunner's held-for-reconnect
  // path, instead of falling through to Express's `finalhandler` default (no
  // `.status`/`.statusCode` on SiteUnreachableError) and rendering an opaque
  // 500 HTML stack trace.
  it(
    'refuses a concurrent chat dispatch while the site is down with an explicit 503 naming the site',
    async () => {
      const chatSession = await hqDb.agentSession.findFirstOrThrow({
        where: { agentId },
        select: { id: true, status: true },
      })
      expect(chatSession.status).toBe('ARCHIVED')

      const chatAttempt = await fetch(`${HQ_URL}/operations/trigger-agent-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ json: { sessionId: chatSession.id, inputText: 'chat while site is down' } }),
      })
      const chatAttemptText = await chatAttempt.text()
      expect(chatAttempt.status).toBe(503)
      expect(chatAttemptText).toMatch(/is unreachable/)

      // SiteUnreachableError names the site by its ExecutionSite.label (falls
      // back to the logical siteId only if the label lookup itself fails —
      // siteRuntimeStore.ts's siteInfoForLogicalSiteId), not by siteLogicalId
      // directly, so the message-contains check reads the label from hq's own
      // registry row rather than asserting the raw id appears.
      const site = await hqDb.executionSite.findUniqueOrThrow({
        where: { siteId: siteLogicalId },
        select: { label: true },
      })
      expect(chatAttemptText).toContain(site.label)
    },
    30_000,
  )

  it(
    'drains the held task to a terminal state once the site reconnects',
    async () => {
      // D: an intermediate-state sampler. MUST start before startSite() —
      // not after the registry confirms ONLINE — and that ordering isn't
      // cosmetic, it's the whole fix. First attempt started sampling only
      // after the ONLINE `until` below resolved and observed the terminal
      // state on its very first read, every time: instrumented and traced
      // it (dev-debug), and the real timeline is that the entire
      // reconcile→drainHeldTasks→dispatch→FAILED cycle is FAST —
      // checkAgentCredentials (site/src/agents/runtime/agentCredentials.ts)
      // fails on a local filesystem stat with no real container spin-up
      // wait at all, contrary to the "takes a while to fail" comment
      // elsewhere in this suite (true for a real container attempt with a
      // hung docker pull, not for this fast local-validation failure). That
      // whole cycle routinely completes FASTER than this suite's own
      // registry-ONLINE poll (`until`, 1500ms interval) or waitForSite's
      // (2000ms interval) can even notice the reconnect — so a sampler that
      // only starts once "ONLINE" is confirmed starts strictly after the
      // transition it exists to catch has already happened. Starting here,
      // before the site even begins restarting, means the sampler is
      // already running for the entire multi-second boot + reconnect
      // window, well before drainHeldTasks can possibly fire.
      //
      // the slot claim (taskSlotClaim.ts) writes RUN_ACTIVE BEFORE the
      // dispatch attempt, and that attempt still crosses a real channel
      // round trip (capability minting, a session upsert, the WebSocket
      // request/response itself) before site's fast local check answers —
      // real but short-lived. Measured directly on this machine (task-12
      // investigation, tighter-interval debug run): RUN_ACTIVE held for only
      // ~56ms before FAILED landed, and a 100ms poll missed that window on
      // two separate full-tier runs, deterministically — not a rare flake,
      // just too coarse a grid for a ~56ms target. 10ms is what actually
      // catches it reliably (confirmed: caught on the run that measured the
      // window). With no other RUN_ACTIVE task for this (agent, project)
      // pair, runTask's claim steps a queued task straight to RUN_ACTIVE, so
      // RUN_ACTIVE is the state the assertion below looks for.
      const observedStates = new Set<string>()
      let stopSampling = false
      const samplerDone = (async () => {
        while (!stopSampling) {
          const row = await hqDb.task.findUnique({ where: { id: taskId }, select: { runState: true } })
          if (row) observedStates.add(row.runState)
          await new Promise((r) => setTimeout(r, 10))
        }
      })()

      await startSite()
      await waitForSite()

      await until(
        async () => {
          const row = await hqDb.executionSite.findUnique({
            where: { siteId: siteLogicalId },
            select: { status: true },
          })
          return row?.status === 'ONLINE' ? row : null
        },
        'hq registry to show the site ONLINE again after restart (site redial backoff 5s-60s)',
        150_000,
      )

      // onSiteConnected (hq/src/sites/channel/index.ts:47-67) fires
      // reconcileSite → drainHeldTasks → reconcileDanglingSessions in order.
      // drainHeldTasks re-runs this task through the ordinary runTask claim
      // path (RUN_QUEUED → RUN_ACTIVE → dispatch). This suite never
      // calls run-task a second time, so any transition out of the held
      // marker observed below can only be the drain, not a repeat manual
      // dispatch.
      const drained = await until(
        async () => {
          const row = await hqDb.task.findUnique({ where: { id: taskId } })
          return row && !(row.runState === 'RUN_QUEUED' && row.runStateReason === HELD_FOR_RECONNECT_REASON)
            ? row
            : null
        },
        'held task to leave the RUN_QUEUED + held-for-reconnect state once the site reconnects (drain fired)',
        60_000,
      )
      expect(drained.runStateReason).not.toBe(HELD_FOR_RECONNECT_REASON)

      // finalizeAfterRun (hq/src/agents/TaskRunner.ts:384-395) maps a
      // FAILED run.status frame to the task's run state
      // RUN_FAILED with the frame's own error. A container attempt with no
      // credential seed / no usable image takes a while to fail — generous
      // window, matching 02-dispatch's own budget for the same environment
      // invariant.
      const finished = await until(
        async () => {
          const row = await hqDb.task.findUnique({ where: { id: taskId } })
          return row && RUN_SETTLED_STATES.has(row.runState) ? row : null
        },
        'held task to have its run state settled after the drain-triggered redispatch',
        200_000,
      )
      expect(finished.runState).toBe('RUN_FAILED')
      expect(typeof finished.runStateReason).toBe('string')
      expect(finished.runStateReason!.length).toBeGreaterThan(0)

      stopSampling = true
      await samplerDone
      expect(observedStates.has('RUN_ACTIVE')).toBe(true)

      // Proves the dispatch actually crossed to site for real, not just an
      // hq-local state flip: site's own AgentRun row for this task
      // (AgentRun.taskId — site/schema.prisma:186) must exist and also be
      // terminal.
      const siteRun = await until(
        async () => {
          const row = await siteDb.agentRun.findFirst({ where: { taskId }, orderBy: { createdAt: 'desc' } })
          return row && RUN_TERMINAL_STATUSES.has(row.status) ? row : null
        },
        "site's AgentRun row for this task to reach a terminal status",
        30_000,
      )
      expect(siteRun.status).toBe('FAILED')
    },
    600_000,
  )
})
