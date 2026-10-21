// Dispatch round-trips over the real hq↔site channel, through a task's run: the
// task's session created when its run is dispatched and seeded on both apps, a
// run dispatched from hq and executed on site, its terminal status relayed back
// into hq's socket.io room, privacy decided from hq's own copy (never site's),
// and an explicit failure when site is unreachable.
//
// Why a task: a person's conversations are held in hq and answered there, so a
// task's session is the run a person can dispatch directly over this channel;
// a conversation's own path has its own tests.
// Runs after 01b-unregister (site added through the Fleet Console + ONLINE, not
// the default) but pairs its own default site before any dispatch test runs —
// see the top-level beforeAll below — and must leave that default site ONLINE
// for 03 — see this file's last describe block.
//
// Work with no storage of its own — including a person's FIRST
// storage, which creating a project places — resolves ONLY to hq's own
// default site (ADR-0070), never falling back to whichever other site happens
// to be registered. 01-registration/01b-unregister deliberately exercise the
// Fleet Console's path and never pair a default site, so by the time this file
// starts there is none — every real install is hq plus its own paired site
// (ADR-0070), so this suite must be too, or every test below would hit the
// 503 "No Execution Site is connected" instead of the scenarios it exists to
// exercise.
//
// Environment invariant: site's SITE_ROOT is an empty temp dir (no credential
// seed, no usable Docker image), so every dispatched run in this suite
// deterministically fails at launch — the assertions below check for a
// terminal status with a non-empty error, never a specific failure reason.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Socket } from 'socket.io-client'
import { HQ_URL } from './harness/env'
import { hqDb, siteDb } from './harness/db'
import { login, op, until, connectSocket, closeAllSockets } from './harness/hqApi'
import { stopSite, startSite, waitForSite, stopHq, startHq, waitForHq } from './harness/apps'

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

// Fixed test value, 64 hex characters (the shape of `openssl rand -hex 32`;
// same floor as 04-pairing's own PAIRING_SECRET, deliberately a different
// literal so nothing accidentally couples the two files). Only ever used
// against the harness's own test databases.
const PAIRING_SECRET = '0ff1ce00'.repeat(8)

// Pairs THIS suite's own default site before any test below runs.
//
// A plain restart-with-secret is not enough on its own: ExecutionSite.siteId
// is globally unique, and 01b-unregister leaves this same site process
// added (non-default) under the logical siteId it has carried since
// 01-registration first minted it — handing that same siteId to a
// freshly-created default row would collide. Wiping site's own SiteConfig +
// HqConnection first (exactly the "site whose database is wiped is rebuilt
// from the same secret" path 04-pairing's own third test exercises) gives the
// site a brand-new siteId with nothing else yet claiming it, and hq's own
// default row adopts that one instead. 01b's now-orphaned row is left behind,
// OFFLINE forever — a harmless, correctly-orphaned piece of registry history,
// not a bug — since nothing will ever reconnect under that abandoned id again.
//
// The org, every account, and every row 01/01b already proved stay in place —
// only site's own identity and the pairing are touched, so nothing here is a
// full reset (that remains 04-pairing's job).
beforeAll(async () => {
  await Promise.all([stopHq(), stopSite()])
  await siteDb.hqConnection.deleteMany()
  await siteDb.siteConfig.deleteMany()

  await startHq({ pairingSecret: PAIRING_SECRET })
  await waitForHq()
  await startSite({ pairingSecret: PAIRING_SECRET, hqUrl: HQ_URL })
  await waitForSite()

  await until(
    async () => hqDb.executionSite.findFirst({ where: { isDefault: true, status: 'ONLINE' } }),
    'hq to pair its own default site before the dispatch suite starts',
    180_000,
  )
}, 400_000)

type AgentRunStatusEvent = { runId: string; status: string; error?: string }

let adminToken: string
let operatorToken: string
let agentId: string
let projectId: string
let taskId: string
let sessionId: string
let adminSocket: Socket
let operatorSocket: Socket
const adminEvents: AgentRunStatusEvent[] = []
const operatorEvents: AgentRunStatusEvent[] = []

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

// A run's end settles the task's run state; RUN_FAILED is the only one this
// hermetic environment reaches, and the one run-task accepts a new run over.
async function waitForRunSettled(): Promise<void> {
  await until(
    async () => {
      const task = await hqDb.task.findUnique({ where: { id: taskId }, select: { runState: true } })
      return task?.runState === 'RUN_FAILED' ? true : null
    },
    "the task's run state to settle after its run ended",
    30_000,
  )
}

// Starts a run of the task over run-task (wire `run-task`, args `{taskId}`;
// hq/src/projects/actions.ts) and returns it as site records it. The task's
// session is the same row every time (dispatchTaskRun upserts it by taskId),
// so a new run is the one on it that was not there before.
async function startRun(): Promise<string> {
  const known = (await siteDb.agentRun.findMany({ where: { sessionId }, select: { id: true } })).map((r: { id: string }) => r.id)
  const res = await op(HQ_URL, 'run-task', { taskId }, adminToken)
  expect(res.status).toBe(200)
  const run = await until(
    async () => siteDb.agentRun.findFirst({ where: { sessionId, id: { notIn: known } } }),
    'the dispatched run to be recorded on site',
    60_000,
  )
  return run.id
}

// A container attempt with no credential seed / no usable image fails — well
// within this generous window, above the environment invariant's "eventually
// reaches FAILED" guarantee.
async function finishOnSite(runId: string) {
  return until(
    async () => {
      const run = await siteDb.agentRun.findUnique({ where: { id: runId } })
      return run && TERMINAL_STATUSES.has(run.status) ? run : null
    },
    'dispatched run to reach a terminal status on site',
    150_000,
  )
}

describe("a task's session seeds on both apps when its run is dispatched @SC-345", () => {
  it(
    "creates the task's session at its first run, with the same session id on both apps",
    async () => {
      adminToken = await login('e2e-admin', 'E2eAdmin!2026')

      // createAgent (hq/src/agents/actions.ts) minimal args: name + handle.
      // requireRole(ADMIN) — e2e-admin satisfies it.
      const createAgentRes = await op(
        HQ_URL,
        'create-agent',
        { name: 'Cross-App Dispatch Agent', handle: 'crossapp-dispatch' },
        adminToken,
      )
      expect(createAgentRes.status).toBe(200)
      expect(typeof createAgentRes.json.id).toBe('string')
      agentId = createAgentRes.json.id

      // createProject (hq/src/projects/actions.ts) with no siteId goes on hq's
      // own default site, which the top-level beforeAll paired.
      const createProjectRes = await op(
        HQ_URL,
        'create-project',
        { name: `Cross-App Dispatch ${Date.now()}` },
        adminToken,
      )
      expect(createProjectRes.status).toBe(200)
      projectId = createProjectRes.json.id

      // create-task refuses an assignee that is not on the project's roster.
      await hqDb.projectAgent.create({ data: { projectId, agentId } })
      const createTaskRes = await op(
        HQ_URL,
        'create-task',
        { projectId, title: 'Cross-App Dispatch', assignedAgentId: agentId },
        adminToken,
      )
      expect(createTaskRes.status).toBe(200)
      taskId = createTaskRes.json.id

      // A task has no session until its first run is dispatched.
      expect(await hqDb.agentSession.findUnique({ where: { taskId } })).toBeNull()

      // dispatchTaskRun (hq/src/agents/dispatchService.ts) upserts hq's own
      // copy and seeds site's with the run — a task has no createSession.
      const runRes = await op(HQ_URL, 'run-task', { taskId }, adminToken)
      expect(runRes.status).toBe(200)

      const hqRow = await until(
        async () => hqDb.agentSession.findUnique({ where: { taskId } }),
        "hq's session row to exist once the task's run is dispatched",
        60_000,
      )
      sessionId = hqRow.id
      expect(hqRow.sessionType).toBe('task')

      const siteRow = await until(
        async () => siteDb.agentSession.findUnique({ where: { id: sessionId } }),
        "site's session row, seeded by the dispatch, to exist",
        60_000,
      )
      expect(siteRow.id).toBe(hqRow.id)

      // Leave the task's run ended, so the next describe can start another.
      const firstRun = await until(
        async () => siteDb.agentRun.findFirst({ where: { sessionId } }),
        'the first run to be recorded on site',
        60_000,
      )
      await finishOnSite(firstRun.id)
      await waitForRunSettled()
    },
    300_000,
  )
})

// @SC-343 dropped: this describe only ever observes the run.status relay
// (terminal status frames reaching the socket room) — it never asserts on
// run.stream token deltas, which this hermetic environment (no real LLM
// turn, no credential seed) cannot produce at all. Full run.stream coverage
// lives in hq/src/sites/channel/__tests__/siteEventHandler.test.ts.
describe("a task's run round-trips to a terminal status over the channel @SC-337", () => {
  it(
    'dispatches a run, reaches a terminal status on site, and the terminal frame relays into the socket room',
    async () => {
      adminSocket = await connectSocket(adminToken)
      adminSocket.on('agentRunStatus', (e: AgentRunStatusEvent) => adminEvents.push(e))
      // The session room, not the task's: siteEventHandler.ts emits
      // `agentRunStatus` into `session:<sessionId>` for a task's run as for any
      // other (the task room carries stream frames and comments).
      adminSocket.emit('subscribeToSession', sessionId)
      // subscribeToSession's join is async (a project-membership DB lookup) — give it
      // time to land before the run dispatches, so the terminal frame is never
      // emitted into a room this socket hasn't joined yet. (The first run could not
      // be watched this way: the task's session did not exist until it was dispatched.)
      await sleep(1000)

      const runId = await startRun()
      const finishedRun = await finishOnSite(runId)

      // Environment invariant: FAILED is the only status this hermetic
      // environment can reach — never a specific failure reason.
      expect(finishedRun.status).toBe('FAILED')
      expect(typeof finishedRun.error).toBe('string')
      expect(finishedRun.error!.length).toBeGreaterThan(0)

      // run.status relay (siteEventHandler.ts): hq synthesizes `agentRunStatus`
      // from EVERY non-latched run.status frame, not only the terminal one.
      // runLaunch.ts sends its own non-terminal `status: 'RUNNING'` frame the
      // moment the run launches, and that relays into the room too, so the
      // FIRST `agentRunStatus` this socket sees for a given runId can
      // legitimately be 'RUNNING' — the subscribed admin socket must eventually
      // see the TERMINAL one, not just any frame naming this runId.
      const relayed = await until(
        async () => adminEvents.find((e) => e.runId === runId && TERMINAL_STATUSES.has(e.status)) ?? null,
        'a terminal agentRunStatus relayed to the subscribed admin socket',
        15_000,
      )
      expect(relayed.status).toBe(finishedRun.status)
      expect(relayed.error).toBe(finishedRun.error)

      // Session patch (writableSessionFields — siteEventHandler.ts): hq's
      // session copy is only patched when the terminal frame carries a
      // non-null `sessionPatch`, which AgentEngine.ts only builds on the
      // COMPLETED path after `runUsage` exists — the FAILED branch always sends
      // `sessionPatch: null`. That is the correct contract for a run that
      // produced no usage, not a bug — asserted here as "nothing spurious was
      // written", not "the row changed".
      const hqSessionAfter = await hqDb.agentSession.findUnique({ where: { id: sessionId } })
      expect(hqSessionAfter!.totalInputTokens).toBe(0)
      expect(hqSessionAfter!.totalOutputTokens).toBe(0)
      // A task's session is archived on both sides once its run ends (agents/taskSessionArchive.ts).
      expect(hqSessionAfter!.status).toBe('ARCHIVED')

      // Capability issuance (spec §12): the run reaching site at all already
      // proves the mint succeeded — dispatchTaskRun (hq/src/agents/dispatchService.ts)
      // mints the capability before any channel send and never dispatches if
      // minting fails. The explicit residual check is that neither the
      // capability JWT nor the plaintext provider key it travelled with ever
      // lands in site's stored row: taskExecution.ts's `dispatchBlob` persists
      // ONLY what started the run, its limits and the person it is for (an id,
      // adr-0095) onto AgentRun.metadata.dispatch (spec review, HIGH — no
      // secret at rest).
      expect(finishedRun.metadata).toMatchObject({
        type: 'task-execution',
        dispatch: { kind: 'task', startedBy: 'person' },
      })
      const dispatch = (finishedRun.metadata as { dispatch: Record<string, unknown> }).dispatch
      expect(Object.keys(dispatch).every((k) => ['kind', 'startedBy', 'runLimits', 'onBehalfOfUserId'].includes(k))).toBe(true)
      const serializedRow = JSON.stringify(finishedRun)
      expect(serializedRow).not.toMatch(/Bearer /)
      expect(serializedRow).not.toMatch(/smc_/)
      expect(serializedRow).not.toMatch(/-----BEGIN/)

      await waitForRunSettled()
    },
    300_000,
  )
})

describe("a rename on hq replicates to site (one writer per field) @SC-345", () => {
  it("propagates a title change through the channel to site's row", async () => {
    const newTitle = `Cross-App Renamed ${Date.now()}`

    // updateSession (hq/src/sessions/actions.ts) wire `update-session`
    // — a title change crosses the channel first (siteRuntimeStore.renameSession),
    // and hq's own copy is only patched once that ack lands (SC-345, the
    // one-writer-per-field rule). A task's session is changed by its project's
    // members.
    const res = await op(HQ_URL, 'update-session', { id: sessionId, title: newTitle }, adminToken)
    expect(res.status).toBe(200)
    expect(res.json.title).toBe(newTitle)

    const siteRow = await until(
      async () => {
        const row = await siteDb.agentSession.findUnique({ where: { id: sessionId } })
        return row?.title === newTitle ? row : null
      },
      "site's session row to show the renamed title",
      30_000,
    )
    expect(siteRow.title).toBe(newTitle)
  })
})

describe("a task session's privacy is decided from hq's own copy @SC-354", () => {
  it(
    'refuses a non-member reading the task session with no leak, while a member keeps receiving stream events',
    async () => {
      operatorToken = await login('e2e-operator', 'E2eOperator!2026')

      // A task's session is read by its project's members — `getActivitySession`
      // (wire `get-activity-session`, args `{sessionId}`), not the owner-only
      // `getSession` a chat's is. Membership is decided entirely from hq's own
      // copy before any site call (queries.ts), and the operator is not on
      // this project (an organisation role grants no project access).
      const asOperator = await op(HQ_URL, 'get-activity-session', { sessionId }, operatorToken)
      expect(asOperator.status).toBe(404)
      // Wasp's HttpError body is `{ message, data }` (hq/.wasp/out/server/src/app.js) —
      // no session data of any kind rides along with the refusal.
      expect(asOperator.json.message).toBe('Session not found')
      expect(asOperator.json.entries).toBeUndefined()
      expect(asOperator.json.title).toBeUndefined()
      expect(JSON.stringify(asOperator.raw)).not.toContain(sessionId)

      operatorSocket = await connectSocket(operatorToken)
      operatorSocket.on('agentRunStatus', (e: AgentRunStatusEvent) => operatorEvents.push(e))
      operatorSocket.emit('subscribeToSession', sessionId)
      // ADR-0041's join refusal is silent (socket.ts just logs and returns,
      // no error frame) — settle before dispatching so a slow join can never
      // be mistaken for "never joined".
      await sleep(1500)

      const runId2 = await startRun()
      await finishOnSite(runId2)

      await until(
        async () =>
          adminEvents.some((e) => e.runId === runId2 && TERMINAL_STATUSES.has(e.status)) ? true : null,
        "admin socket (still subscribed from the first describe block) to see this run's terminal frame",
        15_000,
      )

      // The operator's socket never joined `session:<id>` at all (denied,
      // silently) — it must see literally nothing for this session, for any
      // run dispatched in this suite so far.
      expect(operatorEvents).toHaveLength(0)

      await waitForRunSettled()
    },
    300_000,
  )
})

describe(
  'site unreachable is explicit, never silent @SC-344; archive replicates @SC-346 ' +
    '(archive of a task session only — the hard-delete cascade half of SC-346 is covered elsewhere)',
  () => {
    it(
      "returns an explicit 503 naming the site while stopped, leaves hq's copy untouched, " +
        'then reconnects and an archive replicates to site',
      async () => {
        const beforeStop = await hqDb.agentSession.findUnique({ where: { id: sessionId } })

        // E: the positive control. Proves `get-activity-session` genuinely
        // carries site-held data over the channel while site is up, so the 503
        // after stopSite() below is a real contrast — not just "this always
        // fails". getActivitySession (hq/src/sessions/queries.ts) merges the
        // session's latest run, read from site's own AgentRun table via
        // siteRuntimeStore.listRuns, onto hq's own AgentSession row; that run
        // cannot come from anywhere but site's DB.
        const lastRun = await siteDb.agentRun.findFirstOrThrow({
          where: { sessionId },
          orderBy: { createdAt: 'desc' },
        })
        const controlRead = await op(HQ_URL, 'get-activity-session', { sessionId }, adminToken)
        expect(controlRead.status).toBe(200)
        expect(controlRead.json.AgentRun).toHaveLength(1)
        expect(controlRead.json.AgentRun[0].id).toBe(lastRun.id)

        await stopSite()

        // Same read, now with the site stopped — SiteUnreachableError (hq/src/storage/workspaceStore.ts:57-71,
        // reused by siteRuntimeStore.ts) becomes an explicit 503 via
        // rethrowSiteUnreachableAsHttp, message naming the site.
        const unreachable = await op(HQ_URL, 'get-activity-session', { sessionId }, adminToken)
        expect(unreachable.status).toBe(503)
        expect(unreachable.json.message).toContain('Execution Site')
        expect(unreachable.json.message).toMatch(/is unreachable/)

        const duringOutage = await hqDb.agentSession.findUnique({ where: { id: sessionId } })
        expect(duringOutage).toEqual(beforeStop)

        await startSite()
        await waitForSite()

        await until(
          async () => {
            const row = await hqDb.executionSite.findFirst({ where: { status: 'ONLINE' } })
            return row ?? null
          },
          'hq registry to show the site ONLINE again after restart (site redial backoff 5s-60s)',
          90_000,
        )

        // archiveSession (hq/src/sessions/actions.ts:204-231) wire `archive-session`
        // — site first, then hq's own copy from the ack. Wrapped in `until`:
        // the registry can flip ONLINE a moment before the channel's own
        // per-connection registration is fully ready, so a single immediate
        // call could still race a freshly-reconnected site.
        const archived = await until(
          async () => {
            const res = await op(HQ_URL, 'archive-session', { id: sessionId }, adminToken)
            return res.status === 200 ? res.json : null
          },
          'archive-session to succeed once site has fully reconnected',
          30_000,
        )
        expect(archived.status).toBe('ARCHIVED')

        const siteArchived = await until(
          async () => {
            const row = await siteDb.agentSession.findUnique({ where: { id: sessionId } })
            return row?.status === 'ARCHIVED' ? row : null
          },
          "site's session row to show ARCHIVED",
          30_000,
        )
        expect(siteArchived.status).toBe('ARCHIVED')
      },
      300_000,
    )
  },
)

afterAll(() => {
  closeAllSockets()
})
