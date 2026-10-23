import { api, page, query, route, type Spec } from "@wasp.sh/spec";
import { ExecutionSitesPage } from "./pages/ExecutionSitesPage" with { type: "ref" };
import { SitePage } from "./pages/SitePage" with { type: "ref" };
import { getExecutionSites, describeExecutionSite } from "./queries" with { type: "ref" };
import { getScheduledChangeNotices } from "./scheduled/memberNoticeQueries" with { type: "ref" };
import { getSiteList, getSiteDetail, getFleetAccess } from "./siteQueries" with { type: "ref" };
import { siteLeaveHandler as siteLeaveApi } from "./leaveApi" with { type: "ref" };
import { hostLeaveHandler as hostLeaveApi } from "./machineLeaveApi" with { type: "ref" };

export const sitesSpec: Spec = [
    route("ExecutionSitesRoute", "/admin/where-work-runs", page(ExecutionSitesPage, { authRequired: true })),
    route("SiteRoute", "/admin/where-work-runs/:executionSiteId", page(SitePage, { authRequired: true })),
    query(getExecutionSites, { entities: ["ExecutionSite"] }),
    query(getSiteList, { entities: ["ExecutionSite", "UserSettings", "Task", "HeldSiteInstruction"] }),
    query(getSiteDetail, { entities: ["ExecutionSite", "UserSettings", "Task", "Project", "HeldSiteInstruction"] }),
    query(getFleetAccess, { entities: [] }),
    query(getScheduledChangeNotices, { entities: ["ScheduledChange", "ProjectMember", "ExecutionSite", "Project"] }),
    query(describeExecutionSite, { entities: ["ExecutionSite"] }),
    api("POST", "/api/v1/sites/leave", siteLeaveApi, { auth: false, entities: ["ExecutionSite"] }),
    // core's HOST_LEAVE_PATH: a machine that disconnected itself, known by its machine credential (spec §6).
    api("POST", "/api/v1/hosts/leave", hostLeaveApi, { auth: false, entities: ["RelayHost"] }),
];
