import type { AiProviderVendor, UsagePurpose } from '@prisma/client'
import { idFor } from '@agenthix/core'
import { DEMO_PROVIDER_KEY, NEVER_CHECKED, type SeedContext } from './types'

/**
 * The providers, the default models, the billing profiles and a month of usage, so Providers, Models, Billing profiles
 * and Usage have something to show. Every key is the fake one, marked working and dated so hq's hourly check never
 * falls due: no vendor is ever reached, and no run or conversation in the demo uses a provider at all.
 */
export async function seedModels(c: SeedContext): Promise<void> {
  const { db, ids } = c
  const l = c.seed.library
  const providers: Record<string, { id: string; name: string }> = {}
  for (const p of l.providers) {
    const row = await db.aiProvider.create({
      data: {
        name: p.name, vendor: p.vendor as AiProviderVendor, credentialKind: 'api_key', baseUrl: null, secret: c.deps.seal(DEMO_PROVIDER_KEY),
        keyHint: DEMO_PROVIDER_KEY.slice(-4), state: 'works', lastCheckedAt: NEVER_CHECKED, lastWorkedAt: c.deps.now,
      },
    })
    providers[p.key] = { id: row.id, name: row.name }
  }
  const provider = (key: string) => providers[key] ?? (() => { throw new Error(`The demo seed names a provider ${key} that it does not hold.`) })()
  const d = l.defaults
  await db.org.updateMany({
    data: {
      defaultConversationProviderId: provider(d.conversation.provider).id, defaultConversationModel: d.conversation.model,
      defaultSttProviderId: provider(d.stt.provider).id, defaultSttModel: d.stt.model,
      defaultTtsProviderId: provider(d.tts.provider).id, defaultTtsModel: d.tts.model, defaultTtsVoice: d.tts.voice,
    },
  })

  const orgName = c.seed.organisation.org.name
  const profiles: Record<string, string> = {}
  for (const b of l.billingProfiles) {
    const row = await db.billingProfile.create({ data: { name: b.name ?? orgName, isDefault: b.isDefault, createdById: idFor(ids.people, b.createdBy, 'person') } })
    profiles[b.key] = row.id
  }
  for (const p of c.seed.organisation.projects) {
    if (p.billingProfile) await db.project.update({ where: { id: p.id }, data: { billingProfileId: profiles[p.billingProfile] } })
  }
  const defaultProfile = l.billingProfiles.find(b => b.isDefault)!.key

  let n = 0
  for (const u of l.usage) {
    n += 1
    const project = c.seed.organisation.projects.find(p => p.key === u.project)!
    await db.usageEntry.create({
      data: {
        at: new Date(c.deps.now.getTime() - n * 7 * 60_000), kind: 'CALL', callId: `demo-call-${n}`, purpose: u.purpose as UsagePurpose,
        providerId: provider(u.provider).id, providerName: provider(u.provider).name, model: u.model,
        inputTokens: u.inputTokens, outputTokens: u.outputTokens,
        amountMicros: u.costMicros === null ? null : BigInt(u.costMicros), currency: u.costMicros === null ? null : 'USD', basis: u.basis,
        priceRef: u.costMicros === null ? null : 'hq:demo',
        billingProfileId: profiles[project.billingProfile ?? defaultProfile],
        projectId: project.id, agentId: idFor(ids.agents, u.agent, 'agent'), userId: idFor(ids.people, u.person, 'person'),
      },
    })
  }
}
