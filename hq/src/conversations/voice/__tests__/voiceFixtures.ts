/** Working providers and the organisation's defaults for integration tests of voice, on the resolver. Keys are fake. */
import { prisma } from '../../../test/db'
import { createProvider } from '../../../routing/__tests__/routingFixtures'

export async function setUpVoiceProviders(opts: { stt?: boolean; tts?: boolean } = {}) {
  const llm = await createProvider({ vendor: 'anthropic' })
  const stt = opts.stt === false ? null : await createProvider({ vendor: 'assemblyai', key: 'stt-key' })
  const tts = opts.tts === false ? null : await createProvider({ vendor: 'inworld', key: 'tts-key' })
  const org = (await prisma.org.findFirst({ select: { id: true } })) ?? (await prisma.org.create({ data: { name: 'Fernhill' }, select: { id: true } }))
  await prisma.org.update({
    where: { id: org.id },
    data: {
      defaultConversationProviderId: llm.id, defaultConversationModel: 'claude-sonnet-5',
      ...(stt ? { defaultSttProviderId: stt.id, defaultSttModel: 'universal-streaming-english' } : {}),
      ...(tts ? { defaultTtsProviderId: tts.id, defaultTtsModel: 'inworld-tts-1.5-max', defaultTtsVoice: 'Ashley' } : {}),
    },
  })
  return { llm, stt, tts }
}
