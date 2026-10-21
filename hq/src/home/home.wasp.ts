import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { HomePage } from "./pages/HomePage" with { type: "ref" };
import { getHomeSignals } from "./homeSignals" with { type: "ref" };
import { getPledgeCard, dismissPledge, getMyPledge } from "./pledge" with { type: "ref" };

export const homeSpec: Spec = [
    route("HomeRoute", "/", page(HomePage, { authRequired: true })),
    query(getHomeSignals, { entities: ["Notification", "Task", "Routine", "Project"] }),
    query(getPledgeCard, { entities: ["User"] }),
    action(dismissPledge, { entities: ["User"] }),
    query(getMyPledge, { entities: ["User"] }),
];
