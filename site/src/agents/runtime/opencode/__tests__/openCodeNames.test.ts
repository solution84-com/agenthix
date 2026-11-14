import { describe, it, expect } from 'vitest'
import { openCodeGateCall, openCodeHiddenBuiltins, openCodeHiddenPlatformTools, openCodePatchHeaders } from '../openCodeNames'
import { openCodeConnectionName, platformToolName } from '../openCodeConnection'

const conn = openCodeConnectionName('7f1c0f5e-2a4b-4c55-9d11-0e6a3b2c9d10')
const map = (tool: string, args: Record<string, unknown>) => openCodeGateCall(tool, args, 'call_1', conn)

describe('the platform-tool connection name', () => {
  it('is short, stable, and left alone by OpenCode\'s sanitising', () => {
    expect(conn).toMatch(/^agx[0-9a-f]{12}$/)
    expect(openCodeConnectionName('7f1c0f5e-2a4b-4c55-9d11-0e6a3b2c9d10')).toBe(conn)
    expect(openCodeConnectionName('other')).not.toBe(conn)
  })

  it('keeps every platform tool name within 64 characters', () => {
    expect(`${conn}_propose_workforce_template`.length).toBeLessThanOrEqual(64)
  })

  it('removes the prefix by the known connection name, underscores in the tool kept', () => {
    expect(platformToolName(`${conn}_create_task`, conn)).toBe('create_task')
    expect(platformToolName(`${conn}_`, conn)).toBeNull()
    expect(platformToolName('agx000000000000_create_task', conn)).toBeNull()
    expect(platformToolName('create_task', conn)).toBeNull()
  })
})

describe('OpenCode tools to the gate', () => {
  it.each([
    ['read', { filePath: '/projects/p1/files/a.ts' }, 'read_file', ['/projects/p1/files/a.ts'], 'a.ts'],
    ['write', { filePath: 'b.ts', content: 'x' }, 'write_file', ['b.ts'], 'b.ts'],
    ['edit', { filePath: 'c.ts', oldString: 'a', newString: 'b' }, 'edit_file', ['c.ts'], 'c.ts'],
    ['glob', { pattern: '**/*.ts', path: 'src' }, 'glob_files', ['src', 'src/**/*.ts'], '**/*.ts'],
    ['glob', { pattern: '*.md' }, 'glob_files', ['.', './*.md'], '*.md'],
    ['grep', { pattern: 'TODO|FIXME', include: '*.ts' }, 'grep_files', ['.'], 'TODO|FIXME'],
    ['grep', { pattern: 'x', path: '/proc' }, 'grep_files', ['/proc'], 'x'],
  ])('%s %j is %s on its paths', (tool, args, toolName, paths, target) => {
    const m = map(tool, args)
    expect(m.kind).toBe('decide')
    if (m.kind !== 'decide') return
    expect(m.call).toEqual({ toolName, input: args, toolUseId: 'call_1', target, paths })
  })

  it('judges bash on the whole command, and refuses one without a command', () => {
    const args = { command: 'cd x && rm -rf y; echo done', description: 'd' }
    const m = map('bash', args)
    expect(m.kind === 'decide' && m.call).toEqual({ toolName: 'bash', input: args, toolUseId: 'call_1', target: null })
    expect(map('bash', { command: ['rm'] })).toEqual({ kind: 'refuse', reason: 'bash needs its command as text in command.' })
  })

  it('maps webfetch to web_fetch, targeting its URL', () => {
    const m = map('webfetch', { url: 'https://example.com', format: 'text' })
    expect(m.kind === 'decide' && [m.call.toolName, m.call.target]).toEqual(['web_fetch', 'https://example.com'])
  })

  it('passes a platform tool by its own name, the connection prefix removed', () => {
    const m = map(`${conn}_web_search`, { query: 'q' })
    expect(m.kind === 'decide' && m.call).toEqual({ toolName: 'web_search', input: { query: 'q' }, toolUseId: 'call_1', target: null })
  })

  it.each(['todowrite', 'skill', 'invalid'])('gates %s as a tool every agent has', (tool) => {
    const m = map(tool, {})
    expect(m.kind === 'decide' && m.call).toEqual(expect.objectContaining({ toolName: tool, permissionFree: true }))
  })

  it.each(['websearch', 'task', 'question', 'lsp', 'plan', 'execute', 'agx000000000000_create_task', 'Read', 'something'])(
    'refuses %s, which the gate does not know', (tool) => {
      expect(map(tool, {})).toEqual({ kind: 'refuse', reason: `${tool} is not available in Agenthix agent runs.` })
    })
})

describe('apply_patch', () => {
  const patch = [
    '*** Begin Patch',
    '*** Update File: src/a.ts',
    '*** Move to: src/b.ts',
    '@@',
    '-old',
    '+new',
    '*** Delete File: gone.ts',
    '*** Add File: /projects/p1/files/new.ts',
    '+content',
    '  *** Update File: indented.ts',
    '*** Update File: src/a.ts',
    '*** End Patch',
  ].join('\n')

  it('finds every file header, indented ones too', () => {
    expect(openCodePatchHeaders(patch).map(h => h.path)).toEqual(['src/a.ts', 'src/b.ts', 'gone.ts', '/projects/p1/files/new.ts', 'indented.ts', 'src/a.ts'])
  })

  it('is edit_file on every path, and needs write_file too when it adds, deletes or moves a file', () => {
    const m = map('apply_patch', { patchText: patch })
    expect(m.kind === 'decide' && m.call).toEqual(expect.objectContaining({
      toolName: 'edit_file',
      paths: ['src/a.ts', 'src/b.ts', 'gone.ts', '.', '/projects/p1/files/new.ts', 'indented.ts'],
      alsoRequires: ['write_file'],
    }))
    const update = map('apply_patch', { patchText: '*** Begin Patch\n*** Update File: a.ts\n@@\n-a\n+b\n*** End Patch' })
    expect(update.kind === 'decide' && update.call.alsoRequires).toBeUndefined()
  })

  it('refuses a patch that is not text', () => {
    expect(map('apply_patch', { patchText: 5 })).toEqual({ kind: 'refuse', reason: 'apply_patch needs its patch as text in patchText.' })
  })

  it('writes the real paths into the headers OpenCode reads, keeping a carriage return', () => {
    const text = '*** Begin Patch\r\n*** Update File: link.ts\r\n@@\r\n-a\r\n+b\r\n*** End Patch'
    const m = map('apply_patch', { patchText: text })
    if (m.kind !== 'decide') throw new Error('expected a decision')
    expect(m.withRealPaths({ 'link.ts': '/projects/p1/files/real.ts' })).toEqual({
      patchText: '*** Begin Patch\r\n*** Update File: /projects/p1/files/real.ts\r\n@@\r\n-a\r\n+b\r\n*** End Patch',
    })
    expect(m.withRealPaths({})).toBeNull()
  })

  it("gives a deleted file only its folder's real path, as OpenCode removes the entry itself and never what a link leads to", () => {
    const text = '*** Begin Patch\n*** Delete File: sub/link.ts\n*** Delete File: plain.ts\n*** End Patch'
    const m = map('apply_patch', { patchText: text })
    if (m.kind !== 'decide') throw new Error('expected a decision')
    expect(m.call.paths).toEqual(['sub/link.ts', 'sub', 'plain.ts', '.'])
    expect(m.withRealPaths({ 'sub/link.ts': '/projects/p1/files/target.ts' })).toBeNull()
    expect(m.withRealPaths({ 'sub/link.ts': '/projects/p1/files/real/target.ts', sub: '/projects/p1/files/real' })).toEqual({
      patchText: '*** Begin Patch\n*** Delete File: /projects/p1/files/real/link.ts\n*** Delete File: plain.ts\n*** End Patch',
    })
  })
})

describe('the arguments with real paths', () => {
  it('replaces only the path the tool opens', () => {
    const read = map('read', { filePath: 'link', offset: 3 })
    const grep = map('grep', { pattern: 'x', path: 'd' })
    const glob = map('glob', { pattern: 'd/**', path: '.' })
    if (read.kind !== 'decide' || grep.kind !== 'decide' || glob.kind !== 'decide') throw new Error('expected decisions')
    expect(read.withRealPaths({ link: '/projects/p1/files/real' })).toEqual({ filePath: '/projects/p1/files/real', offset: 3 })
    expect(grep.withRealPaths({ d: '/projects/p1/files/src' })).toEqual({ pattern: 'x', path: '/projects/p1/files/src' })
    expect(glob.withRealPaths({ './d/**': '/projects/p1/files/src/**' })).toBeNull()
    expect(read.withRealPaths({})).toBeNull()
  })
})

describe('the built-ins a session hides', () => {
  const restricted = (states: Record<string, 'always' | 'ask' | 'never'>) => ({
    bypassed: false,
    allowedTools: Object.entries(states).map(([name, state]) => ({ name, state })),
    approvedManifest: { tools: [], bashPatterns: [], approvedAt: 't' },
  })

  it('names each never-state built-in by its OpenCode permission', () => {
    expect(openCodeHiddenBuiltins(restricted({
      bash: 'never', read_file: 'never', glob_files: 'never', grep_files: 'never', web_fetch: 'never', edit_file: 'always', write_file: 'ask',
    }))).toEqual(['bash', 'glob', 'grep', 'read', 'webfetch'])
  })

  it('hides edit, write and apply_patch, which share one permission, only when both file-changing tools are never', () => {
    expect(openCodeHiddenBuiltins(restricted({ edit_file: 'never', write_file: 'never' }))).toEqual(['edit'])
    expect(openCodeHiddenBuiltins(restricted({ edit_file: 'never', write_file: 'always' }))).toEqual([])
    expect(openCodeHiddenBuiltins(restricted({ edit_file: 'ask', write_file: 'never' }))).toEqual([])
  })

  it('hides nothing for ask, always, a platform tool, or a bypassed agent', () => {
    expect(openCodeHiddenBuiltins(restricted({ bash: 'ask', read_file: 'always', create_task: 'never', web_search: 'never' }))).toEqual([])
    expect(openCodeHiddenBuiltins({ bypassed: true, allowedTools: undefined })).toEqual([])
    expect(openCodeHiddenBuiltins({ bypassed: true, allowedTools: [{ name: 'bash', state: 'never' }] })).toEqual([])
  })
})

describe('the tools a session hides in a run with no manifest', () => {
  const unattended = (states: Record<string, 'always' | 'ask' | 'never'>, patterns: { pattern: string; state: 'always' | 'ask' | 'never' }[] = []) => ({
    bypassed: false,
    allowedTools: Object.entries(states).map(([name, state]) => ({ name, state })),
    allowedBashPatterns: patterns,
  })

  it('hides ask-state built-ins, and those missing from the permissions, as never ones', () => {
    expect(openCodeHiddenBuiltins(unattended({ read_file: 'always', glob_files: 'ask', bash: 'never' }))).toEqual(['bash', 'edit', 'glob', 'grep', 'webfetch'])
  })

  it('hides the edit group only when both file-changing tools are withheld', () => {
    const always = { read_file: 'always', glob_files: 'always', grep_files: 'always', web_fetch: 'always', bash: 'never' } as const
    expect(openCodeHiddenBuiltins(unattended({ ...always, edit_file: 'ask', write_file: 'always' }))).toEqual(['bash'])
    expect(openCodeHiddenBuiltins(unattended({ ...always, edit_file: 'ask', write_file: 'never' }))).toEqual(['bash', 'edit'])
  })

  it('keeps bash while an always pattern lets some command run, whether bash is always or ask', () => {
    const tools = { read_file: 'always', glob_files: 'always', grep_files: 'always', web_fetch: 'always', edit_file: 'always', write_file: 'always' } as const
    expect(openCodeHiddenBuiltins(unattended({ ...tools, bash: 'ask' }, [{ pattern: 'git', state: 'always' }]))).toEqual([])
    expect(openCodeHiddenBuiltins(unattended({ ...tools, bash: 'always' }, [{ pattern: 'git', state: 'always' }]))).toEqual([])
    expect(openCodeHiddenBuiltins(unattended({ ...tools, bash: 'ask' }, [{ pattern: 'npm', state: 'ask' }]))).toEqual(['bash'])
  })

  it('keeps bash while bash is always, since any other command runs', () => {
    const tools = { read_file: 'always', glob_files: 'always', grep_files: 'always', web_fetch: 'always', edit_file: 'always', write_file: 'always' } as const
    expect(openCodeHiddenBuiltins(unattended({ ...tools, bash: 'always' }, [{ pattern: 'npm', state: 'ask' }]))).toEqual([])
  })

  it('hides ask-state platform tools, missing ones included, by their tool id on the connection', () => {
    const hidden = openCodeHiddenPlatformTools(unattended({ fetch_my_queued_tasks: 'always', run_task: 'always', create_task: 'ask', web_search: 'ask', create_project: 'never' }), conn)
    expect(hidden).toContain(`${conn}_create_task`)
    expect(hidden).toContain(`${conn}_web_search`)
    expect(hidden).toContain(`${conn}_list_tasks`)
    expect(hidden).not.toContain(`${conn}_fetch_my_queued_tasks`)
    expect(hidden).not.toContain(`${conn}_run_task`)
    expect(hidden).not.toContain(`${conn}_create_project`)
  })

  it('hides no platform tool in a run with a manifest, or for a bypassed agent, when the org has a search key', () => {
    const webSearchKey = 'exa-key'
    expect(openCodeHiddenPlatformTools({ ...unattended({ create_task: 'ask' }), approvedManifest: { tools: [], bashPatterns: [], approvedAt: 't' }, webSearchKey }, conn)).toEqual([])
    expect(openCodeHiddenPlatformTools({ bypassed: true, allowedTools: undefined, webSearchKey }, conn)).toEqual([])
    expect(openCodeHiddenBuiltins({ bypassed: true, allowedTools: undefined })).toEqual([])
  })

  it('hides web_search from a turn with no search key, whatever the agent may use, and lists it with one @SC-2155', () => {
    expect(openCodeHiddenPlatformTools({ bypassed: true, allowedTools: undefined }, conn)).toEqual([`${conn}_web_search`])
    expect(openCodeHiddenPlatformTools({ bypassed: true, allowedTools: undefined, webSearchKey: 'exa-key' }, conn)).not.toContain(`${conn}_web_search`)
    const askOnly = openCodeHiddenPlatformTools(unattended({ web_search: 'ask' }), conn)
    expect(askOnly.filter(t => t === `${conn}_web_search`)).toHaveLength(1)
  })
})
