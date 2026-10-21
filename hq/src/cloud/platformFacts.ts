/**
 * What the platform shows fleet admins of Agenthix Cloud, through the console link: how many people asked to sign in
 * with it, and which of its offers a person has dismissed. Neither calls Cloud. The stores are given, so the rules
 * (who may read, what an offer is called, that a dismissal is per person and for good) are tested without a database.
 */
import { CLOUD_OFFER_NAMES, type CloudOfferName } from '@agenthix/core'

export type PlatformFactsStore = {
  /** Ids of everyone with an ask stored. */
  askerIds(): Promise<string[]>
  /** How many of these hold an active account. */
  countActive(userIds: string[]): Promise<number>
  dismissedBy(userId: string): Promise<string[]>
  dismiss(userId: string, offer: CloudOfferName): Promise<void>
}

export type PlatformFacts = {
  askCount(): Promise<number>
  dismissed(userId: string): Promise<CloudOfferName[]>
  dismiss(userId: string, offer: CloudOfferName): Promise<CloudOfferName[]>
}

const KNOWN = new Set<string>(CLOUD_OFFER_NAMES)

export function platformFacts(store: PlatformFactsStore): PlatformFacts {
  const dismissed = async (userId: string) => (await store.dismissedBy(userId)).filter((o): o is CloudOfferName => KNOWN.has(o))
  return {
    // A person who left since asking no longer counts.
    askCount: async () => store.countActive(await store.askerIds()),
    dismissed,
    async dismiss(userId, offer) {
      await store.dismiss(userId, offer)
      return dismissed(userId)
    },
  }
}
