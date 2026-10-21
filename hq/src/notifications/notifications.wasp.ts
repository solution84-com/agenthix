import { action, query, type Spec } from "@wasp.sh/spec";
import { getNotifications } from "./queries" with { type: "ref" };
import { dismissNotification, markNotificationsRead, acknowledgeBypassedAgents } from "./actions" with { type: "ref" };
import { getNeedsAttention } from "./needsAttention" with { type: "ref" };

export const notificationsSpec: Spec = [
    query(getNotifications, { entities: ["Notification", "Task", "TaskComment"] }),
    action(dismissNotification, { entities: ["Notification", "Org"] }),
    action(markNotificationsRead, { entities: ["Notification"] }),
    action(acknowledgeBypassedAgents, { entities: ["Notification", "Org", "Agent"] }),
    query(getNeedsAttention, { entities: ["Notification", "Org", "Agent", "Invite", "Task", "Project"] }),
];
