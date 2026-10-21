import { action, query, type Spec } from "@wasp.sh/spec";
import { getModelPolicy, setModelPolicy } from "./modelPolicyOperations" with { type: "ref" };

export const modelPolicySpec: Spec = [
    query(getModelPolicy, { entities: ["ModelPolicy", "Project", "ProjectMember", "UserSettings"] }),
    action(setModelPolicy, { entities: ["ModelPolicy", "Project", "ProjectMember", "UserSettings"] }),
];
