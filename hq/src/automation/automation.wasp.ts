import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { ProjectRoutinesPage } from "./pages/ProjectRoutinesPage" with { type: "ref" };
import { AutomationSettingsPage } from "./pages/AutomationSettingsPage" with { type: "ref" };
import { getOrgAutomation, updateOrgAutomation, getProjectAutomation, updateProjectAutomation, setTaskSchedule, clearTaskSchedule } from "./operations" with { type: "ref" };
import { getAutomationOutlook } from "./automationOutlook" with { type: "ref" };
import { RoutinePage } from "./pages/RoutinePage" with { type: "ref" };
import { getProjectRoutines, getRoutine } from "./routineQueries" with { type: "ref" };
import { getRoutinesAcrossProjects } from "./routinesAcross" with { type: "ref" };
import { createRoutine, updateRoutine, deleteRoutine, runRoutineNow } from "./routineActions" with { type: "ref" };

export const automationSpec: Spec = [
    route("ProjectRoutinesRoute", "/projects/:key/routines", page(ProjectRoutinesPage, { authRequired: true })),
    route("AutomationSettingsRoute", "/admin/settings/automation", page(AutomationSettingsPage, { authRequired: true })),
    query(getOrgAutomation, { entities: ["Org"] }),
    action(updateOrgAutomation, { entities: ["Org"] }),
    query(getProjectAutomation, { entities: ["Org", "Project"] }),
    action(updateProjectAutomation, { entities: ["Org", "Project"] }),
    query(getAutomationOutlook, { entities: ["Task", "Routine"] }),
    action(setTaskSchedule, { entities: ["Task"] }),
    action(clearTaskSchedule, { entities: ["Task"] }),
    route("RoutineRoute", "/routines/:routineId", page(RoutinePage, { authRequired: true })),
    query(getProjectRoutines, { entities: ["Routine", "RoutineRun"] }),
    query(getRoutine, { entities: ["Routine", "RoutineRun"] }),
    query(getRoutinesAcrossProjects, { entities: ["Routine", "RoutineRun", "Project"] }),
    action(createRoutine, { entities: ["Routine"] }),
    action(updateRoutine, { entities: ["Routine"] }),
    action(deleteRoutine, { entities: ["Routine", "RoutineRun"] }),
    action(runRoutineNow, { entities: ["Routine", "RoutineRun", "Agent"] }),
];
