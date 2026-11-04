import { describe, it, expect } from 'vitest'
import { REDACTED, isSecretKey, redactText } from '../redact.js'
import { makeLogLine, serializeLogLine } from '../logLine.js'

const SECRETS = {
  anthropicKey: 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcdEFGH',
  claudeLogin: 'sk-ant-oat01-ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210-zyx',
  claudeRefresh: 'sk-ant-ort01-QwErTyUiOpAsDfGhJkLzXcVbNm1234567890',
  openAiKey: 'sk-proj-1234567890abcdefghijABCDEFGHIJ',
  openRouterKey: 'sk-or-v1-0123456789abcdef0123456789abcdef',
  githubInstallation: 'ghs_16C7e42F292c6912E7710c838347Ae178B4a',
  githubPersonal: 'ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
  githubFineGrained: 'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz',
  machineCredential: 'smc_1a2b3c4d_0011223344556677889900aabbccddeeff00112233445566',
  hostLinkCredential: 'hmc_1a2b3c4d_0011223344556677889900aabbccddeeff00112233445566',
  consoleLinkCredential: 'fcc_1a2b3c4d_0011223344556677889900aabbccddeeff00112233445566',
  connectionToken: 'ahx_conn_Q2xhdWRlIGlzIG5vdCBhIHNlY3JldCBidXQgdGhpcyBpcw',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJydW4tMSIsImF1ZCI6InNpdGUifQ.c2lnbmF0dXJlLWJ5dGVz',
  googleKey: 'AIzaSyA-1234567890abcdefghijklmnopqrstu',
}

function leaks(text: string): string[] {
  return Object.entries(SECRETS).filter(([, v]) => text.includes(v)).map(([k]) => k)
}

describe('redactText: the shapes of every credential the codebase carries @SC-761', () => {
  for (const [kind, secret] of Object.entries(SECRETS)) {
    it(`removes ${kind}, alone and inside a sentence`, () => {
      expect(redactText(secret)).not.toContain(secret)
      const out = redactText(`run 3f9a failed: the provider said ${secret} is not valid.`)
      expect(out).not.toContain(secret)
      expect(out).toContain('run 3f9a failed: the provider said')
      expect(out).toContain(REDACTED)
    })
  }

  it('removes a URL userinfo, keeping the host', () => {
    const out = redactText(`fatal: unable to access 'https://x-access-token:${SECRETS.githubInstallation}@github.com/acme/web.git/'`)
    expect(leaks(out)).toEqual([])
    expect(out).toContain('github.com/acme/web.git')
    expect(redactText('postgres://agenthix:hunter2@localhost:4109/agenthix')).toBe(`postgres://${REDACTED}@localhost:4109/agenthix`)
  })

  it('removes an Authorization header of either scheme', () => {
    expect(redactText('Authorization: Bearer abc.def-ghi_jkl')).not.toContain('abc.def-ghi_jkl')
    expect(redactText('sent Basic dXNlcjpwYXNzd29yZA== to the proxy')).not.toContain('dXNlcjpwYXNzd29yZA==')
  })

  it('removes a private key block', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0abc\n-----END RSA PRIVATE KEY-----'
    expect(redactText(`the app key is ${pem} and more`)).toBe(`the app key is ${REDACTED} and more`)
  })

  it('removes a value by its name, quoted or not, in env, JSON, query and header form', () => {
    const cases = [
      'HQ_DB_PASSWORD=correct-horse-battery',
      'SECRETS_MASTER_KEY=bWFzdGVyIGtleSBieXRlcw==',
      '{"apiKey":"plain-looking-value","model":"opus"}',
      "{ password: 'two words here' }",
      'GET /callback?code=1&access_token=opaque123&state=x',
      'x-api-key: opaque-value-456',
      'refresh_token = opaque789',
      'cookie: sessionid=abc; other=1',
      'client_secret: shhh',
      'credential=whatever',
    ]
    for (const c of cases) {
      const out = redactText(c)
      for (const value of ['correct-horse-battery', 'bWFzdGVyIGtleSBieXRlcw==', 'plain-looking-value', 'two words here', 'opaque123', 'opaque-value-456', 'opaque789', 'sessionid=abc', 'shhh', 'whatever']) {
        expect(out, c).not.toContain(value)
      }
    }
    expect(redactText('{"apiKey":"plain-looking-value","model":"opus"}')).toContain('"model":"opus"')
  })

  it('removes a value in the forms the plain name rule used to leave part of', () => {
    const cases: [string, string][] = [
      ['{\\"password\\":\\"hunter2hunter2\\",\\"model\\":\\"opus\\"}', 'hunter2hunter2'],
      ['"password":"ab\\"cdSECRET","model":"opus"', 'cdSECRET'],
      ['Cookie: a=1; session=SECRETCOOKIE', 'SECRETCOOKIE'],
      ['Cookie: a=1; session=SECRETCOOKIE', 'a=1'],
      ['Set-Cookie: sid=SECRETCOOKIE; Path=/; HttpOnly', 'HttpOnly'],
      ['Authorization: Digest username="u", response="SECRETDIGEST"', 'SECRETDIGEST'],
      ['Authorization: Token SECRETTOKEN', 'SECRETTOKEN'],
    ]
    for (const [text, secret] of cases) expect(redactText(text), text).not.toContain(secret)
    expect(redactText('{\\"password\\":\\"hunter2hunter2\\",\\"model\\":\\"opus\\"}')).toContain('model')
    expect(redactText('"password":"ab\\"cdSECRET","model":"opus"')).toContain('"model":"opus"')
  })

  it('keeps what is not a secret: ids, counts, project keys, hosts and ordinary words', () => {
    const line = 'run a81e09bb-02c4-4f8e-9c1a-5d2b7e0f3a91 used totalInputTokens=1200 maxTokens: 4000 on key WEB-41 at https://github.com/acme/web'
    expect(redactText(line)).toBe(line)
    expect(redactText('the token expired; a new one was asked for')).toBe('the token expired; a new one was asked for')
  })

  it('takes several secrets out of one line', () => {
    const all = Object.values(SECRETS).join(' and ')
    expect(leaks(redactText(all))).toEqual([])
  })
})

describe('isSecretKey @SC-761', () => {
  it('names the keys that hold secrets', () => {
    for (const k of ['apiKey', 'api_key', 'API_KEY', 'password', 'HQ_DB_PASSWORD', 'accessToken', 'refresh_token', 'x-access-token', 'authorization', 'cookie', 'clientSecret', 'credential', 'credentials', 'privateKey', 'SECRETS_MASTER_KEY']) {
      expect(isSecretKey(k), k).toBe(true)
    }
  })
  it('leaves counts and ids alone', () => {
    for (const k of ['tokens', 'totalInputTokens', 'maxTokens', 'runId', 'credentialPrefix', 'key', 'projectKey', 'message']) {
      expect(isSecretKey(k), k).toBe(false)
    }
  })
})

describe('a log line never holds a secret, wherever it was put @SC-761', () => {
  it('in the message, in fields by name and by shape, in an error, nested and in arrays', () => {
    const err = new Error(`provider refused ${SECRETS.anthropicKey}`)
    const line = makeLogLine('error', 'dispatch', `run failed with ${SECRETS.claudeLogin}`, [
      err,
      {
        runId: 'r-1',
        credential: { kind: 'subscription', token: SECRETS.claudeRefresh },
        headers: { authorization: `Bearer ${SECRETS.jwt}` },
        url: `https://x-access-token:${SECRETS.githubInstallation}@github.com/acme/web.git`,
        list: [SECRETS.openAiKey, { nested: { deeper: SECRETS.openRouterKey } }],
        apiKey: 'anything at all',
      },
      `stray ${SECRETS.machineCredential}`,
    ])
    const written = serializeLogLine(line)
    expect(leaks(written)).toEqual([])
    expect(written).not.toContain('anything at all')
    expect(line.fields?.runId).toBe('r-1')
  })

  it('in an error cause, and survives a circular object', () => {
    const cause = new Error(`inner ${SECRETS.githubPersonal}`)
    const outer = Object.assign(new Error('outer'), { cause })
    const loop: Record<string, unknown> = { name: 'loop' }
    loop.self = loop
    const line = makeLogLine('warn', 'github', 'push refused', [outer, loop])
    expect(leaks(serializeLogLine(line))).toEqual([])
    expect(serializeLogLine(line)).toContain('[circular]')
  })
})

describe('sanitizeLogLine: a line from a site is checked and redacted again @SC-761', () => {
  it('removes what the sender left in, and refuses what is not a line', async () => {
    const { sanitizeLogLine } = await import('../logLine.js')
    const line = sanitizeLogLine({ at: '2026-10-10T10:00:00.000Z', level: 'error', source: 'x', message: `key ${SECRETS.openAiKey}`, fields: { password: 'p', note: SECRETS.jwt } })
    expect(line && leaks(JSON.stringify(line))).toEqual([])
    expect(line?.fields?.password).toBe(REDACTED)
    expect(sanitizeLogLine({ level: 'error', message: 'no date' })).toBeNull()
    expect(sanitizeLogLine({ at: '2026-10-10T10:00:00.000Z', level: 'debug', source: 's', message: 'm' })).toBeNull()
    expect(sanitizeLogLine('not json')).toBeNull()
  })
})

describe('a log line takes no secret in a key, and has a size cap @SC-761', () => {
  it('removes a token used as an object key, or as a Map key', () => {
    const token = SECRETS.githubPersonal
    const line = makeLogLine('info', 'x', 'm', [{ held: { [token]: 1 }, byToken: new Map([[token, 2]]) }])
    expect(serializeLogLine(line)).not.toContain(token)
  })

  it('keeps the message and says so when the fields are too large', () => {
    const big: Record<string, Record<string, string>> = {}
    for (let i = 0; i < 50; i++) big[`k${i}`] = Object.fromEntries(Array.from({ length: 50 }, (_, j) => [`f${j}`, 'x'.repeat(2000)]))
    const line = makeLogLine('info', 'x', 'kept', [big])
    expect(line.message).toBe('kept')
    expect(serializeLogLine(line).length).toBeLessThan(70_000)
    expect(Object.keys(line.fields ?? {})).toEqual(['cut'])
  })
})
