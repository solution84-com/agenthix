import { describe, expect, it } from 'vitest'
import type { FloorState } from '../../events'
import { VOICE_SETTINGS } from '../../settings'
import { floor } from '../floor'
import { playing, rig, silence, stopped } from './setup'

function setup() {
  const r = rig([floor], ['orchestration.floor'])
  const states = () => r.of('orchestration.floor').map(e => e.state)
  const last = (): FloorState => states().at(-1) ?? 'open'
  return { ...r, states, last }
}

const send = { kind: 'orchestration.send', text: 'hello there', append: false } as const
const raised = (critical = false) => ({ kind: 'orchestration.handRaise', updateId: 'u1', state: 'raised', critical }) as const

describe('the floor', () => {
  it('starts open and follows the person speaking and pausing', () => {
    const f = setup()
    f.at(100, silence(false))
    f.at(900, silence(true))
    f.at(1_000, silence(false))
    expect(f.states()).toEqual(['person-speaking', 'person-pausing', 'person-speaking'])
  })

  it('goes to agent thinking when the message is sent, then speaking when its audio plays, then open', () => {
    const f = setup()
    f.at(100, silence(false))
    f.at(900, silence(true))
    f.at(1_400, send)
    f.at(2_500, playing('r1'))
    f.at(2_550, playing('r1'))
    f.at(6_000, stopped('r1', true))
    expect(f.states()).toEqual(['person-speaking', 'person-pausing', 'agent-thinking', 'agent-speaking', 'open'])
  })

  it('is ducked while the person may be cutting in, and back to speaking on resume', () => {
    const f = setup()
    f.at(0, send)
    f.at(100, playing('r1'))
    f.at(200, silence(false))
    expect(f.last()).toBe('agent-speaking')
    f.at(210, { kind: 'orchestration.playback', action: 'duck', replyId: 'r1' })
    f.at(1_800, { kind: 'orchestration.playback', action: 'resume', replyId: 'r1' })
    expect(f.states().slice(-2)).toEqual(['ducked', 'agent-speaking'])
  })

  it('hands the floor to the person on a stop: speaking if they still are, pausing if they have stopped', () => {
    const f = setup()
    f.at(0, send)
    f.at(100, playing('r1'))
    f.at(200, silence(false))
    f.at(210, { kind: 'orchestration.playback', action: 'duck', replyId: 'r1' })
    f.at(900, { kind: 'orchestration.playback', action: 'stop', replyId: 'r1' })
    f.at(910, stopped('r1', false))
    expect(f.states().slice(-2)).toEqual(['ducked', 'person-speaking'])

    const g = setup()
    g.at(0, send)
    g.at(100, playing('r1'))
    g.at(200, silence(false))
    g.at(500, silence(true))
    g.at(900, { kind: 'orchestration.playback', action: 'stop', replyId: 'r1' })
    expect(g.last()).toBe('person-pausing')
  })

  it('goes back to the person when they speak again before the reply is heard', () => {
    const f = setup()
    f.at(0, silence(false))
    f.at(500, silence(true))
    f.at(900, send)
    f.at(1_200, silence(false))
    expect(f.states().slice(-2)).toEqual(['agent-thinking', 'person-speaking'])
    f.at(1_800, silence(true))
    f.at(2_200, { ...send, append: true })
    expect(f.last()).toBe('agent-thinking')
  })

  it('is open again when the reply ends with nothing spoken, or fails before its audio', () => {
    const f = setup()
    f.at(0, send)
    f.at(3_000, { kind: 'reply.spoken', replyId: 'r1', sentences: 0 })
    expect(f.last()).toBe('open')
    const g = setup()
    g.at(0, send)
    g.at(3_000, stopped('r1', false))
    expect(g.last()).toBe('open')
  })

  it('returns to open when a pause brings no message', () => {
    const f = setup()
    f.at(0, silence(false))
    f.at(300, silence(true))
    f.tickTo(300 + VOICE_SETTINGS.pause.capMs)
    expect(f.last()).toBe('person-pausing')
    f.tickTo(300 + VOICE_SETTINGS.pause.capMs + 1_100)
    expect(f.last()).toBe('open')
  })

  it('shows a raised hand while the floor is open, and gives the agent its turn on the invitation', () => {
    const f = setup()
    f.at(0, raised())
    expect(f.last()).toBe('hand-raised')
    f.at(500, silence(false))
    expect(f.last()).toBe('person-speaking')
    f.at(900, silence(true))
    f.at(1_300, send)
    f.at(1_500, playing('r1'))
    f.at(4_000, stopped('r1', true))
    expect(f.last()).toBe('hand-raised')
    f.at(6_000, { kind: 'orchestration.handRaise', updateId: 'u1', state: 'invited', critical: false })
    expect(f.last()).toBe('agent-thinking')
  })

  it('never takes the floor from a reply the person is waiting for', () => {
    const f = setup()
    f.at(0, send)
    f.at(100, raised())
    expect(f.last()).toBe('agent-thinking')
    f.at(200, playing('r1'))
    f.at(300, { kind: 'orchestration.handRaise', updateId: 'u1', state: 'cleared', critical: false })
    f.at(3_000, stopped('r1', true))
    expect(f.last()).toBe('open')
  })

  it('publishes only changes', () => {
    const f = setup()
    f.at(0, silence(true))
    f.at(100, silence(false))
    f.at(150, silence(false))
    expect(f.states()).toEqual(['person-speaking'])
  })
})
