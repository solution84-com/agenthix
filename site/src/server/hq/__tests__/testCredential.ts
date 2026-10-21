import { sealConnectionToken } from '../connectionToken'

// A stored hq credential is encrypted, so fixtures hold sealed values under a fixed test key.
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 9).toString('base64')

export const sealed = (raw: string): string => sealConnectionToken(raw)
