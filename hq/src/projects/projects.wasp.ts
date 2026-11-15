import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { BoardsPage } from "./pages/BoardsPage" with { type: "ref" };
import { RoutinesPage } from "./pages/RoutinesPage" with { type: "ref" };
import { YourTasksPage } from "./pages/YourTasksPage" with { type: "ref" };
import { ProjectsPage } from "./pages/ProjectsPage" with { type: "ref" };
import { ProjectConversationsPage } from "./pages/ProjectConversationsPage" with { type: "ref" };
import { ProjectTasksPage } from "./pages/ProjectTasksPage" with { type: "ref" };
import { ProjectBoardsPage } from "./pages/ProjectBoardsPage" with { type: "ref" };
import { ProjectSettingsAddress } from "./pages/ProjectSettingsAddress" with { type: "ref" };
import { BoardPage } from "./pages/BoardPage" with { type: "ref" };
import { TaskPage as ProjectTaskPage } from "./pages/TaskPage" with { type: "ref" };
import { TaskSessionPage } from "./pages/TaskSessionPage" with { type: "ref" };
import { getProjects, getProject, getProjectByKey, getTaskByKey, getBoards, getBoard, getTasks, getTask, getTaskComments, getTaskAttachments, getAllBoards, getAllTasks, getActiveTaskCount } from "./queries" with { type: "ref" };
import { getProjectCards } from "./projectCardQueries" with { type: "ref" };
import { getProjectBoards } from "./boardOperations" with { type: "ref" };
import { updateTaskPlan, getMilestones, createMilestone, updateMilestone, deleteMilestone } from "./planOperations" with { type: "ref" };
import { getTimeline } from "./timeline" with { type: "ref" };
import { getMyTasks } from "./myTasksQueries" with { type: "ref" };
import { getTaskList, getMyTaskList } from "./taskList/taskListQuery" with { type: "ref" };
import { getMyPersonalProject } from "./personalProjectQueries" with { type: "ref" };
import { createPersonalProject } from "./personalProjectActions" with { type: "ref" };
import { getOrgArchiveSetting, updateOrgArchiveSetting, getProjectArchiveSetting, setProjectArchiveSetting } from "./finishedArchive/archiveActions" with { type: "ref" };
import { addAgentToProject, removeAgentFromProject, createProject, updateProject, deleteProject, createTask, updateTask, runTask, stopTask, dismissTaskRun, deleteTask, archiveTask, moveTaskToColumn, unarchiveTask, addTaskComment, uploadTaskAttachment } from "./actions" with { type: "ref" };
import { getProjectMembers, listPeopleForProject } from "./memberQueries" with { type: "ref" };
import { addProjectMember, setProjectMemberRole, removeProjectMember, setProjectAccessLevel, joinProject, leaveProject } from "./memberActions" with { type: "ref" };
import { getProjectPreview, getProjectPanelRows } from "./projectPreview" with { type: "ref" };
import { getProjectPeople, getProjectPerson } from "./projectPeopleQueries" with { type: "ref" };
import { getProjectMemberList } from "./memberListQuery" with { type: "ref" };
import { getTaskOnBehalfOf, setTaskOnBehalfOf } from "./onBehalfOfOperations" with { type: "ref" };
import { setProjectLead } from "./projectLead" with { type: "ref" };
import { stopPlaceRuns } from "./placeRunStop" with { type: "ref" };
import { getAgentStartPlan, startAgentInProject, startAllAgents, stopAgentInProject } from "./agentLineOperations" with { type: "ref" };
import { getTaskActivity } from "./taskActivityQueries" with { type: "ref" };
import { NewTaskPage } from "./pages/NewTaskPage" with { type: "ref" };
import { getRoutineRunFacts } from "./routines/routineRunFacts" with { type: "ref" };
import { NewRoutinePage } from "./routines/NewRoutinePage" with { type: "ref" };
import { getBoardViews, getBoardViewsAcrossProjects, getBoardChoices, getBoardView, dropOnBoard, saveBoardView, updateBoardView, duplicateBoardView, deleteBoardView } from "./boardViewOperations" with { type: "ref" };
import { getCustomFields, getCustomFieldUse, createCustomField, renameCustomField, reorderCustomFields, archiveCustomField, deleteCustomField, addFieldOption, updateFieldOption, reorderFieldOptions, removeFieldOption, getTaskFieldValues, setTaskFieldValue } from "./fieldOperations" with { type: "ref" };
import { getProjectSprints, getProjectSprintTasks, getSprintPlanning, startSprints, planNextSprint, setSprintLength, updateProjectSprint, addTasksToSprint, removeTasksFromSprint, finishProjectSprint } from "./sprintOperations" with { type: "ref" };
import { NewTaskTypePage } from "./pages/settings/types/NewTaskTypePage" with { type: "ref" };
import { TypeColumnsPage } from "./pages/settings/types/TypeColumnsPage" with { type: "ref" };
import { PlanSprintPage } from "./sprints/PlanSprintPage" with { type: "ref" };
import { PublishTaskTemplatePage } from "./pages/settings/types/PublishTaskTemplatePage" with { type: "ref" };
import { getTaskTypeUse } from "./taskTypeUse" with { type: "ref" };
import { moveTask, getTaskTypes, createTaskType, updateTaskType, reorderTaskTypes, archiveTaskType, deleteTaskType, addTypeColumn, updateTypeColumn, reorderTypeColumns, setDefaultTypeColumn, getTypeColumnTasks, moveTypeColumnToState, removeTypeColumn } from "./taskTypeOperations" with { type: "ref" };

export const projectsSpec: Spec = [
    route("OrgBoardsRoute", "/boards", page(BoardsPage, { authRequired: true })),
    route("OrgRoutinesRoute", "/routines", page(RoutinesPage, { authRequired: true })),
    route("OrgTasksRoute", "/tasks", page(YourTasksPage, { authRequired: true })),
    route("ProjectsRoute", "/projects", page(ProjectsPage, { authRequired: true })),
    route("ProjectDetailRoute", "/projects/:key", page(ProjectConversationsPage, { authRequired: true })),
    route("ProjectTasksRoute", "/projects/:key/tasks", page(ProjectTasksPage, { authRequired: true })),
    route("ProjectNewTaskRoute", "/projects/:key/tasks/new", page(NewTaskPage, { authRequired: true })),
    route("ProjectNewRoutineRoute", "/projects/:key/routines/new", page(NewRoutinePage, { authRequired: true })),
    route("ProjectBoardsRoute", "/projects/:key/boards", page(ProjectBoardsPage, { authRequired: true })),
    route("ProjectSettingsRoute", "/projects/:key/settings", page(ProjectSettingsAddress, { authRequired: true })),
    route("ProjectNewTaskTypeRoute", "/projects/:key/settings/types/new", page(NewTaskTypePage, { authRequired: true })),
    route("ProjectPublishTaskTemplateRoute", "/projects/:key/settings/types/publish", page(PublishTaskTemplatePage, { authRequired: true })),
    route("ProjectTaskTypeRoute", "/projects/:key/settings/types/:typeId", page(TypeColumnsPage, { authRequired: true })),
    route("ProjectPlanSprintRoute", "/projects/:key/sprints/:sprintId/plan", page(PlanSprintPage, { authRequired: true })),
    route("BoardRoute", "/projects/:key/boards/:boardId", page(BoardPage, { authRequired: true })),
    route("ProjectTaskRoute", "/tasks/:taskKey", page(ProjectTaskPage, { authRequired: true })),
    route("ProjectTaskSessionRoute", "/tasks/:taskKey/session", page(TaskSessionPage, { authRequired: true })),
    query(getProjects, { entities: ["Project", "Board", "Task", "Product", "Program", "ProjectMember"] }),
    query(getProjectCards, { entities: ["Project", "Task", "ProjectMember"] }),
    query(getMyPersonalProject, { entities: ["Project"] }),
    query(getProject, { entities: ["Project", "Board", "Task", "Agent", "Product", "Program"] }),
    query(getProjectByKey, { entities: ["Project", "Board", "Task", "Agent", "Product", "Program"] }),
    query(getTaskByKey, { entities: ["Project", "Task"] }),
    query(getBoards, { entities: ["Board", "Project", "Task", "TaskType", "TypeColumn", "CustomField", "FieldOption", "TaskFieldValue", "TaskActivity", "Sprint"] }),
    query(getBoard, { entities: ["Board", "Project", "Task", "Agent", "TaskType", "TypeColumn", "CustomField", "FieldOption", "TaskFieldValue", "Sprint"] }),
    query(getProjectBoards, { entities: ["Board", "Task", "TaskType", "TypeColumn", "CustomField", "FieldOption", "TaskFieldValue", "TaskActivity", "Sprint"] }),
    query(getMilestones, { entities: ["Milestone", "Task"] }),
    query(getTimeline, { entities: ["Project", "TaskType", "Sprint", "Task", "Milestone"] }),
    query(getTasks, { entities: ["Task", "Agent"] }),
    query(getTask, { entities: ["Task", "Agent"] }),
    query(getTaskComments, { entities: ["TaskComment", "Agent"] }),
    query(getTaskActivity, { entities: ["TaskActivity", "Agent"] }),
    query(getTaskAttachments, { entities: ["TaskAttachment"] }),
    query(getAllBoards, { entities: ["Board", "Project", "Task", "TaskType", "TypeColumn", "CustomField", "FieldOption", "TaskFieldValue", "TaskActivity", "Sprint"] }),
    query(getAllTasks, { entities: ["Task", "Agent", "Project"] }),
    query(getMyTasks, { entities: ["Task", "Agent", "Project"] }),
    query(getTaskList, { entities: ["Task", "Agent", "Project", "Milestone"] }),
    query(getMyTaskList, { entities: ["Task", "Agent", "Project", "Milestone"] }),
    query(getActiveTaskCount, { entities: ["Task"] }),
    query(getOrgArchiveSetting, { entities: ["Org"] }),
    action(updateOrgArchiveSetting, { entities: ["Org", "UserSettings"] }),
    query(getProjectArchiveSetting, { entities: ["Org", "Project", "ProjectMember"] }),
    action(setProjectArchiveSetting, { entities: ["Org", "Project", "ProjectMember"] }),
    query(getProjectMembers, { entities: ["ProjectMember", "Project", "User"] }),
    query(getProjectPreview, { entities: ["Project", "ProjectMember", "ProjectAgent", "Task", "User"] }),
    query(getProjectPanelRows, { entities: ["Project", "ProjectMember", "ProjectAgent", "User"] }),
    query(getProjectPeople, { entities: ["Project", "ProjectMember", "Task", "User", "UserSettings"] }),
    query(getProjectPerson, { entities: ["Project", "ProjectMember", "Task", "User", "UserSettings"] }),
    query(getProjectMemberList, { entities: ["Project", "ProjectMember", "ProjectAgent", "ProjectTeam", "Team", "Task", "User"] }),
    action(joinProject, { entities: ["ProjectMember", "Project"] }),
    action(leaveProject, { entities: ["ProjectMember", "Project", "Task"] }),
    query(listPeopleForProject, { entities: ["ProjectMember", "Project", "User", "UserSettings"] }),
    action(addProjectMember, { entities: ["ProjectMember", "Project", "UserSettings"] }),
    action(setProjectMemberRole, { entities: ["ProjectMember", "Project", "UserSettings"] }),
    action(removeProjectMember, { entities: ["ProjectMember", "Project", "UserSettings", "Task", "TaskComment"] }),
    action(setProjectAccessLevel, { entities: ["Project", "ProjectMember", "Task"] }),
    action(setProjectLead, { entities: ["Project", "ProjectMember"] }),
    action(addAgentToProject, { entities: ["ProjectAgent", "Project", "ProjectMember"] }),
    action(removeAgentFromProject, { entities: ["ProjectAgent", "Project", "ProjectMember", "Task", "Routine"] }),
    action(createPersonalProject, { entities: ["Project", "ProjectMember", "ExecutionSite", "UserStoragePlacement"] }),
    action(createProject, { entities: ["Project", "BillingProfile", "Product", "Program", "ExecutionSite", "ProjectMember", "UserSettings"] }),
    action(updateProject, { entities: ["Project", "Product", "Program", "ProjectMember", "UserSettings"] }),
    action(deleteProject, { entities: ["Project", "Board", "Task"] }),
    action(updateTaskPlan, { entities: ["Task", "Milestone"] }),
    action(createMilestone, { entities: ["Milestone"] }),
    action(updateMilestone, { entities: ["Milestone"] }),
    action(deleteMilestone, { entities: ["Milestone"] }),
    action(createTask, { entities: ["Task"] }),
    action(updateTask, { entities: ["Task", "Agent"] }),
    action(runTask, { entities: ["Task", "Agent"] }),
    action(stopTask, { entities: ["Task"] }),
    action(stopPlaceRuns, { entities: ["Task", "Project", "AgentSession"] }),
    query(getAgentStartPlan, { entities: ["Task", "Project", "ProjectAgent", "Agent"] }),
    action(startAgentInProject, { entities: ["Task", "Agent"] }),
    action(startAllAgents, { entities: ["Task", "Agent"] }),
    action(stopAgentInProject, { entities: ["Task", "Project", "AgentSession", "TaskActivity"] }),
    action(dismissTaskRun, { entities: ["Task"] }),
    query(getTaskOnBehalfOf, { entities: ["Task", "ProjectMember", "User"] }),
    action(setTaskOnBehalfOf, { entities: ["Task", "TaskComment"] }),
    action(deleteTask, { entities: ["Task"] }),
    action(archiveTask, { entities: ["Task"] }),
    action(moveTaskToColumn, { entities: ["Task"] }),
    action(unarchiveTask, { entities: ["Task"] }),
    action(addTaskComment, { entities: ["TaskComment", "Agent"] }),
    action(uploadTaskAttachment, { entities: ["Task", "TaskAttachment"] }),
    // A task's place in the plan, and the project's task types and their columns (adr-0174).
    action(moveTask, { entities: ["Task", "TaskType", "TypeColumn"] }),
    query(getTaskTypes, { entities: ["TaskType", "TypeColumn"] }),
    query(getTaskTypeUse, { entities: ["TaskType", "Task", "Board", "AssetVersion", "Asset"] }),
    action(createTaskType, { entities: ["TaskType", "TypeColumn"] }),
    action(updateTaskType, { entities: ["TaskType"] }),
    action(reorderTaskTypes, { entities: ["TaskType"] }),
    action(archiveTaskType, { entities: ["TaskType", "Task"] }),
    action(deleteTaskType, { entities: ["TaskType", "Task"] }),
    action(addTypeColumn, { entities: ["TaskType", "TypeColumn"] }),
    action(updateTypeColumn, { entities: ["TypeColumn"] }),
    action(reorderTypeColumns, { entities: ["TypeColumn"] }),
    action(setDefaultTypeColumn, { entities: ["TypeColumn"] }),
    query(getTypeColumnTasks, { entities: ["TypeColumn", "Task"] }),
    action(moveTypeColumnToState, { entities: ["TypeColumn", "Task"] }),
    action(removeTypeColumn, { entities: ["TypeColumn", "Task"] }),
    // Boards as saved views (adr-0176), custom fields (spec D4), and the project's sprints (D8, D13).
    query(getBoardViews, { entities: ["Board", "Task", "TaskType", "TypeColumn", "CustomField", "FieldOption", "TaskFieldValue", "TaskActivity", "Sprint"] }),
    query(getBoardViewsAcrossProjects, { entities: ["Project", "Board", "Task", "TaskType", "TypeColumn", "CustomField", "FieldOption", "TaskFieldValue", "TaskActivity", "Sprint"] }),
    query(getBoardChoices, { entities: ["TaskType", "TypeColumn", "CustomField", "FieldOption", "Task", "ProjectAgent", "Agent", "Sprint"] }),
    query(getBoardView, { entities: ["Board", "Task", "TaskType", "TypeColumn", "CustomField", "FieldOption", "TaskFieldValue", "Sprint", "Agent"] }),
    action(dropOnBoard, { entities: ["Board", "Task", "TaskType", "TypeColumn", "CustomField", "FieldOption", "TaskFieldValue", "Sprint"] }),
    action(saveBoardView, { entities: ["Board", "TaskType", "CustomField"] }),
    action(updateBoardView, { entities: ["Board"] }),
    action(duplicateBoardView, { entities: ["Board"] }),
    action(deleteBoardView, { entities: ["Board", "Task"] }),
    query(getCustomFields, { entities: ["CustomField", "FieldOption"] }),
    query(getCustomFieldUse, { entities: ["CustomField", "TaskFieldValue", "Board"] }),
    action(createCustomField, { entities: ["CustomField", "FieldOption"] }),
    action(renameCustomField, { entities: ["CustomField"] }),
    action(reorderCustomFields, { entities: ["CustomField"] }),
    action(archiveCustomField, { entities: ["CustomField"] }),
    action(deleteCustomField, { entities: ["CustomField", "FieldOption", "TaskFieldValue", "Board"] }),
    action(addFieldOption, { entities: ["CustomField", "FieldOption"] }),
    action(updateFieldOption, { entities: ["FieldOption"] }),
    action(reorderFieldOptions, { entities: ["FieldOption"] }),
    action(removeFieldOption, { entities: ["FieldOption", "TaskFieldValue"] }),
    query(getTaskFieldValues, { entities: ["Task", "TaskFieldValue"] }),
    action(setTaskFieldValue, { entities: ["Task", "CustomField", "FieldOption", "TaskFieldValue"] }),
    query(getProjectSprints, { entities: ["Sprint", "Task"] }),
    query(getProjectSprintTasks, { entities: ["Sprint", "Task", "Agent"] }),
    query(getSprintPlanning, { entities: ["Task", "TaskType", "TypeColumn", "Agent"] }),
    action(startSprints, { entities: ["Sprint"] }),
    action(planNextSprint, { entities: ["Sprint"] }),
    action(setSprintLength, { entities: ["Sprint"] }),
    action(updateProjectSprint, { entities: ["Sprint"] }),
    action(addTasksToSprint, { entities: ["Sprint", "Task", "TaskType", "TypeColumn"] }),
    action(removeTasksFromSprint, { entities: ["Sprint", "Task"] }),
    action(finishProjectSprint, { entities: ["Sprint", "Task"] }),
    query(getRoutineRunFacts, { entities: ["Routine", "RoutineRun", "Project"] }),
];
