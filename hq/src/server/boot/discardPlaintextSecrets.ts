/**
 * Boot pass: removes any Provider row whose key is still stored in the clear,
 * from before provider keys were encrypted. It is not converted — before the
 * first release hq works from a clean state — so the person enters the key
 * again, and until then every reader treats it as not configured
 * (providerService.ts). Idempotent and safe to run on every boot.
 *
 * An OpenAI-compatible endpoint that needs no key keeps an empty `apiKey`;
 * that is no key at all, not one in the clear, so its row stays.
 */
import { prisma } from 'wasp/server'
import { looksEncrypted, MODEL_KEY_SERVICE } from '../providerService'
import { Logger } from '../utils/logger'

const logger = new Logger('startup')

const keylessEndpoint = (row: { service: string; name: string; apiKey: string }) =>
  row.service === MODEL_KEY_SERVICE && row.name === 'openai_compatible' && row.apiKey === ''

export async function discardPlaintextSecrets(): Promise<number> {
  try {
    const rows = await prisma.provider.findMany({ select: { id: true, service: true, name: true, apiKey: true } })
    const stale = rows.filter(row => !looksEncrypted(row.apiKey) && !keylessEndpoint(row))
    if (stale.length === 0) return 0
    await prisma.provider.deleteMany({ where: { id: { in: stale.map(row => row.id) } } })
    const which = stale.map(row => `${row.service}/${row.name}`).join(', ')
    logger.warn(`Removed ${stale.length} provider key(s) stored in the clear (${which}) — enter them again in Settings.`)
    return stale.length
  } catch (err) {
    logger.error('Removing provider keys stored in the clear failed — they are still ignored when read', err)
    return 0
  }
}
