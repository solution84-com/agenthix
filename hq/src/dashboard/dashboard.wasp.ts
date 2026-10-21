import { page, query, route, type Spec } from "@wasp.sh/spec";
import { OrgDashboardRedirectPage } from "./pages/OrgDashboardRedirectPage" with { type: "ref" };
import { getTodayNumbers } from "./todayQueries" with { type: "ref" };

export const dashboardSpec: Spec = [
    route("OrgDashboardRoute", "/org/dashboard", page(OrgDashboardRedirectPage, { authRequired: true })),
    query(getTodayNumbers, { entities: ["ExecutionSite", "Task", "Project"] }),
];
