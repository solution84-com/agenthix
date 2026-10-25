import { describe, expect, it } from 'vitest'
import { namesFor } from '../../state/namespace'
import type { InstallSecrets } from '../../state/secrets'
import { composeJson, defaultSiteProject, hqProject, imageRef, siteProject } from '../projects'
import { chooseSubnets } from '../subnets'
import type { InstallNames } from '../../state/namespace'
import type { Installation } from '../../state/installation'

const secrets: InstallSecrets = {
  hqDbPassword: 'hqdb', jwtSecret: 'jwt', hqMasterKey: 'hqkey', pairingSecret: 'p'.repeat(64),
  siteDbPassword: 'sitedb', siteMasterKey: 'sitekey', consolePairingSecret: 'm'.repeat(64),
}
const hq = { address: 'https://hq.acme.example', bind: '127.0.0.1', trustedProxies: 2, version: '0.2.0' }
const inst: Installation = { namespace: 'agenthix', ports: { hq: 7800, console: 7801 }, agentRange: '10.213.16.0/20', recordedAt: '2026-10-24T00:00:00.000Z' }
const site = { name: 'hq-box', version: '0.2.0' }
const paths = { state: '/home/sam/.agenthix' }
const any = (names: InstallNames) => chooseSubnets(names, [], [])

describe('the compose projects', () => {
  it('names images from the branding module, in the registry for a published version', () => {
    expect(imageRef('hq-server', '0.2.0')).toBe('ghcr.io/solution84-com/agenthix-hq-server:0.2.0')
    expect(imageRef('hq-server', 'dev')).toBe('agenthix-hq-server')
  })

  it('runs each image as it was pinned when its signature was checked, and never lets compose fetch one @SC-820', () => {
    const pinned = 'ghcr.io/solution84-com/agenthix-hq-web@sha256:' + 'a'.repeat(64)
    const h = hqProject(namesFor('agenthix'), { ...hq, images: { 'hq-web': pinned } }, secrets, 'hq-box', any(namesFor('agenthix')), inst)
    expect(h.services['hq-web'].image).toBe(pinned)
    const s = defaultSiteProject(namesFor('agenthix'), { ...site, images: { agent: 'x@sha256:1', executor: 'z@sha256:3', 'site-server': 'y@sha256:2' } }, secrets, paths, any(namesFor('agenthix')), inst)
    expect(s.services.site.image).toBe('y@sha256:2')
    expect(s.services.site.environment.AGENT_IMAGE).toBe('x@sha256:1')
    expect(s.services.site.environment.EXECUTOR_IMAGE).toBe('z@sha256:3')
    for (const service of [...Object.values(h.services), ...Object.values(s.services)]) expect(service.pull_policy).toBe('never')
    expect(h.services['hq-db'].image).toMatch(/^postgres:16-alpine@sha256:[0-9a-f]{64}$/)
  })

  it('gives hq-server and the site the version they run as, which a published image no longer carries, and none for a development build @SC-1257', () => {
    const n = namesFor('agenthix')
    expect(hqProject(n, hq, secrets, 'hq-box', any(n), inst).services['hq-server'].environment).toHaveProperty('APP_VERSION', '0.2.0')
    expect(defaultSiteProject(n, site, secrets, paths, any(n), inst).services.site.environment).toHaveProperty('APP_VERSION', '0.2.0')
    expect(hqProject(n, { ...hq, version: 'dev' }, secrets, 'hq-box', any(n), inst).services['hq-server'].environment).not.toHaveProperty('APP_VERSION')
    expect(defaultSiteProject(n, { ...site, version: 'dev' }, secrets, paths, any(n), inst).services.site.environment).not.toHaveProperty('APP_VERSION')
  })

  it('labels every container of a release part with the version it runs as, never a database, and none for a development build @SC-1257', () => {
    const n = namesFor('agenthix')
    const containers = (version: string) => {
      const h = hqProject(n, { ...hq, version }, secrets, 'hq-box', any(n), inst)
      const s = defaultSiteProject(n, { ...site, version }, secrets, paths, any(n), inst)
      return [...Object.entries(h.services), ...Object.entries(s.services)]
    }
    for (const [name, service] of containers('0.2.0')) {
      if (name.endsWith('-db')) expect(service.labels).not.toHaveProperty('agenthix.version')
      else expect(service.labels).toMatchObject({ 'agenthix.version': '0.2.0', 'agenthix.managed-by': 'host' })
    }
    for (const [, service] of containers('dev')) expect(service.labels).not.toHaveProperty('agenthix.version')
    const acme = namesFor('acme')
    expect(hqProject(acme, hq, secrets, 'hq-box', any(acme), inst).services['hq-server'].labels).toHaveProperty('acme.version', '0.2.0')
  })

  it("tells HQ its machine's name, which HQ names its own site after @SC-870", () => {
    expect(hqProject(namesFor('agenthix'), hq, secrets, 'hq-box', any(namesFor('agenthix')), inst).services['hq-server'].environment.HQ_MACHINE_NAME).toBe('hq-box')
  })

  it('tells HQ when Agenthix Cloud runs its machine, and which Cloud, and nothing of it otherwise @SC-1123', () => {
    const cloud = { url: 'https://cloud.staging.example', machineId: 'm-1', enrolmentCodeFile: '/etc/agenthix/code' }
    const on = hqProject(namesFor('agenthix'), hq, secrets, 'hq-box', any(namesFor('agenthix')), inst, cloud).services['hq-server'].environment
    expect(on).toMatchObject({ HQ_RUN_BY_CLOUD: 'true', CLOUD_URL: 'https://cloud.staging.example' })
    expect(JSON.stringify(on)).not.toContain('/etc/agenthix/code')
    const off = hqProject(namesFor('agenthix'), hq, secrets, 'hq-box', any(namesFor('agenthix')), inst, null).services['hq-server'].environment
    expect(off).not.toHaveProperty('HQ_RUN_BY_CLOUD')
    expect(off).not.toHaveProperty('CLOUD_URL')
  })

  it('gives hq-web HQ’s address, which its browser app takes when it starts @SC-819', () => {
    expect(hqProject(namesFor('agenthix'), hq, secrets, 'hq-box', any(namesFor('agenthix')), inst).services['hq-web'].environment.HQ_URL).toBe('https://hq.acme.example')
  })

  it('derives every stored name from the recorded namespace, not the product name @SC-821 @SC-1155', () => {
    const json = composeJson(hqProject(namesFor('acme'), hq, secrets, 'hq-box', any(namesFor('acme')), inst)) + composeJson(defaultSiteProject(namesFor('acme'), site, secrets, { state: '/srv/acme' }, any(namesFor('acme')), inst))
    const stored = json.replace(/agenthix-(hq-server|hq-web|site-server|agent|executor)(:[\d.]+)?/g, '')
    expect(stored).not.toMatch(/agenthix/)
    expect(json).toContain('"acme-hq-server"')
    expect(json).toContain('"acme.role": "hq"')
  })

  it('names every container, network and volume itself, so compose adds no prefix of its own', () => {
    const names = namesFor('agenthix')
    const h = hqProject(names, hq, secrets, 'hq-box', any(names), inst)
    const s = defaultSiteProject(names, site, secrets, paths, any(names), inst)
    expect(Object.values(h.services).map(v => v.container_name)).toEqual(['agenthix-hq-db', 'agenthix-hq-server', 'agenthix-hq-web'])
    expect(Object.values(s.services).map(v => v.container_name)).toEqual(['agenthix-site-db', 'agenthix-site-server'])
    expect(h.networks).toMatchObject({ internal: { name: 'agenthix-hq-internal' }, edge: { name: 'agenthix-edge' }, link: { name: 'agenthix-hq-link' } })
    expect(h.volumes).toEqual({ db_data: { name: 'agenthix-hq-db-data' }, storage: { name: 'agenthix-hq-storage' } })
    expect(s.networks).toMatchObject({ internal: { name: 'agenthix-site-internal' }, link: { name: 'agenthix-hq-link', external: true } })
    expect(s.volumes).toEqual({ db_data: { name: 'agenthix-site-db-data' }, figures: { name: 'agenthix-host-figures', external: true } })
    expect(h.services['hq-server'].environment.DATABASE_URL).toMatch(/@hq-db:5432\/agenthix_hq$/)
    expect(s.services.site.environment.DATABASE_URL).toMatch(/@site-db:5432\/agenthix_site$/)
  })

  it("tells the site the namespace, which it names its agents, their labels and their own group from @SC-821 @SC-1155", () => {
    const env = defaultSiteProject(namesFor('acme'), site, secrets, paths, any(namesFor('acme')), inst).services.site.environment
    expect(env).toMatchObject({ HOST_NAMESPACE: 'acme', SITE_CONTAINER_NAME: 'acme-site-server' })
    expect(env).not.toHaveProperty('AGENT_CONTAINER_PREFIX')
    expect(env).not.toHaveProperty('COMPOSE_PROJECT_NAME')
  })

  it("gives the site the installation's own agent slice, and writes no site without one", () => {
    const names = namesFor('agenthix')
    expect(defaultSiteProject(names, site, secrets, paths, any(names), inst).services.site.environment.AGENT_NETWORK_RANGE).toBe('10.213.16.0/20')
    expect(() => defaultSiteProject(names, site, secrets, paths, any(names), { ...inst, agentRange: null })).toThrow(/No agent address range/)
  })

  it('connects hq and its default site by the same pairing secret, over a private network', () => {
    const names = namesFor('agenthix')
    const h = hqProject(names, hq, secrets, 'hq-box', any(names), inst)
    const s = defaultSiteProject(names, site, secrets, paths, any(names), inst)
    expect(h.services['hq-server'].environment.HQ_PAIRING_SECRET).toBe(secrets.pairingSecret)
    expect(s.services.site.environment.HQ_PAIRING_SECRET).toBe(secrets.pairingSecret)
    expect(s.services.site.environment.HQ_URL).toBe('http://agenthix-hq-web:4100')
    expect(h.networks.link.name).toBe('agenthix-hq-link')
    expect(s.networks.link).toEqual({ name: 'agenthix-hq-link', external: true })
    expect(h.services['hq-web'].networks).toContain('link')
  })

  it('mounts the site’s data at the same path inside and out, under the state folder on the machine', () => {
    const s = defaultSiteProject(namesFor('agenthix'), site, secrets, paths, any(namesFor('agenthix')), inst)
    expect(s.services.site.environment.SITE_ROOT).toBe('/home/sam/.agenthix/site/data')
    expect(s.services.site.volumes).toContain('/home/sam/.agenthix/site/data:/home/sam/.agenthix/site/data')
    expect(s.services.site.volumes).toContain('figures:/run/host-figures:ro')
    expect(s.volumes.figures).toEqual({ name: 'agenthix-host-figures', external: true })
  })

  it('publishes only hq-web, where the settings say @SC-819', () => {
    const h = hqProject(namesFor('agenthix'), hq, secrets, 'hq-box', any(namesFor('agenthix')), inst)
    expect(h.services['hq-web'].ports).toEqual(['127.0.0.1:7800:4100'])
    expect('ports' in h.services['hq-server']).toBe(false)
  })

  it('escapes $ so compose does not read a value as a variable', () => {
    const json = composeJson(hqProject(namesFor('agenthix'), hq, { ...secrets, jwtSecret: 'a$b' }, 'hq-box', any(namesFor('agenthix')), inst))
    expect(json).toContain('"JWT_SECRET": "a$$b"')
  })

  it('gives every network it makes the subnet chosen for it, and none to a network another project makes @SC-1158', () => {
    const names = namesFor('acme')
    const subnets = chooseSubnets(names, [], [])
    const h = hqProject(names, hq, secrets, 'hq-box', subnets, inst, null)
    expect(h.networks).toEqual({
      internal: { name: 'acme-hq-internal', ipam: { config: [{ subnet: '10.214.1.0/24' }] } },
      edge: { name: 'acme-edge', ipam: { config: [{ subnet: '10.214.3.0/24' }] } },
      link: { name: 'acme-hq-link', ipam: { config: [{ subnet: '10.214.4.0/24' }] } },
    })
    const s = defaultSiteProject(names, site, secrets, paths, subnets, inst)
    expect(s.networks).toEqual({
      internal: { name: 'acme-site-internal', ipam: { config: [{ subnet: '10.214.2.0/24' }] } },
      link: { name: 'acme-hq-link', external: true },
    })
    const elsewhere = siteProject(names, site, secrets, paths, { hqUrl: 'https://hq.acme.example', credential: 'c', onHqLinkNetwork: false }, subnets, inst)
    expect(elsewhere.networks).toEqual({ internal: { name: 'acme-site-internal', ipam: { config: [{ subnet: '10.214.2.0/24' }] } } })
  })
})
