import { action, query, type Spec } from "@wasp.sh/spec";
import { getVoiceServices, listInworldVoices } from "./voiceSettingsQueries" with { type: "ref" };
import { previewVoice } from "./voicePreviewAction" with { type: "ref" };
import { getSpeechToken } from "./speechTokenAction" with { type: "ref" };

export const voiceSpec: Spec = [
    query(getVoiceServices, { entities: [] }),
    query(listInworldVoices, { entities: [] }),
    action(previewVoice, { entities: [] }),
    action(getSpeechToken, { entities: [] }),
];
