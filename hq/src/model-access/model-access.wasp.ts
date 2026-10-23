import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { ModelAccessPage } from "./pages/ModelAccessPage" with { type: "ref" };
import { getWebSearchKeyStatus } from "./webSearchKeyQueries" with { type: "ref" };
import { getMyModelAccess } from "./talkAccess" with { type: "ref" };
import { getMyClaudeSubscription, removeMyClaudeSubscription } from "./claudeSubscription" with { type: "ref" };
import { setWebSearchKey, deleteWebSearchKey } from "./webSearchKeyActions" with { type: "ref" };
import { startClaudeLogin, completeClaudeLogin, cancelClaudeLogin } from "./claudeLoginActions" with { type: "ref" };

export const modelAccessSpec: Spec = [
    route("ModelAccessRoute", "/admin/settings/model-access", page(ModelAccessPage, { authRequired: true })),
    query(getWebSearchKeyStatus, { entities: ["Provider", "UserSettings"] }),
    query(getMyModelAccess, { entities: ["AiProvider", "Org", "Agent", "ModelList", "BillingProfile", "UserSettings"] }),
    query(getMyClaudeSubscription, { entities: ["AiProvider"] }),
    action(removeMyClaudeSubscription, { entities: ["AiProvider"] }),
    action(setWebSearchKey, { entities: ["Provider", "UserSettings"] }),
    action(deleteWebSearchKey, { entities: ["Provider", "UserSettings"] }),
    action(startClaudeLogin, { entities: ["AiProvider", "UserSettings"] }),
    action(completeClaudeLogin, { entities: ["AiProvider", "UserSettings"] }),
    action(cancelClaudeLogin, { entities: ["AiProvider", "UserSettings"] }),
];
