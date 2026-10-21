/**
 * What the platform shows of Agenthix Cloud beside the connection: the Cloud section's extra facts, how many people
 * asked to sign in with it, and which offers this person has dismissed. All of it is hq's, read through the Fleet
 * Console's API; a read that fails shows nothing, because an offer that cannot be dismissed must not be offered.
 */
import { useCallback, useState } from 'react'
import type { CloudOfferName, CloudView } from '@agenthix/core'
import { api } from '../api/client'
import { useCloudRead } from './api'

/** `GET /api/cloud`: core's `CloudView`, which carries Cloud's address for the links out and whether Cloud runs this HQ. */
export type CloudSectionView = CloudView

/** The people who asked to sign in with Cloud: null until known, or when hq cannot say. */
export function useAskCount(): number | null {
  const read = useCloudRead<{ count: number }>('/cloud/asks')
  return read.phase === 'ready' ? read.value.count : null
}

export function useOffers() {
  const read = useCloudRead<{ dismissed: CloudOfferName[] }>('/cloud/offers')
  const [dismissedNow, setDismissedNow] = useState<CloudOfferName[]>([])
  const dismissed = read.phase === 'ready' ? [...read.value.dismissed, ...dismissedNow] : null
  /** An offer shows only once hq has said it is not dismissed. */
  const shows = useCallback((offer: CloudOfferName) => dismissed !== null && !dismissed.includes(offer), [dismissed])
  const dismiss = useCallback(async (offer: CloudOfferName) => {
    setDismissedNow(list => [...list, offer])
    try {
      await api(`/cloud/offers/${offer}/dismiss`, { method: 'POST', body: {} })
    } catch {
      setDismissedNow(list => list.filter(o => o !== offer))
    }
  }, [])
  return { shows, dismiss }
}

/** Cloud's address for the links out; undefined until read, or where the Fleet Console has none. */
export function useCloudUrl(): string | undefined {
  const read = useCloudRead<CloudSectionView>('/cloud')
  return read.phase === 'ready' ? read.value.cloudUrl ?? undefined : undefined
}
