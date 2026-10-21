import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { ConnectionsPage } from "./pages/ConnectionsPage" with { type: "ref" };
import { getMyConnections, createConnection, renewConnection, revokeConnection } from "./operations" with { type: "ref" };

export const connectionsSpec: Spec = [
    route("ConnectionsRoute", "/settings/connections", page(ConnectionsPage, { authRequired: true })),
    query(getMyConnections, { entities: ["PersonConnection", "Project"] }),
    action(createConnection, { entities: ["PersonConnection", "Project", "ProjectMember"] }),
    action(renewConnection, { entities: ["PersonConnection", "Project"] }),
    action(revokeConnection, { entities: ["PersonConnection", "Project"] }),
];
