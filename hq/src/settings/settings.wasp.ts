import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { SettingsPage } from "./pages/SettingsPage" with { type: "ref" };
import { getUserSettings, getSiteConfig, getEnvStatus, getVersionInfo, getOrg, getGithubAppStatus } from "./queries" with { type: "ref" };
import { updateUserSettings, updateUserRole, updateSiteConfig, updateOrg, refreshGithubInstallations, disconnectGithubApp, updateRiskRules } from "./actions" with { type: "ref" };
import { syncBrowserTimezone, setMyTimezone } from "./timezoneActions" with { type: "ref" };
import { removePerson, reactivatePerson } from "./leaving" with { type: "ref" };
import { erasePerson } from "./erasePerson" with { type: "ref" };
import { setPersonName, uploadPersonPicture, removePersonPicture } from "./personProfileActions" with { type: "ref" };
import { getOrgPeople, getOrgPerson } from "./orgPeopleQueries" with { type: "ref" };
import { getFilesPlace } from "./filesPlaceQuery" with { type: "ref" };
import { getPersonCard } from "./personCard" with { type: "ref" };

export const settingsSpec: Spec = [
    route("SettingsRoute", "/settings", page(SettingsPage, { authRequired: true })),
    query(getUserSettings, { entities: ["UserSettings"] }),
    query(getSiteConfig, { entities: ["SiteConfig"] }),
    query(getEnvStatus, { entities: ["UserSettings"] }),
    query(getVersionInfo),
    query(getFilesPlace, { entities: [] }),
    query(getOrg, { entities: ["Org"] }),
    action(updateUserSettings, { entities: ["UserSettings"] }),
    action(syncBrowserTimezone, { entities: ["UserSettings"] }),
    action(setMyTimezone, { entities: ["UserSettings"] }),
    action(removePerson, { entities: ["User", "UserSettings", "ProjectMember", "Project", "Task", "PersonConnection"] }),
    action(reactivatePerson, { entities: ["User", "UserSettings"] }),
    action(erasePerson, { entities: ["User", "UserSettings", "ProjectMember", "Project", "Task", "PersonConnection", "Invite"] }),
    action(setPersonName, { entities: ["User"] }),
    action(uploadPersonPicture, { entities: ["User"] }),
    action(removePersonPicture, { entities: ["User"] }),
    query(getOrgPeople, { entities: ["User", "UserSettings", "ProjectMember", "Invite"] }),
    query(getOrgPerson, { entities: ["User", "UserSettings", "ProjectMember", "Project", "Task"] }),
    query(getPersonCard, { entities: ["User", "UserSettings", "ProjectMember", "Project", "Task"] }),
    action(updateUserRole, { entities: ["UserSettings"] }),
    action(updateSiteConfig, { entities: ["UserSettings", "SiteConfig"] }),
    action(updateOrg, { entities: ["Org"] }),
    action(refreshGithubInstallations, { entities: ["GitHubInstallation"] }),
    action(disconnectGithubApp, { entities: ["GitHubApp", "GitHubInstallation"] }),
    action(updateRiskRules, { entities: ["UserSettings", "SiteConfig"] }),
    query(getGithubAppStatus, { entities: ["GitHubApp", "GitHubInstallation"] }),
];
