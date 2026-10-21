import { describe, it, expect } from 'vitest'
import { CONNECTION_PREFIX, openCodeConnectionName, platformToolName, sessionPermissionRules, type PermissionRule } from '../openCodeConnection'

// OpenCode 1.18.32's own rules for which tools the model is shown
// (`permission/index.ts` `disabled`, `@opencode-ai/core` `Wildcard.match`),
// copied so the session rules are checked the way OpenCode applies them.
function wildcard(input: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp('^' + escaped + '$', 's').test(input)
}
function hidden(tool: string, rules: PermissionRule[]): boolean {
  const permission = ['edit', 'write', 'apply_patch'].includes(tool) ? 'edit'
    : ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'].includes(tool) ? 'read' : tool
  const rule = [...rules].reverse().find(r => wildcard(permission, r.permission))
  return rule?.pattern === '*' && rule.action === 'deny'
}
const CONFIG_RULES: PermissionRule[] = [
  { permission: '*', pattern: '*', action: 'allow' },
  { permission: 'task', pattern: '*', action: 'deny' },
  { permission: 'question', pattern: '*', action: 'deny' },
  { permission: 'skill', pattern: '*', action: 'deny' },
]

describe('a conversation\'s connection', () => {
  const a = openCodeConnectionName('11111111-2222-3333-4444-555555555555')
  const b = openCodeConnectionName('11111111-2222-3333-4444-555555555556')

  it('is short, distinct, stable, and safe as OpenCode sanitises it', () => {
    expect(a).toMatch(/^agx[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
    expect(openCodeConnectionName('11111111-2222-3333-4444-555555555555')).toBe(a)
    expect(`${a}_create_task_with_a_rather_long_name_x`.length).toBeLessThanOrEqual(64)
  })

  it('shows a session its own platform tools and no other conversation\'s', () => {
    const rules = [...CONFIG_RULES, ...sessionPermissionRules(a)]
    expect(hidden(`${a}_create_task`, rules)).toBe(false)
    expect(hidden(`${b}_create_task`, rules)).toBe(true)
    expect(hidden(`${CONNECTION_PREFIX}anything_x`, rules)).toBe(true)
  })

  it('hides task and question, and shows skill and the built-ins again', () => {
    const rules = [...CONFIG_RULES, ...sessionPermissionRules(a)]
    expect(hidden('task', rules)).toBe(true)
    expect(hidden('question', rules)).toBe(true)
    for (const tool of ['skill', 'bash', 'read', 'edit', 'write', 'glob', 'grep', 'webfetch', 'todowrite']) expect(hidden(tool, rules)).toBe(false)
  })

  it('stays final whatever another configuration source says before it', () => {
    const planted: PermissionRule[] = [{ permission: '*', pattern: '*', action: 'allow' }, { permission: 'bash', pattern: '*', action: 'deny' }]
    const rules = [...CONFIG_RULES, ...planted, ...sessionPermissionRules(a)]
    expect(hidden('task', rules)).toBe(true)
    expect(hidden(`${b}_x`, rules)).toBe(true)
    expect(hidden('bash', rules)).toBe(false)
  })

  it('hides the built-ins it is given, and nothing else', () => {
    const rules = [...CONFIG_RULES, ...sessionPermissionRules(a, ['bash', 'edit', 'webfetch'])]
    for (const tool of ['bash', 'edit', 'write', 'apply_patch', 'webfetch', 'task', 'question']) expect(hidden(tool, rules)).toBe(true)
    for (const tool of ['read', 'glob', 'grep', 'skill', 'todowrite', `${a}_create_task`, `${a}_bash`]) expect(hidden(tool, rules)).toBe(false)
    expect(hidden(`${b}_create_task`, rules)).toBe(true)
    const none = [...CONFIG_RULES, ...sessionPermissionRules(a, [])]
    expect(none).toEqual([...CONFIG_RULES, ...sessionPermissionRules(a)])
  })

  it('keeps its hidden built-ins hidden whatever another configuration source says before it', () => {
    const planted: PermissionRule[] = [{ permission: 'bash', pattern: '*', action: 'allow' }, { permission: '*', pattern: '*', action: 'allow' }]
    expect(hidden('bash', [...CONFIG_RULES, ...planted, ...sessionPermissionRules(a, ['bash'])])).toBe(true)
  })

  it('gives back a platform tool\'s own name, by the known connection name', () => {
    expect(platformToolName(`${a}_create_task`, a)).toBe('create_task')
    expect(platformToolName(`${a}_web_search`, a)).toBe('web_search')
    expect(platformToolName(`${b}_create_task`, a)).toBeNull()
    expect(platformToolName('bash', a)).toBeNull()
    expect(platformToolName(`${a}_`, a)).toBeNull()
  })
})

describe('a session with withheld platform tools', () => {
  const a = openCodeConnectionName('11111111-2222-3333-4444-555555555555')

  it('hides each by its tool id, after its own connection is allowed, and nothing else of that connection', () => {
    const rules = [...CONFIG_RULES, ...sessionPermissionRules(a, ['grep', `${a}_create_task`])]
    expect(hidden(`${a}_create_task`, rules)).toBe(true)
    expect(hidden('grep', rules)).toBe(true)
    for (const tool of [`${a}_fetch_my_queued_tasks`, `${a}_run_task`, `${a}_create_task_x`, 'read']) expect(hidden(tool, rules)).toBe(false)
  })
})
