import { action, query, type Spec } from "@wasp.sh/spec";
import {
    getAiProviders, getAiProviderRecords, getAiProviderImpact,
    addAiProvider, replaceAiProviderKey, renameAiProvider, removeAiProvider, revokeAiProvider, checkAiProviderNow,
} from "./operations" with { type: "ref" };

// The organisation's providers, for organisation admins on Providers in the admin area (models from one place, part 1).
// Every write goes through providers/write.ts; no read returns a key.
export const providersSpec: Spec = [
    query(getAiProviders, { entities: ["AiProvider"] }),
    query(getAiProviderRecords, { entities: ["AiProviderRecord"] }),
    query(getAiProviderImpact, { entities: ["AiProvider"] }),
    action(addAiProvider, { entities: ["AiProvider", "AiProviderRecord"] }),
    action(replaceAiProviderKey, { entities: ["AiProvider", "AiProviderRecord"] }),
    action(renameAiProvider, { entities: ["AiProvider", "AiProviderRecord"] }),
    action(removeAiProvider, { entities: ["AiProvider", "AiProviderRecord"] }),
    action(revokeAiProvider, { entities: ["AiProvider", "AiProviderRecord"] }),
    action(checkAiProviderNow, { entities: ["AiProvider", "AiProviderRecord"] }),
];
