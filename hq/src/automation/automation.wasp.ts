import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { ProjectRoutinesPage } from "./pages/ProjectRoutinesPage" with { type: "ref" };
import { AutomationSettingsPage } from "./pages/AutomationSettingsPage" with { type: "ref" };
import { getOrgAutomation, updateOrgAutomation, getProjectAutomation, updateProjectAutomation, setTaskSchedule, clearTaskSchedule } from "./operations" with { type: "ref" };
import { getAutomationOutlook } from "./automationOutlook" with { type: "ref" };
import { RoutinePage } from "./pages/RoutinePage" with { type: "ref" };
import { getProjectRoutines, getRoutine } from "./routineQueries" with { type: "ref" };
import { getRoutinesAcrossProjects } from "./routinesAcross" with { type: "ref" };
import { createRoutine, makeTaskRoutine, updateRoutine, pauseRoutine, resumeRoutine, deleteRoutine, unlinkRoutineRound, runRoutineNow, skipRoutineRound } from "./routineActions" with { type: "ref" };

export const automationSpec: Spec = [
    route("ProjectRoutinesRoute", "/projects/:key/routines", page(ProjectRoutinesPage, { authRequired: true })),
    route("AutomationSettingsRoute", "/org/settings/automation", page(AutomationSettingsPage, { authRequired: true })),
    query(getOrgAutomation, { entities: ["Org"] }),
    action(updateOrgAutomation, { entities: ["Org", "ProjectAutomation", "Task"] }),
    query(getProjectAutomation, { entities: ["ProjectAutomation", "AutomationStart", "Task"] }),
    action(updateProjectAutomation, { entities: ["ProjectAutomation", "AutomationStart", "Task"] }),
    query(getAutomationOutlook, { entities: ["Task", "Routine"] }),
    action(setTaskSchedule, { entities: ["Task"] }),
    action(clearTaskSchedule, { entities: ["Task"] }),
    route("RoutineRoute", "/routines/:routineId", page(RoutinePage, { authRequired: true })),
    query(getProjectRoutines, { entities: ["Routine", "Task"] }),
    query(getRoutine, { entities: ["Routine", "Task"] }),
    query(getRoutinesAcrossProjects, { entities: ["Routine", "Task", "Project"] }),
    action(createRoutine, { entities: ["Routine", "Task"] }),
    action(makeTaskRoutine, { entities: ["Routine", "Task"] }),
    action(updateRoutine, { entities: ["Routine", "Task"] }),
    action(pauseRoutine, { entities: ["Routine", "Task"] }),
    action(resumeRoutine, { entities: ["Routine", "Task"] }),
    action(deleteRoutine, { entities: ["Routine", "Task"] }),
    action(unlinkRoutineRound, { entities: ["Routine", "Task"] }),
    action(runRoutineNow, { entities: ["Routine", "Task", "Agent"] }),
    action(skipRoutineRound, { entities: ["Routine", "Task"] }),
];
