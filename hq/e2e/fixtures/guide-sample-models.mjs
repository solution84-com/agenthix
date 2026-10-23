// The sample organisation's providers, its default models, its billing profiles and a month of usage, so Providers,
// Models, Billing profiles and Usage in the admin area have something to show. The keys are obviously fake, stored
// encrypted as HQ stores one and dated so that HQ never checks them with a vendor (fake-providers.mjs). Usage is dated
// this month in the organisation's time zone, as the server's clock sees it, since the Usage page opens on that month;
// the capture helper rewrites the month's name to the sample's.
import { addFakeProvider } from './fake-providers.mjs'

const PROVIDERS = [
  { key: 'anthropic', vendor: 'anthropic', name: 'Anthropic' },
  { key: 'openrouter', vendor: 'openrouter', name: 'OpenRouter' },
  { key: 'stt', vendor: 'assemblyai', name: 'AssemblyAI' },
  { key: 'tts', vendor: 'inworld', name: 'Inworld' },
]

// [project, agent, person, purpose, provider, model, input tokens, output tokens, cost in millionths of a dollar, basis]
const USAGE = [
  ['WEB', 'writer', 'priya', 'conversation', 'anthropic', 'claude-opus-4-8', 41_200, 6_300, 1_940_000, 'ESTIMATED'],
  ['WEB', 'writer', 'sam', 'worker', 'anthropic', 'claude-haiku-4-5', 88_000, 12_400, 310_000, 'ESTIMATED'],
  ['WEB', 'reviewer', 'sam', 'worker', 'openrouter', 'deepseek/deepseek-v3.2', 120_000, 9_000, 52_000, 'ESTIMATED'],
  ['RES', 'researcher', 'alex', 'conversation', 'anthropic', 'claude-opus-4-8', 30_500, 4_100, 1_420_000, 'ESTIMATED'],
  ['RES', 'researcher', 'alex', 'worker', 'openrouter', 'deepseek/deepseek-v3.2', 76_000, 5_800, 34_000, 'ESTIMATED'],
  ['QTR', 'writer', 'jordan', 'conversation', 'anthropic', 'claude-opus-4-8', 22_000, 3_700, 1_070_000, 'ESTIMATED'],
  ['QTR', 'writer', 'sam', 'worker', 'anthropic', 'claude-haiku-4-5', 51_000, 7_000, 188_000, 'ESTIMATED'],
  ['QTR', 'reviewer', 'jordan', 'worker', 'openrouter', 'deepseek/deepseek-v3.2', 64_000, 4_900, 29_000, 'ESTIMATED'],
  ['WEB', 'writer', 'priya', 'title', 'anthropic', 'claude-haiku-4-5', 900, 40, null, 'INCLUDED'],
  ['RES', 'researcher', 'alex', 'summary', 'anthropic', 'claude-haiku-4-5', 2_400, 300, null, 'INCLUDED'],
]

export async function seedModelsAndBilling({ hq, hqRoot, sample, people, agents, projects, defaultSite }) {
  // The providers. A provider removed leaves the organisation's defaults null, so these go before the defaults are set.
  await hq.aiProvider.deleteMany({})
  const providers = {}
  for (const p of PROVIDERS) providers[p.key] = await addFakeProvider(hq, hqRoot, p)

  await hq.org.updateMany({
    data: {
      timeZone: sample.clock.timezone,
      defaultConversationProviderId: providers.anthropic.id, defaultConversationModel: 'claude-opus-4-8',
      defaultWorkerProviderId: providers.anthropic.id, defaultWorkerModel: 'claude-haiku-4-5',
      defaultSttProviderId: providers.stt.id, defaultSttModel: 'universal-streaming-english',
      defaultTtsProviderId: providers.tts.id, defaultTtsModel: 'inworld-tts-1.5-mini', defaultTtsVoice: 'Clive',
    },
  })

  // The billing profiles: the default, named after the organisation as setup names it, and one for client work.
  const org = await hq.org.findFirst({ select: { name: true } })
  const base = await hq.billingProfile.create({ data: { name: org.name, isDefault: true, createdById: people.sam.id } })
  const clients = await hq.billingProfile.create({ data: { name: 'Client reports', createdById: people.sam.id } })
  for (const [key, profile] of [['WEB', base], ['RES', base], ['QTR', clients]]) {
    await hq.project.update({ where: { id: projects[key].id }, data: { billingProfileId: profile.id } })
  }

  // A month of usage, one call a few minutes apart, ending now.
  const now = Date.now()
  let n = 0
  for (const [project, agent, person, purpose, provider, model, input, output, cost, basis] of USAGE) {
    n += 1
    await hq.usageEntry.create({
      data: {
        at: new Date(now - n * 7 * 60_000), kind: 'CALL', callId: `guide-sample-call-${n}`, purpose,
        providerId: providers[provider].id, providerName: providers[provider].name, model,
        inputTokens: input, outputTokens: output,
        amountMicros: cost === null ? null : BigInt(cost), currency: cost === null ? null : 'USD', basis,
        priceRef: cost === null ? null : 'hq:guide-sample',
        billingProfileId: project === 'QTR' ? clients.id : base.id,
        projectId: projects[project].id, agentId: agents[agent].id, userId: people[person].id,
      },
    })
  }
  return { providers, profiles: { base, clients } }
}
