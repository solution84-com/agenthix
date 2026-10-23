import { action, api, page, query, route, type Spec } from "@wasp.sh/spec";
import { GitHubInstallationsPage } from "./pages/GitHubInstallationsPage" with { type: "ref" };
import { GitHubAppPage } from "./pages/GitHubAppPage" with { type: "ref" };
import { ProjectGitHubPage } from "./pages/ProjectGitHubPage" with { type: "ref" };
import { getWorkflows, getRuns, getRepoSecrets } from "./queries" with { type: "ref" };
import { setRepoSecret, dispatchWorkflow } from "./actions" with { type: "ref" };
import { startGithubAppRegistration } from "./githubAppRegistrationAction" with { type: "ref" };
import { appManifestNewHandler as githubAppManifestNewApi, appManifestCallbackHandler as githubAppManifestCallbackApi } from "./githubAppApi" with { type: "ref" };

export const githubSpec: Spec = [
    route("OrgGitHubRoute", "/admin/settings/github", page(GitHubInstallationsPage, { authRequired: true })),
    route("GitHubAppRoute", "/admin/infrastructure/github-app", page(GitHubAppPage, { authRequired: true })),
    route("ProjectGitHubRoute", "/projects/:key/github", page(ProjectGitHubPage, { authRequired: true })),
    query(getWorkflows),
    query(getRuns),
    query(getRepoSecrets),
    action(setRepoSecret),
    action(dispatchWorkflow),
    action(startGithubAppRegistration, { entities: ["GitHubApp", "UserSettings"] }),
    api("GET", "/api/v1/github/app-manifest-new", githubAppManifestNewApi, { auth: false }),
    api("GET", "/api/v1/github/app-manifest-callback", githubAppManifestCallbackApi, { auth: false }),
];
