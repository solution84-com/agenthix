import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { SetupPage } from "./pages/SetupPage" with { type: "ref" };
import { getSetupData, getSetupResume } from "./queries" with { type: "ref" };
import { getSetupDefaults } from "./defaultsView" with { type: "ref" };
import { completeSetup } from "./actions" with { type: "ref" };
import { saveSetupOrganisation } from "./organisation" with { type: "ref" };

export const setupSpec: Spec = [
    route("SetupRoute", "/setup", page(SetupPage, { authRequired: true })),
    query(getSetupData, { entities: ["Org", "UserSettings", "Invite", "ExecutionSite"] }),
    query(getSetupResume, { entities: ["AiProvider"] }),
    query(getSetupDefaults, { entities: ["Org", "AiProvider", "ModelList", "Agent"] }),
    action(completeSetup, { entities: ["Org", "UserSettings", "Invite", "AiProvider"] }),
    action(saveSetupOrganisation, { entities: ["Org", "BillingProfile"] }),
];
