/**
 * Production wrapper: resolves hq's JWKS URL and verifies with a cached remote
 * key set (jose refetches on unknown kid — the §2 rotation pattern). hq's URL
 * comes from HqConnection (populated once Execution Site registration exists); HQ_URL is a
 * dev-only fallback until then.
 */
import { createRemoteJWKSet } from 'jose'
import { prisma } from '#db'
import { HQ_JWKS_PATH } from '@agenthix/core'
import { verifyWithKeySet } from './tokenVerify'

let cachedSet: ReturnType<typeof createRemoteJWKSet> | null = null
let cachedUrl: string | null = null

async function resolveJwksUrl(): Promise<string> {
  const conn = await prisma.hqConnection.findFirst()
  const hqUrl = conn?.hqUrl || process.env.HQ_URL
  if (!hqUrl) throw new Error('No HQ connection configured (HqConnection.hqUrl or HQ_URL)')
  return new URL(HQ_JWKS_PATH, hqUrl).toString()
}

export async function verifyHqToken(token: string, expectedType?: 'identity' | 'capability') {
  const url = await resolveJwksUrl()
  if (!cachedSet || cachedUrl !== url) {
    cachedSet = createRemoteJWKSet(new URL(url))
    cachedUrl = url
  }
  // Always pinned: a token minted for a sibling site must not be replayable here.
  const config = await prisma.siteConfig.findFirst()
  if (!config) throw new Error('SiteConfig is missing — cannot verify audience')
  return verifyWithKeySet(token, cachedSet, expectedType, config.siteId)
}
