import { action, api, page, query, route, type Spec } from "@wasp.sh/spec";
import { OrgPage } from "./pages/OrgPage" with { type: "ref" };
import { OrgPeoplePage } from "./pages/people/OrgPeoplePage" with { type: "ref" };
import { OrgPersonPage } from "./pages/people/OrgPersonPage" with { type: "ref" };
import { RemovePersonPage } from "./pages/people/RemovePersonPage" with { type: "ref" };
import { OrgKnowledgePage } from "./pages/OrgKnowledgePage" with { type: "ref" };
import { TeamsPage } from "./pages/TeamsPage" with { type: "ref" };
import { TeamPage as TeamDetailPage } from "./pages/TeamPage" with { type: "ref" };
import { OrgSettingsPage } from "./pages/settings/OrgSettingsPage" with { type: "ref" };
import { RunsSettingsPage } from "./pages/settings/RunsSettingsPage" with { type: "ref" };
import { RiskRulesPage } from "./pages/settings/RiskRulesPage" with { type: "ref" };
import { SitesForProjectsPage } from "./pages/settings/SitesForProjectsPage" with { type: "ref" };
import { InfrastructurePage } from "./pages/infrastructure/InfrastructurePage" with { type: "ref" };
import { HqPage } from "./pages/infrastructure/HqPage" with { type: "ref" };
import { getTeams, getTeam, getProjectTeams } from "./teams/teamQueries" with { type: "ref" };
import { createTeam, updateTeam, deleteTeam } from "./teams/teamActions" with { type: "ref" };
import { addTeamToProject, setProjectTeamRole, removeTeamFromProject } from "./teams/projectTeamActions" with { type: "ref" };
import { getWorkplacePeople, getOrgSettingsState } from "./workplaceQueries" with { type: "ref" };
import { getOrgIdentity, updateOrgIdentity } from "./identity" with { type: "ref" };
import { publicOrgIdentityHandler as publicOrgIdentityApi, setSignInShows } from "./publicIdentity" with { type: "ref" };
import { uploadOrgImage, removeOrgImage, uploadTeamImage, removeTeamImage } from "./identityImages" with { type: "ref" };

export const orgSpec: Spec = [
    route("OrgRoute", "/org", page(OrgPage, { authRequired: true })),
    route("OrgPeopleRoute", "/admin/people", page(OrgPeoplePage, { authRequired: true })),
    route("OrgPersonRoute", "/admin/people/:userId", page(OrgPersonPage, { authRequired: true })),
    route("OrgRemovePersonRoute", "/admin/people/:userId/remove", page(RemovePersonPage, { authRequired: true })),
    route("OrgSettingsRoute", "/admin/settings", page(OrgSettingsPage, { authRequired: true })),
    route("OrgRunsSettingsRoute", "/admin/settings/runs", page(RunsSettingsPage, { authRequired: true })),
    route("OrgRiskRulesRoute", "/admin/settings/risk-rules", page(RiskRulesPage, { authRequired: true })),
    route("OrgSitesForProjectsRoute", "/admin/sites-for-projects", page(SitesForProjectsPage, { authRequired: true })),
    route("InfrastructureRoute", "/admin/infrastructure", page(InfrastructurePage, { authRequired: true })),
    route("InfrastructureHqRoute", "/admin/infrastructure/hq", page(HqPage, { authRequired: true })),
    route("OrgKnowledgeRoute", "/org/knowledge", page(OrgKnowledgePage, { authRequired: true })),
    route("TeamsRoute", "/org/teams", page(TeamsPage, { authRequired: true })),
    route("TeamDetailRoute", "/org/teams/:id", page(TeamDetailPage, { authRequired: true })),
    route("AdminTeamsRoute", "/admin/teams", page(TeamsPage, { authRequired: true })),
    route("AdminTeamDetailRoute", "/admin/teams/:id", page(TeamDetailPage, { authRequired: true })),
    query(getOrgIdentity, { entities: ["Org"] }),
    action(updateOrgIdentity, { entities: ["Org"] }),
    action(uploadOrgImage, { entities: ["Org"] }),
    action(removeOrgImage, { entities: ["Org"] }),
    // The organisation before sign-in, as much as its admin chose (getting-in spec, Signing in).
    api("GET", "/api/org/public-identity", publicOrgIdentityApi, { auth: false }),
    action(setSignInShows, { entities: ["Org", "UserSettings"] }),
    query(getWorkplacePeople, { entities: ["User", "UserSettings", "Invite"] }),
    query(getOrgSettingsState, { entities: ["Provider", "AiProvider", "GitHubInstallation", "Org", "SiteConfig"] }),
    query(getTeams, { entities: ["Team", "User"] }),
    query(getTeam, { entities: ["Team", "User", "Project"] }),
    query(getProjectTeams, { entities: ["Team", "ProjectTeam", "ProjectMember", "ProjectAgent"] }),
    action(createTeam, { entities: ["Team"] }),
    action(updateTeam, { entities: ["Team", "ProjectTeam", "ProjectMember", "ProjectAgent", "Task"] }),
    action(deleteTeam, { entities: ["Team", "ProjectTeam"] }),
    action(uploadTeamImage, { entities: ["Team"] }),
    action(removeTeamImage, { entities: ["Team"] }),
    action(addTeamToProject, { entities: ["Team", "ProjectTeam", "ProjectMember", "ProjectAgent", "Project"] }),
    action(setProjectTeamRole, { entities: ["Team", "ProjectTeam", "ProjectMember", "ProjectAgent", "Project", "Task"] }),
    action(removeTeamFromProject, { entities: ["Team", "ProjectTeam", "ProjectMember", "ProjectAgent", "Project", "Task", "Routine"] }),
];
