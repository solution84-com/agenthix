import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { demoInfo, forgetDemoScriptsForTests } from '../demoInfo'
import { setDemoModeForTests } from '../demoMode'

const db = vi.hoisted(() => ({ findFirst: vi.fn() }))
vi.mock('wasp/server', () => ({ prisma: { siteConfig: { findFirst: db.findFirst } } }))
beforeEach(() => { db.findFirst.mockReset().mockResolvedValue(null) })

afterEach(() => {
  setDemoModeForTests(null)
  forgetDemoScriptsForTests()
  delete process.env.DEMO_DATA_DIR
})

describe('getDemoInfo', () => {
  it('says only that it is off with the setting off @SC-1948 @SC-1979', async () => {
    setDemoModeForTests(false)
    expect(await demoInfo()).toEqual({ on: false })
  })

  it("in demo mode, gives the next reset and each scripted agent's prompts and lines @SC-1948", async () => {
    setDemoModeForTests(true)
    process.env.DEMO_DATA_DIR = path.resolve(__dirname, '../../../../demo')
    const info = await demoInfo(new Date('2026-11-11T13:00:00Z'))
    expect(info.on).toBe(true)
    if (!info.on) return
    expect(info.nextResetAt).toBe('2026-11-11T18:00:00.000Z')
    const writer = info.agents.writer
    expect(writer.suggestedPrompts.length).toBeGreaterThan(0)
    for (const line of writer.voiceLines) expect(line).toEqual({ id: expect.any(String), text: expect.any(String), clip: expect.toBeOneOf([null, expect.any(String)]) })
    expect(writer.firstVoiceLine.text).toMatch(/demo voice/i)
    expect(writer.spokenLines).toHaveLength(4)
    expect(writer.spokenLines.filter(l => l.prefix)).toHaveLength(1)
    for (const line of writer.spokenLines) expect(line.text.length).toBeGreaterThan(0)
  })

  it('names the clip that speaks each line, and the first line @SC-1948', async () => {
    setDemoModeForTests(true)
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-info-'))
    try {
      fs.cpSync(path.resolve(__dirname, '../../../../demo'), root, { recursive: true })
      const file = path.join(root, 'agents', 'writer.json')
      const script = JSON.parse(fs.readFileSync(file, 'utf8'))
      const named = script.voiceLines[0].intent
      script.intents.find((i: { id: string }) => i.id === named).voiceClip = 'writer-one.mp3'
      script.firstVoiceLine.voiceClip = 'writer-first.mp3'
      fs.writeFileSync(file, JSON.stringify(script))
      fs.mkdirSync(path.join(root, 'voice'), { recursive: true })
      for (const clip of ['writer-one.mp3', 'writer-first.mp3']) fs.writeFileSync(path.join(root, 'voice', clip), 'x')
      process.env.DEMO_DATA_DIR = root
      const info = await demoInfo()
      if (!info.on) throw new Error('demo off')
      expect(info.agents.writer.voiceLines[0]).toMatchObject({ id: named, clip: 'writer-one.mp3' })
      expect(info.agents.writer.firstVoiceLine.clip).toBe('writer-first.mp3')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('in demo mode with no scripts to read, still answers, with no agents @SC-1948', async () => {
    setDemoModeForTests(true)
    process.env.DEMO_DATA_DIR = '/nowhere/at/all'
    const info = await demoInfo(new Date('2026-11-11T23:59:00Z'))
    expect(info).toEqual({ on: true, nextResetAt: '2026-11-12T00:00:00.000Z', lastResetAt: null, agents: {} })
  })

  it('says when the demo was last reset: when hq\'s data began, null when that cannot be read @SC-1948', async () => {
    setDemoModeForTests(true)
    process.env.DEMO_DATA_DIR = '/nowhere/at/all'
    db.findFirst.mockResolvedValue({ createdAt: new Date('2026-11-11T12:00:07Z') })
    expect(await demoInfo(new Date('2026-11-11T13:00:00Z'))).toMatchObject({ on: true, lastResetAt: '2026-11-11T12:00:07.000Z' })
    db.findFirst.mockRejectedValue(new Error('database down'))
    expect(await demoInfo(new Date('2026-11-11T13:00:00Z'))).toMatchObject({ on: true, lastResetAt: null })
  })
})
