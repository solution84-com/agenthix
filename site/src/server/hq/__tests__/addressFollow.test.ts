/**
 * The site following hq to a new address (host-management spec §13): it switches only once the new address passes
 * the move check, keeps the old one until then, and a stranger's address learns nothing and gets nothing more.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HQ_SITE_CHANNEL_PATH, MOVE_CHECK_PATH, MOVE_PROOF_PATH, type MoveChallenge, type MoveProof } from '@agenthix/core'
import {
  answerMoveChallenge, credentialHashOf, moveTagMatches, runMoveCheck, verifyMoveProof, type MoveCheckPost,
} from '@agenthix/core/host-crypto'
import { sealed } from './testCredential'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({ link: null as Row | null }))
vi.mock('#db', () => ({
  prisma: {
    hqConnection: {
      findFirst: async () => (db.link ? { ...db.link } : null),
      updateMany: async ({ where, data }: { where?: Row; data: Row }) => {
        if (!db.link || (where && Object.entries(where).some(([k, v]) => db.link![k] !== v))) return { count: 0 }
        Object.assign(db.link, data)
        return { count: 1 }
      },
    },
  },
}))

import { AddressFollower } from '../addressFollow'

const OLD = 'http://192.168.1.20:4100'
const NEW = 'http://192.168.1.30:4100'
const CREDENTIAL = 'c'.repeat(64)

/** hq at `own`, holding this site's hash or not; every request it gets is recorded. */
function hqAt(own: string, holds: boolean) {
  const sent: { path: string; body: string }[] = []
  const nonces = new Map<string, string>()
  const post: MoveCheckPost = async (url, body) => {
    const path = new URL(url).pathname
    sent.push({ path, body })
    const hash = holds ? await credentialHashOf(CREDENTIAL) : await credentialHashOf('another site')
    if (path === MOVE_CHECK_PATH) {
      const challenge = JSON.parse(body) as MoveChallenge
      if (!(await moveTagMatches(hash, challenge))) return { status: 403, text: JSON.stringify({ v: 1, refused: 'unknown' }) }
      const answer = await answerMoveChallenge(hash, own, challenge)
      nonces.set(answer.nonce, hash)
      return { status: 200, text: JSON.stringify(answer) }
    }
    if (path === MOVE_PROOF_PATH) {
      const proof = JSON.parse(body) as MoveProof
      const ok = await verifyMoveProof(nonces.get(proof.hqNonce) ?? hash, own, proof)
      return { status: ok ? 200 : 403, text: JSON.stringify({ v: 1, ok }) }
    }
    return { status: 404, text: '' }
  }
  return { post, sent }
}

let scheduled: number[]
let reconnect: ReturnType<typeof vi.fn>

function follower(post: MoveCheckPost) {
  return new AddressFollower({
    check: o => runMoveCheck({ ...o, post }),
    reconnect: reconnect as unknown as () => Promise<void>,
    now: () => new Date('2026-10-14T09:12:00Z'),
    later: (_run, ms) => { scheduled.push(ms); return () => {} },
  })
}

beforeEach(() => {
  scheduled = []
  reconnect = vi.fn(async () => {})
  db.link = { hqUrl: OLD, hqWsUrl: `ws://192.168.1.20:4100${HQ_SITE_CHANNEL_PATH}`, connectionToken: sealed(CREDENTIAL), pairedHqUrl: OLD, movingTo: null }
  delete process.env.HQ_URL
})

describe("following hq's new address @SC-856", () => {
  it('keeps the old address while the new one does not answer, and switches once it passes the check', async () => {
    let up = false
    const real = hqAt(NEW, true)
    const f = follower(async (url, body, signal) => {
      if (!up) throw new Error('ECONNREFUSED')
      return real.post(url, body, signal)
    })

    expect(await f.take({ address: NEW })).toEqual({ taken: true })
    expect(db.link).toMatchObject({ hqUrl: OLD, movingTo: NEW })
    expect(scheduled).toHaveLength(1)

    expect(await f.tryNow()).toBe('unreachable')
    expect(db.link).toMatchObject({ hqUrl: OLD, movingTo: NEW, moveProblem: 'unreachable' })
    expect(reconnect).not.toHaveBeenCalled()
    expect(scheduled).toHaveLength(2)
    expect(scheduled[1]).toBeGreaterThan(scheduled[0])

    up = true
    expect(await f.tryNow()).toBe('passed')
    expect(db.link).toMatchObject({
      hqUrl: NEW, hqWsUrl: `ws://192.168.1.30:4100${HQ_SITE_CHANNEL_PATH}`, pairedHqUrl: OLD, movingTo: null, moveProblem: null,
    })
    expect(reconnect).toHaveBeenCalledTimes(1)
  })

  it('stays on the old address when the new one does not hold its record, and sends it nothing more', async () => {
    const stranger = hqAt(NEW, false)
    const f = follower(stranger.post)
    await f.take({ address: NEW })
    expect(await f.tryNow()).toBe('notThisHq')
    expect(db.link).toMatchObject({ hqUrl: OLD, movingTo: NEW, moveProblem: 'notThisHq' })
    expect(stranger.sent.map(s => s.path)).toEqual([MOVE_CHECK_PATH])
    expect(stranger.sent[0].body).not.toContain(CREDENTIAL)
    expect(reconnect).not.toHaveBeenCalled()
  })

  it('does not pass for a real hq answering for another address', async () => {
    const f = follower(hqAt('https://hq.acme.example', true).post)
    await f.take({ address: NEW })
    expect(await f.tryNow()).toBe('notThisHq')
    expect(db.link).toMatchObject({ hqUrl: OLD })
  })

  it('refuses an address it would send its credential to in the clear, keeping everything as it was', async () => {
    const f = follower(hqAt(NEW, true).post)
    const r = await f.take({ address: 'http://hq.acme.example' })
    expect(r.taken).toBe(false)
    expect(r.problem).toMatch(/unencrypted/)
    expect(await f.take({ address: 'not an address' })).toMatchObject({ taken: false })
    expect(db.link).toMatchObject({ hqUrl: OLD, movingTo: null })
    expect(scheduled).toEqual([])
  })

  it('stops waiting when hq says it stays where it is', async () => {
    const f = follower(hqAt(NEW, true).post)
    await f.take({ address: NEW })
    expect(await f.take({ address: `${OLD}/` })).toEqual({ taken: true })
    expect(db.link).toMatchObject({ hqUrl: OLD, movingTo: null })
    expect(await f.tryNow()).toBeNull()
  })
})
