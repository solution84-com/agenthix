import { failureWords } from '@agenthix/ui/attention'

/** What a failed press says in hq: "HQ did not answer.", "Something went wrong in HQ.", or HQ's own words. */
export const pressFailureWords = (error: unknown, fallback?: string): string => failureWords(error, 'HQ', fallback)
