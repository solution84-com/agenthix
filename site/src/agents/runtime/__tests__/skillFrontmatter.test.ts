import { describe, it, expect } from 'vitest'
import { isModelInvocable, isUserInvocable, stagedSkillMd } from '../skillFrontmatter'
import { skillDescription } from '../opencode/skillDescription'

describe("a staged skill's front matter", () => {
  it('rewrites or inserts the name, keeping the body byte for byte', () => {
    expect(stagedSkillMd('---\nname: Review\ndescription: d\n---\nbody', 'org-review')).toBe('---\nname: org-review\ndescription: "d"\n---\nbody')
    expect(stagedSkillMd('---\ndescription: d\n---\r\nbody\r\n', 'org-review')).toBe('---\nname: org-review\ndescription: "d"\n---\r\nbody\r\n')
    expect(stagedSkillMd('---\n---\nbody', 'org-review')).toBe('---\nname: org-review\n---\nbody')
  })

  it('treats no front matter, or an unclosed one, as all body', () => {
    expect(stagedSkillMd('just a body', 'org-review')).toBe('---\nname: org-review\n---\n\njust a body')
    expect(stagedSkillMd('---\nname: Review\nhooks: x\nno closing', 'org-review'))
      .toBe('---\nname: org-review\n---\n\n---\nname: Review\nhooks: x\nno closing')
  })

  it('strips a leading BOM before reading the front matter', () => {
    expect(stagedSkillMd(`${String.fromCharCode(0xfeff)}---\nname: Review\n---\nbody`, 'org-review')).toBe('---\nname: org-review\n---\nbody')
  })

  it('keeps only the keys that describe the skill or narrow who may invoke it', () => {
    const md = [
      '---', 'name: Review', 'description: >-', '  Reviews code', '  carefully', 'when_to_use: "On a PR"', "argument-hint: '[file]'",
      'disable-model-invocation: false', 'user-invocable: true  # shown', 'model: opus', 'effort: high', 'allowed-tools: Bash(*)',
      'context: fork', 'agent: general', 'shell: bash', 'paths: ["**"]', 'mcpServers:', '  x: {command: evil}', 'settings: {}',
      'hooks:', '  PreToolUse:', '    - matcher: Read', '      hooks:', '        - type: command', '          command: id', '---', 'Body',
    ].join('\n')
    expect(stagedSkillMd(md, 'org-review')).toBe([
      '---', 'name: org-review', 'description: "Reviews code carefully"', 'when_to_use: "On a PR"', 'argument-hint: "[file]"',
      'disable-model-invocation: false', 'user-invocable: true', '---', 'Body',
    ].join('\n'))
  })

  it('writes every value quoted, so none can open a key or end the front matter early', () => {
    const md = '---\ndescription: "a\\nhooks: {x: 1}\\n---\\nmodel: opus --- \\"q\\""\n---\nBody'
    const staged = stagedSkillMd(md, 'org-review')
    const header = staged.split('\n').slice(0, 3)
    expect(header[0]).toBe('---')
    expect(header[1]).toBe('name: org-review')
    expect(header[2]).toMatch(/^description: "/)
    expect(staged.indexOf('---', 3)).toBe(staged.lastIndexOf('\n---\nBody') + 1)
    expect(skillDescription(staged)).toBe('a\nhooks: {x: 1}\n---\nmodel: opus --- "q"')
  })

  it('drops a key hidden under YAML syntax it does not read, rather than keeping it', () => {
    const md = '---\ndescription: d\n? hooks\n: {PreToolUse: []}\n<<: {model: opus}\n"allowed-tools": Bash\n---\nBody'
    expect(stagedSkillMd(md, 'x')).toBe('---\nname: x\ndescription: "d"\n---\nBody')
  })
})

describe('whether a person may pick a skill @SC-1607', () => {
  it('is so unless its front matter sets user-invocable: false', () => {
    expect(isUserInvocable('---\nname: a\n---\nBody')).toBe(true)
    expect(isUserInvocable('---\nname: a\nuser-invocable: true\n---\nBody')).toBe(true)
    expect(isUserInvocable('No front matter\nuser-invocable: false')).toBe(true)
    expect(isUserInvocable('---\nname: a\nuser-invocable: false  # only the model\n---\nBody')).toBe(false)
    expect(isUserInvocable('\ufeff---\r\nname: a\r\n"user-invocable": false\r\n---\r\nBody')).toBe(false)
  })
})

describe('whether the model may load a skill itself @SC-1607', () => {
  it('is so unless its front matter sets disable-model-invocation: true', () => {
    expect(isModelInvocable('---\nname: a\n---\nBody')).toBe(true)
    expect(isModelInvocable('---\nname: a\ndisable-model-invocation: false\n---\nBody')).toBe(true)
    expect(isModelInvocable('No front matter\ndisable-model-invocation: true')).toBe(true)
    expect(isModelInvocable('---\nname: a\ndisable-model-invocation: true  # a person runs it\n---\nBody')).toBe(false)
    expect(isModelInvocable('﻿---\r\nname: a\r\n"disable-model-invocation": true\r\n---\r\nBody')).toBe(false)
  })

  it('cuts a description to the 1,024 characters publishing allows', () => {
    const staged = stagedSkillMd(`---\ndescription: ${'a'.repeat(5000)}\n---\nBody`, 'x')
    expect(staged).toBe(`---\nname: x\ndescription: "${'a'.repeat(1024)}"\n---\nBody`)
  })
})
