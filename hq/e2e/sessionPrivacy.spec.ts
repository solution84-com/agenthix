import { test, expect } from '@playwright/test'
import { signIn, sessionToken, callOperation, MEMBER, ADMIN, SERVER_URL } from './fixtures/auth'

/**
 * Conversation privacy — a conversation opened in a person's own space is readable only by the person who opened
 * it, for every role including ADMIN (ADR-0041, ADR-0096). Conversations are held in hq.
 *
 * The seeded message carries a marker string; the assertions check that the marker never reaches the other user
 * by any route, rather than only checking a status code, because a path can leak content while still returning 200.
 */

/** Sealed into the operator's conversation by seed-e2e-data.mjs. */
const PRIVATE_MARKER = 'E2E-PRIVATE-TRANSCRIPT-MARKER'

test.skip(!process.env.E2E_CONVERSATION_ID || !process.env.E2E_AGENT_ID, 'needs the operator\'s conversation: run seed-e2e-data.mjs and set E2E_CONVERSATION_ID and E2E_AGENT_ID')

test.describe('a conversation is readable only by the person who opened it @SC-278', () => {
  test('an ADMIN gets a not-found and never sees its messages', async ({ page }) => {
    const conversationId = process.env.E2E_CONVERSATION_ID!

    await signIn(page, MEMBER)
    const asOwner = await callOperation(page, 'get-conversation-messages', await sessionToken(page), { conversationId })
    expect(asOwner.status(), 'the person who opened it must be able to read it').toBe(200)
    expect(await asOwner.text()).toContain(PRIVATE_MARKER)

    // 404 rather than 403 — the response must not confirm the conversation exists.
    await signIn(page, ADMIN)
    const token = await sessionToken(page)
    for (const operation of ['get-conversation', 'get-conversation-messages', 'get-conversation-activity']) {
      const res = await callOperation(page, operation, token, { conversationId })
      expect(res.status(), `${operation}: an ADMIN must not read another person's conversation`).toBe(404)
      expect(await res.text()).not.toContain(PRIVATE_MARKER)
    }

    await page.goto(`/chat/t/${conversationId}`)
    await expect(page.locator('body')).not.toContainText(PRIVATE_MARKER, { timeout: 10_000 })
  })
})

test.describe("listings exclude another person's conversation content @SC-280", () => {
  test('no conversation list, activity or agent read leaks it to an ADMIN', async ({ page }) => {
    const conversationId = process.env.E2E_CONVERSATION_ID!

    await signIn(page, MEMBER)
    const own = await callOperation(page, 'get-conversations', await sessionToken(page), { home: 'PERSON' })
    expect(await own.text(), 'the person who opened it must find it in their own list').toContain(conversationId)

    await signIn(page, ADMIN)
    const token = await sessionToken(page)

    // Checked as a set: a regression in any one of them is the failure this guards against.
    for (const [operation, args] of [
      ['get-conversations', { home: 'PERSON' }],
      ['get-archived-conversations', { home: 'PERSON' }],
      ['get-recent-activity', undefined],
      ['get-agent-detail', { id: process.env.E2E_AGENT_ID }],
      ['get-agent-place', { agentId: process.env.E2E_AGENT_ID }],
    ] as const) {
      const res = await callOperation(page, operation, token, args)
      expect(res.status(), `${operation} must answer, or this check proves nothing`).toBe(200)
      const text = await res.text()
      expect(text, `${operation} leaked another person's conversation content`).not.toContain(PRIVATE_MARKER)
      expect(text, `${operation} listed another person's conversation`).not.toContain(conversationId)
    }
  })
})

test.describe("the live socket refuses another person's conversation room @SC-278", () => {
  test('an ADMIN subscribing to the room receives no events', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/')

    // Socket.IO serves its own browser client, so the page can load one without
    // the app bundle exposing it.
    await page.addScriptTag({ url: `${SERVER_URL}/socket.io/socket.io.js` })

    const received = await page.evaluate(async ({ conversationId, server }) => {
      const io = (window as { io?: (url: string, opts: unknown) => any }).io!
      const token = JSON.parse(localStorage.getItem('wasp:sessionId')!)
      const socket = io(server, { auth: { sessionId: token }, transports: ['websocket'] })
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => resolve())
        socket.on('connect_error', (e: Error) => reject(e))
        setTimeout(() => reject(new Error('socket connect timeout')), 8000)
      })
      const events: string[] = []
      // Every event of a conversation's room (shared/conversations/protocol.ts, CONVERSATION_SOCKET), the join's replay included.
      for (const name of [
        'message', 'messageUpdated', 'delta', 'summarise', 'replay', 'turn', 'steps', 'operation', 'operationLines',
      ]) {
        socket.on(`conversation:${name}`, () => events.push(name))
      }
      socket.emit('subscribeToConversation', conversationId)
      await new Promise((r) => setTimeout(r, 2500))
      socket.close()
      return events
    }, { conversationId: process.env.E2E_CONVERSATION_ID!, server: SERVER_URL })

    expect(received, "a non-owner must receive nothing from another person's conversation room").toEqual([])
  })
})
