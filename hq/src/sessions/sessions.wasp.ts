import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { ChatSessionPage } from "./pages/ChatSessionPage" with { type: "ref" };
import { getRecentActivity, getSession, getTaskRuns, getTaskSessions, getTaskSession, getActivitySession } from "./queries" with { type: "ref" };
import { getProjectActiveRuns } from "./activeRunsQueries" with { type: "ref" };
import { updateSession, archiveSession, triggerAgentRun, cancelAgentRun, stopTaskSession, deleteTaskSession, stopAllSessions } from "./actions" with { type: "ref" };
import { tryAgain, sendWaitingMessageNow, cancelWaitingMessage, summariseConversation } from "./conversationActions" with { type: "ref" };

export const sessionsSpec: Spec = [
    route("ChatSessionRoute", "/sessions/:id", page(ChatSessionPage, { authRequired: true })),
    query(getRecentActivity, { entities: ["AgentSession", "Agent"] }),
    query(getSession, { entities: ["AgentSession", "Agent"] }),
    query(getTaskRuns, { entities: ["Agent"] }),
    query(getTaskSessions, { entities: ["AgentSession", "Agent", "Task"] }),
    query(getTaskSession, { entities: ["AgentSession"] }),
    query(getActivitySession, { entities: ["AgentSession", "Task"] }),
    query(getProjectActiveRuns),
    action(updateSession, { entities: ["AgentSession"] }),
    action(archiveSession, { entities: ["AgentSession"] }),
    action(triggerAgentRun, { entities: ["AgentSession", "Agent"] }),
    action(cancelAgentRun, { entities: ["AgentSession"] }),
    action(stopTaskSession),
    action(deleteTaskSession, { entities: ["AgentSession"] }),
    action(stopAllSessions),
    action(tryAgain, { entities: ["AgentSession", "Agent"] }),
    action(sendWaitingMessageNow, { entities: ["AgentSession"] }),
    action(cancelWaitingMessage, { entities: ["AgentSession"] }),
    action(summariseConversation, { entities: ["AgentSession", "Agent"] }),
];
