/**
 * Billing profiles (part 5): what a place's AI cost belongs to, inside one organisation (*Fernhill*, *Client X*). Not
 * a *billing account*, which is Agenthix Cloud's word for the entity that pays. Organisation admins make, rename and
 * archive them in hq; one is always the default, and none is ever deleted or its id reused.
 */

export const BILLING_PROFILE_NAME_MAX = 80

export type BillingProfileView = {
  id: string
  name: string
  isDefault: boolean
  createdAt: string
  archivedAt: string | null
  /** Projects that use it; archiving waits until there are none. */
  projectCount: number
}

/** Why a profile could not be archived: it is the default, or projects still use it. */
export type BillingProfileArchiveRefusal = { reason: 'is_default' } | { reason: 'in_use'; projectCount: number }
