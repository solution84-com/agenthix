/**
 * The signed-in person as a client reads and changes them: their settings in the organisation, their name and
 * picture, their timezone, their notifications read, and a phone paired by the code another of their sessions showed.
 */

export type OrgRoleName = 'ADMIN' | 'MEMBER'
/** What a message sent while the agent is replying does: waits its turn, or stops the reply. */
export type BusyConversationModeName = 'WAIT' | 'INTERRUPT'

/** `getUserSettings`: made on the person's first read. */
export type UserSettingsView = {
  id: string
  userId: string
  role: OrgRoleName
  busyConversationMode: BusyConversationModeName
  /** IANA zone; null follows the device's own. */
  timezone: string | null
  /** The person set `timezone` themselves, so a device's zone no longer replaces it. */
  timezoneChosen: boolean
  /**
   * The person's Adaptive voice (since 1.18): what an agent adds to a voice conversation beyond speaking its reply,
   * on by default. Off, the agent says nothing until its reply starts; how it notices you have finished does not change.
   */
  adaptiveVoice?: boolean
  /**
   * The person's voice sounds (since 1.21): the short sounds of a call (voice on and off, mute, a lost connection),
   * on by default.
   */
  voiceSounds?: boolean
  /** When the person joined the organisation: a `Date`, as superjson carries a database time. */
  createdAt: Date
  updatedAt: Date
}

/** Someone else's name or picture needs the ADMIN role. A null or empty name goes back to their username. */
export type SetPersonNameArgs = { userId: string; displayName: string | null }
export type SetPersonNameResult = { displayName: string | null }
/** `dataUrl`: a JPEG, PNG or WebP image as a base64 data URL. */
export type UploadPersonPictureArgs = { userId: string; dataUrl: string }
/** The picture's server-relative address. */
export type UploadPersonPictureResult = { url: string }
export type RemovePersonPictureArgs = { userId: string }
export type RemovePersonPictureResult = { ok: true }

/** The person's own choice; null gives it back to the device. */
export type SetMyTimezoneArgs = { timezone: string | null }
/** The device's zone, used only while the person has not chosen one. */
export type SyncBrowserTimezoneArgs = { timezone: string }

/** The named notifications (1 to 200), or every unread one when `ids` is absent. */
export type MarkNotificationsReadArgs = { ids?: string[] }

/** Sent without a session: the pairing code's token, and what the device calls itself. */
export type ExchangeMobileAuthTokenArgs = { token: string; deviceName?: string }
export type ExchangeMobileAuthTokenResult = { sessionId: string }
