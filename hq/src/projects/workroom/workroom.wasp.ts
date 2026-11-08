import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { WorkroomsPage } from "./WorkroomsPage" with { type: "ref" };
import { getWorkroom, getWorkrooms, reorderWorkroomAgents, stopMyRuns } from "./workroomOperations" with { type: "ref" };

export const workroomSpec: Spec = [
    route("WorkroomsRoute", "/workrooms", page(WorkroomsPage, { authRequired: true })),
    query(getWorkroom, { entities: ["Task", "Project", "ProjectAgent", "Agent", "AgentSession"] }),
    query(getWorkrooms, { entities: ["Task", "Project", "ProjectAgent", "Agent", "AgentSession"] }),
    action(reorderWorkroomAgents, { entities: ["ProjectAgent"] }),
    action(stopMyRuns, { entities: ["Task", "Project", "AgentSession", "TaskActivity"] }),
];
