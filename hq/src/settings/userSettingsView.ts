import type { UserSettings } from '@prisma/client'
import type { UserSettingsView } from '@agenthix/core'

/** The person's settings as `getUserSettings` answers them; `config` and the primary agent are read where they are used. */
export function userSettingsView(settings: UserSettings): UserSettingsView {
  return {
    id: settings.id,
    userId: settings.userId,
    role: settings.role,
    busyConversationMode: settings.busyConversationMode,
    timezone: settings.timezone,
    timezoneChosen: settings.timezoneChosen,
    adaptiveVoice: settings.adaptiveVoice,
    voiceHums: settings.voiceHums,
    voiceExpressiveTone: settings.voiceExpressiveTone,
    voiceSounds: settings.voiceSounds,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  }
}
