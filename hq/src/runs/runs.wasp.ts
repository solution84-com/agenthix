import { page, query, route, type Spec } from "@wasp.sh/spec";
import { RunsPage } from "./pages/RunsPage" with { type: "ref" };
import { getMyRuns, getMyRunsGoingCount, getRunsPage, getRunDetail, getToolCallOutput } from "./queries" with { type: "ref" };

export const runsSpec: Spec = [
    route("RunsRoute", "/runs/:runId?", page(RunsPage, { authRequired: true })),
    query(getMyRuns, { entities: ["Task", "AgentSession", "Agent", "User"] }),
    query(getMyRunsGoingCount, { entities: ["Task", "AgentSession"] }),
    query(getRunsPage, { entities: ["Task", "AgentSession", "Agent", "User"] }),
    query(getRunDetail, { entities: ["AgentSession", "Task", "Agent", "User"] }),
    query(getToolCallOutput, { entities: ["AgentSession"] }),
];
