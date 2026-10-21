import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { VoiceSettingsPage } from "./pages/VoiceSettingsPage" with { type: "ref" };
import { saveVoiceProvider, deleteVoiceProvider } from "./voiceSettingsActions" with { type: "ref" };
import { updateAgentVoice } from "./agentVoiceActions" with { type: "ref" };
import { getVoiceProvider, getVoiceServices, listInworldVoices } from "./voiceSettingsQueries" with { type: "ref" };
import { previewVoice } from "./voicePreviewAction" with { type: "ref" };
import { getSpeechToken } from "./speechTokenAction" with { type: "ref" };

export const voiceSpec: Spec = [
    route("VoiceSettingsRoute", "/org/settings/voice", page(VoiceSettingsPage, { authRequired: true })),
    action(saveVoiceProvider, { entities: ["Provider", "UserSettings"] }),
    action(deleteVoiceProvider, { entities: ["Provider", "UserSettings"] }),
    action(updateAgentVoice, { entities: ["Agent"] }),
    query(getVoiceProvider, { entities: ["Provider", "UserSettings"] }),
    query(getVoiceServices, { entities: ["Provider"] }),
    query(listInworldVoices, { entities: ["Provider"] }),
    action(previewVoice, { entities: ["Provider"] }),
    action(getSpeechToken, { entities: ["Provider"] }),
];
