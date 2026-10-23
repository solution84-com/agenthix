import { action, query, type Spec } from "@wasp.sh/spec";
import { getModelsSettings, getAgentModels, getModelList, getAgentModelLines, getModelPickerChoices } from "./settingsReads" with { type: "ref" };
import { setModelDefaults, setAgentModels, setModelList } from "./settingsActions" with { type: "ref" };

// Models in the admin area, an agent's own models, and the lists (models from one place, part 4). Who may change what
// is checked in the operations themselves.
export const modelsSettingsSpec: Spec = [
    query(getModelsSettings, { entities: ["Org", "AiProvider", "ModelList", "Agent"] }),
    query(getAgentModels, { entities: ["Org", "AiProvider", "ModelList", "Agent", "AgentModelChoices"] }),
    query(getModelList, { entities: ["Org", "AiProvider", "ModelList", "Project", "ProjectMember"] }),
    query(getAgentModelLines, { entities: ["Org", "AiProvider", "AgentModelChoices"] }),
    query(getModelPickerChoices, { entities: ["Org", "AiProvider", "ModelList", "Project", "Agent"] }),
    action(setModelDefaults, { entities: ["Org", "AiProvider", "ModelList", "Agent"] }),
    action(setAgentModels, { entities: ["Org", "AiProvider", "ModelList", "Agent", "AgentModelChoices"] }),
    action(setModelList, { entities: ["ModelList", "ModelListEntry", "Project", "Agent", "Org"] }),
];
