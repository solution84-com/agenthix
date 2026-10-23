import { page, route, type Spec } from "@wasp.sh/spec";
import { AdminOverviewPage } from "./pages/AdminOverviewPage" with { type: "ref" };
import { LegacyOrgRedirectPage } from "./pages/LegacyOrgRedirectPage" with { type: "ref" };
import { ProvidersPage } from "../providers/pages/ProvidersPage" with { type: "ref" };
import { ModelsComingPage, BillingProfilesComingPage, UsageComingPage } from "./pages/ComingPages" with { type: "ref" };

export const adminSpec: Spec = [
    route("AdminRoute", "/admin", page(AdminOverviewPage, { authRequired: true })),
    route("AdminProvidersRoute", "/admin/providers", page(ProvidersPage, { authRequired: true })),
    route("AdminModelsRoute", "/admin/models", page(ModelsComingPage, { authRequired: true })),
    route("AdminBillingProfilesRoute", "/admin/billing-profiles", page(BillingProfilesComingPage, { authRequired: true })),
    route("AdminUsageRoute", "/admin/usage", page(UsageComingPage, { authRequired: true })),
    // A former /org address that moved under /admin (the pages that stayed have routes of their own, which win).
    route("OrgMovedRoute", "/org/*", page(LegacyOrgRedirectPage, { authRequired: true })),
];
