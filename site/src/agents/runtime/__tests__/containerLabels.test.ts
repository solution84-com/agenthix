import { afterEach, describe, expect, it } from 'vitest'
import { composeProjectLabelArgs, containerNameFor, containerRunLabels, labelKey, resolveComposeProjectName, resolveContainerPrefix } from '../containerLabels'
import type { ContainerKey } from '../containerTypes'

const KEY: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'p1', runner: { kind: 'project', projectId: 'p1' }, mode: 'rw' }

afterEach(() => { delete process.env.HOST_NAMESPACE })

describe("the agents' names, labels and group, from the install's namespace @SC-821 @SC-1154", () => {
  it('names agents <namespace>-agent-<id>, labels them <namespace>.<key>, and puts them in <namespace>-agents', () => {
    process.env.HOST_NAMESPACE = 'acme'
    expect(containerNameFor(KEY)).toBe('acme-agent-project-p1-project-rw')
    expect(labelKey('owner')).toBe('acme.owner')
    expect(containerRunLabels(KEY, { sessionId: 's1', handle: 'coder', runtime: 'opencode', credential: null })).toContain('acme.owner=project:p1')
    expect(composeProjectLabelArgs('agent')).toEqual(['--label', 'com.docker.compose.project=acme-agents', '--label', 'com.docker.compose.service=agent'])
  })

  it("never puts the agents in the site's own group, whose upgrade would remove them as orphans", () => {
    process.env.HOST_NAMESPACE = 'agenthix'
    expect(resolveComposeProjectName()).toBe('agenthix-agents')
    expect(resolveComposeProjectName()).not.toBe('agenthix-site')
  })

  it('uses development’s own names when no host service set a namespace', () => {
    expect(resolveContainerPrefix()).toBe('agenthix-dev-agent')
    expect(resolveComposeProjectName()).toBe('agenthix-dev-agents')
    expect(labelKey('owner')).toBe('agenthix-dev.owner')
  })

  it('refuses a namespace a host service would not record', () => {
    process.env.HOST_NAMESPACE = 'Not Valid!'
    expect(() => resolveContainerPrefix()).toThrow(/HOST_NAMESPACE/)
  })
})
