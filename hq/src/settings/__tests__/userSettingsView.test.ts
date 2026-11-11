import { describe, it, expect } from 'vitest'
import type { UserSettings } from '@prisma/client'
import { userSettingsView } from '../userSettingsView'

describe('userSettingsView @SC-1834', () => {
  it('answers the settings a client reads, its times as dates, and not the stored config or primary agent', () => {
    const settings: UserSettings = {
      id: 's1', userId: 'u1', role: 'ADMIN', config: { theme: 'dark' }, busyConversationMode: 'INTERRUPT',
      primaryAgentId: 'a1', timezone: 'Europe/London', timezoneChosen: true, adaptiveVoice: false, voiceSounds: false,
      createdAt: new Date('2026-10-01T09:00:00.000Z'), updatedAt: new Date('2026-10-02T09:00:00.000Z'),
    }
    expect(userSettingsView(settings)).toEqual({
      id: 's1', userId: 'u1', role: 'ADMIN', busyConversationMode: 'INTERRUPT', timezone: 'Europe/London',
      timezoneChosen: true, adaptiveVoice: false, voiceSounds: false,
      createdAt: new Date('2026-10-01T09:00:00.000Z'), updatedAt: new Date('2026-10-02T09:00:00.000Z'),
    })
  })
})
