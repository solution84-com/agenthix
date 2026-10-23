import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { ModelAccessPage } from "./pages/ModelAccessPage" with { type: "ref" };
import { getModelCredentialStatus } from "./modelCredentialQueries" with { type: "ref" };
import { getWebSearchKeyStatus } from "./webSearchKeyQueries" with { type: "ref" };
import { getMyModelAccess } from "./talkAccess" with { type: "ref" };
import { setModelCredential, deleteModelCredential } from "./modelCredentialActions" with { type: "ref" };
import { setWebSearchKey, deleteWebSearchKey } from "./webSearchKeyActions" with { type: "ref" };
import { startClaudeLogin, completeClaudeLogin, cancelClaudeLogin } from "./claudeLoginActions" with { type: "ref" };

export const modelAccessSpec: Spec = [
    route("ModelAccessRoute", "/admin/settings/model-access", page(ModelAccessPage, { authRequired: true })),
    query(getModelCredentialStatus, { entities: ["ModelCredential", "Provider", "User", "UserSettings", "Project", "ProjectMember"] }),
    query(getWebSearchKeyStatus, { entities: ["Provider", "UserSettings"] }),
    query(getMyModelAccess, { entities: ["Provider", "ModelCredential", "User", "UserSettings"] }),
    action(setModelCredential, { entities: ["ModelCredential", "Provider", "UserSettings", "Project", "ProjectMember"] }),
    action(deleteModelCredential, { entities: ["ModelCredential", "Provider", "UserSettings", "Project", "ProjectMember"] }),
    action(setWebSearchKey, { entities: ["Provider", "UserSettings"] }),
    action(deleteWebSearchKey, { entities: ["Provider", "UserSettings"] }),
    action(startClaudeLogin, { entities: ["ModelCredential", "Project", "ProjectMember", "UserSettings"] }),
    action(completeClaudeLogin, { entities: ["ModelCredential", "Project", "ProjectMember", "UserSettings"] }),
    action(cancelClaudeLogin, { entities: ["ModelCredential", "Project", "ProjectMember", "UserSettings"] }),
];
