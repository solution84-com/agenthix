import { page, route, type Spec } from "@wasp.sh/spec";
import { WorkspaceViewPage } from "./pages/WorkspaceViewPage" with { type: "ref" };

export const workspaceViewSpec: Spec = [
    route("WorkspaceViewRoute", "/workspaces/:workspaceId/view", page(WorkspaceViewPage, { authRequired: true })),
];
