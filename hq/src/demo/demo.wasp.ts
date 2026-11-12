import { api, query, type Spec } from "@wasp.sh/spec";
import { getDemoInfo } from "./demoInfo" with { type: "ref" };
import { enterDemoHandler as enterDemoApi } from "./enter/enterApi" with { type: "ref" };
import { demoVoiceClipHandler as demoVoiceClipApi } from "./voice/clip" with { type: "ref" };

// The public demo (adr-0186). Both answer without a session: the entry page asks before anyone is signed in.
// With the demo setting off, getDemoInfo says only that it is off and the entry route answers 404.
export const demoSpec: Spec = [
    query(getDemoInfo, { auth: false }),
    api("POST", "/api/demo/enter", enterDemoApi, { auth: false, entities: ["User", "UserSettings"] }),
    // A recorded voice line: 404 unless DEMO_MODE is on, and only a name the scripts' loader accepts.
    api("GET", "/api/demo/voice/:clip", demoVoiceClipApi, { auth: false }),
];
