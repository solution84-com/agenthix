import { page, query, route, type Spec } from "@wasp.sh/spec";
import { ChatPage } from "./pages/ChatPage" with { type: "ref" };
import { SpacePage } from "./pages/SpacePage" with { type: "ref" };
import { getMyStorageSite } from "./storageSiteQuery" with { type: "ref" };

export const chatSpec: Spec = [
    route("ChatRoute", "/chat", page(ChatPage, { authRequired: true })),
    route("SpaceRoute", "/space", page(SpacePage, { authRequired: true })),
    query(getMyStorageSite, { entities: ["UserStoragePlacement", "ExecutionSite"] }),
];
