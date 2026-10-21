import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { getMemory, getMemoryMeasurements, getMemoryChoices } from "./screen/queries" with { type: "ref" };
import { saveMemoryItem, setMemoryPinned, forgetMemoryItem, setMemoryEmbeddingModel } from "./screen/actions" with { type: "ref" };
import { MemoryPage } from "./screen/pages/MemoryPage" with { type: "ref" };
import { MemorySettingsPage } from "./screen/pages/MemorySettingsPage" with { type: "ref" };

export const memorySpec: Spec = [
    route("MemoryRoute", "/settings/memory", page(MemoryPage, { authRequired: true })),
    route("OrgMemorySettingsRoute", "/org/settings/memory", page(MemorySettingsPage, { authRequired: true })),
    query(getMemory, { entities: ["MemoryItem", "Agent", "Project", "User"] }),
    query(getMemoryMeasurements, { entities: ["MemoryOutcome", "MemoryItem", "Org"] }),
    query(getMemoryChoices, { entities: ["Agent", "Project"] }),
    action(saveMemoryItem, { entities: ["MemoryItem"] }),
    action(setMemoryPinned, { entities: ["MemoryItem"] }),
    action(forgetMemoryItem, { entities: ["MemoryItem"] }),
    action(setMemoryEmbeddingModel, { entities: ["Org", "MemoryItem"] }),
];
