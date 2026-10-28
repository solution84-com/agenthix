import { describe, it, expect } from 'vitest'
import { PLAIN_TEXT_LINE, acceptedPickedSkill, asPlainText, pickedSkillInstruction, pickedSkillReadInstruction, turnPrompt, withPickedSkill } from '../pickedSkill'

describe('text that starts with "/" @security-M7 @SC-1607', () => {
  it('is given after a line saying it is plain text, so no runtime reads it as a command', () => {
    for (const text of ['/init', '/compact now', '  /org-review do it', '\n/agenthix:org-review']) {
      const prompt = asPlainText(text)
      expect(prompt).toBe(`${PLAIN_TEXT_LINE}\n\n${text}`)
      expect(prompt.trimStart().startsWith('/')).toBe(false)
    }
  })

  it('is left as it is when it does not start with one', () => {
    for (const text of ['Fix the bug', 'run /init later', '']) expect(asPlainText(text)).toBe(text)
  })
})

describe('the picked skill @SC-1607', () => {
  const skill = (name: string, over: { userInvocable?: boolean; modelInvocable?: boolean } = {}) =>
    ({ name, userInvocable: true, modelInvocable: true, skillFile: `/run/skills/${name}/SKILL.md`, ...over })
  const staged = [skill('org-review'), skill('org-hidden', { userInvocable: false }), skill('org-by-hand', { modelInvocable: false })]

  it('is kept only when it names a staged skill a person may invoke', () => {
    expect(acceptedPickedSkill('org-review', staged, 'r')?.name).toBe('org-review')
    expect(acceptedPickedSkill('org-by-hand', staged, 'r')?.name).toBe('org-by-hand')
    expect(acceptedPickedSkill('org-hidden', staged, 'r')).toBeNull()
    expect(acceptedPickedSkill('org-gone', staged, 'r')).toBeNull()
    expect(acceptedPickedSkill(undefined, staged, 'r')).toBeNull()
    expect(acceptedPickedSkill('org-review', [], 'r')).toBeNull()
  })

  it('becomes one instruction before the message, the same words on both runtimes; anything else leaves the message', () => {
    expect(pickedSkillInstruction('org-review')).toBe('The person picked the skill org-review (the "/" word in their message means this skill). Load it with your skill tool first and follow it.')
    expect(withPickedSkill('Review it', 'org-review', staged, 'r')).toBe(`${pickedSkillInstruction('org-review')}\n\nReview it`)
    expect(withPickedSkill('Review it', 'org-hidden', staged, 'r')).toBe('Review it')
    expect(withPickedSkill('Review it', undefined, staged, 'r')).toBe('Review it')
  })

  it('for a skill the model may not load itself, names its staged file to read instead', () => {
    expect(pickedSkillReadInstruction('org-by-hand', '/run/skills/org-by-hand/SKILL.md')).toBe(
      'The person picked the skill org-by-hand (the "/" word in their message means this skill). Read the file /run/skills/org-by-hand/SKILL.md first and follow its instructions. ' +
      'Do not load this skill with your skill tool.')
    expect(withPickedSkill('Do it', 'org-by-hand', staged, 'r'))
      .toBe(`${pickedSkillReadInstruction('org-by-hand', '/run/skills/org-by-hand/SKILL.md')}\n\nDo it`)
  })
})

describe("a turn's prompt @SC-1607", () => {
  const staged = [{ name: 'org-review', userInvocable: true, modelInvocable: true, skillFile: '/s/org-review/SKILL.md' }]
  const turn = (over: { prompt: string; summarise?: boolean; pickedSkill?: string }) => turnPrompt({ runId: 'r', ...over }, staged)

  it('is Summarise now\'s own command as it is, and any other text never a command', () => {
    expect(turn({ prompt: '/compact', summarise: true })).toBe('/compact')
    expect(turn({ prompt: '/compact' })).toBe(`${PLAIN_TEXT_LINE}\n\n/compact`)
  })

  it('puts a kept pick before the text, still never a command', () => {
    expect(turn({ prompt: '/org-review now', pickedSkill: 'org-review' }))
      .toBe(`${pickedSkillInstruction('org-review')}\n\n${PLAIN_TEXT_LINE}\n\n/org-review now`)
  })
})
