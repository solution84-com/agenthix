import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { BoardsRedirectPage } from "./pages/BoardsRedirectPage" with { type: "ref" };
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
import { getProjectBoards, getBoardShowAlso, getBoardSprints, getSprintTasks, archiveBoard, unarchiveBoard, moveTaskToBoard, setBoardShowAlso, renameSprint, finishSprint } from "./boardOperations" with { type: "ref" };
import { updateTaskPlan, getMilestones, createMilestone, updateMilestone, deleteMilestone } from "./planOperations" with { type: "ref" };
import { getTimeline } from "./timeline" with { type: "ref" };
import { getMyTasks } from "./myTasksQueries" with { type: "ref" };
import { getMyPersonalProject } from "./personalProjectQueries" with { type: "ref" };
import { createPersonalProject } from "./personalProjectActions" with { type: "ref" };
import { getOrgArchiveSetting, updateOrgArchiveSetting, getProjectArchiveSetting, setProjectArchiveSetting } from "./finishedArchive/archiveActions" with { type: "ref" };
import { runProject, runBoard, addAgentToProject, removeAgentFromProject, createProject, updateProject, deleteProject, createBoard, updateBoard, deleteBoard, createTask, updateTask, runTask, stopTask, dismissTaskRun, deleteTask, archiveTask, moveTaskToColumn, returnTaskToBacklog, clearTaskSession, addTaskComment, uploadTaskAttachment } from "./actions" with { type: "ref" };
import { getProjectMembers, listPeopleForProject } from "./memberQueries" with { type: "ref" };
import { addProjectMember, setProjectMemberRole, removeProjectMember, setProjectAccessLevel, joinProject, leaveProject } from "./memberActions" with { type: "ref" };
import { getProjectPreview, getProjectPanelRows } from "./projectPreview" with { type: "ref" };
import { getProjectPeople, getProjectPerson } from "./projectPeopleQueries" with { type: "ref" };
import { getTaskOnBehalfOf, setTaskOnBehalfOf } from "./onBehalfOfOperations" with { type: "ref" };
import { setProjectLead } from "./projectLead" with { type: "ref" };
import { stopPlaceRuns } from "./placeRunStop" with { type: "ref" };

export const projectsSpec: Spec = [
    route("OrgBoardsRoute", "/boards", page(BoardsRedirectPage, { authRequired: true })),
    route("OrgTasksRoute", "/tasks", page(YourTasksPage, { authRequired: true })),
    route("ProjectsRoute", "/projects", page(ProjectsPage, { authRequired: true })),
    route("ProjectDetailRoute", "/projects/:key", page(ProjectConversationsPage, { authRequired: true })),
    route("ProjectTasksRoute", "/projects/:key/tasks", page(ProjectTasksPage, { authRequired: true })),
    route("ProjectBoardsRoute", "/projects/:key/boards", page(ProjectBoardsPage, { authRequired: true })),
    route("ProjectSettingsRoute", "/projects/:key/settings", page(ProjectSettingsAddress, { authRequired: true })),
    route("BoardRoute", "/projects/:key/boards/:boardId", page(BoardPage, { authRequired: true })),
    route("ProjectTaskRoute", "/tasks/:taskKey", page(ProjectTaskPage, { authRequired: true })),
    route("ProjectTaskSessionRoute", "/tasks/:taskKey/session", page(TaskSessionPage, { authRequired: true })),
    query(getProjects, { entities: ["Project", "Board", "Task", "Product", "Program", "ProjectMember"] }),
    query(getProjectCards, { entities: ["Project", "Task", "ProjectMember"] }),
    query(getMyPersonalProject, { entities: ["Project"] }),
    query(getProject, { entities: ["Project", "Board", "Task", "Agent", "Product", "Program"] }),
    query(getProjectByKey, { entities: ["Project", "Board", "Task", "Agent", "Product", "Program"] }),
    query(getTaskByKey, { entities: ["Project", "Task"] }),
    query(getBoards, { entities: ["Board"] }),
    query(getBoard, { entities: ["Board", "Task", "Agent", "Sprint", "BoardShowAlso", "ProjectAutomation", "AutomationStart"] }),
    query(getProjectBoards, { entities: ["Board", "Task", "Sprint"] }),
    query(getBoardShowAlso, { entities: ["Board", "Task", "BoardShowAlso"] }),
    query(getBoardSprints, { entities: ["Board", "Sprint", "Task"] }),
    query(getSprintTasks, { entities: ["Board", "Sprint", "Task", "Agent"] }),
    query(getMilestones, { entities: ["Milestone", "Task"] }),
    query(getTimeline, { entities: ["Project", "Board", "Sprint", "Task", "Milestone", "Routine"] }),
    query(getTasks, { entities: ["Task", "Agent", "Board"] }),
    query(getTask, { entities: ["Task", "Agent", "Board"] }),
    query(getTaskComments, { entities: ["TaskComment", "Agent"] }),
    query(getTaskAttachments, { entities: ["TaskAttachment"] }),
    query(getAllBoards, { entities: ["Board", "Project"] }),
    query(getAllTasks, { entities: ["Task", "Agent", "Board", "Project"] }),
    query(getMyTasks, { entities: ["Task", "Agent", "Board", "Project"] }),
    query(getActiveTaskCount, { entities: ["Task"] }),
    query(getOrgArchiveSetting, { entities: ["Org"] }),
    action(updateOrgArchiveSetting, { entities: ["Org", "UserSettings"] }),
    query(getProjectArchiveSetting, { entities: ["Org", "Project", "ProjectMember"] }),
    action(setProjectArchiveSetting, { entities: ["Org", "Project", "ProjectMember"] }),
    action(runProject, { entities: ["Task", "Agent"] }),
    action(runBoard, { entities: ["Task", "Agent"] }),
    query(getProjectMembers, { entities: ["ProjectMember", "Project", "User"] }),
    query(getProjectPreview, { entities: ["Project", "ProjectMember", "ProjectAgent", "Task", "User"] }),
    query(getProjectPanelRows, { entities: ["Project", "ProjectMember", "ProjectAgent", "User"] }),
    query(getProjectPeople, { entities: ["Project", "ProjectMember", "Task", "User", "UserSettings"] }),
    query(getProjectPerson, { entities: ["Project", "ProjectMember", "Task", "User", "UserSettings"] }),
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
    action(createBoard, { entities: ["Board", "Asset", "AssetVersion", "PackageContent", "PackageFile", "Sprint"] }),
    action(updateBoard, { entities: ["Board"] }),
    action(deleteBoard, { entities: ["Board", "Task"] }),
    action(archiveBoard, { entities: ["Board"] }),
    action(unarchiveBoard, { entities: ["Board"] }),
    action(moveTaskToBoard, { entities: ["Task", "Board"] }),
    action(setBoardShowAlso, { entities: ["Board", "BoardShowAlso"] }),
    action(renameSprint, { entities: ["Sprint"] }),
    action(finishSprint, { entities: ["Board", "Sprint", "Task"] }),
    action(updateTaskPlan, { entities: ["Task", "Milestone"] }),
    action(createMilestone, { entities: ["Milestone"] }),
    action(updateMilestone, { entities: ["Milestone"] }),
    action(deleteMilestone, { entities: ["Milestone"] }),
    action(createTask, { entities: ["Task"] }),
    action(updateTask, { entities: ["Task", "Agent"] }),
    action(runTask, { entities: ["Task", "Agent"] }),
    action(stopTask, { entities: ["Task"] }),
    action(stopPlaceRuns, { entities: ["Task", "Project", "AgentSession"] }),
    action(dismissTaskRun, { entities: ["Task"] }),
    query(getTaskOnBehalfOf, { entities: ["Task", "ProjectMember", "User"] }),
    action(setTaskOnBehalfOf, { entities: ["Task", "TaskComment"] }),
    action(deleteTask, { entities: ["Task"] }),
    action(archiveTask, { entities: ["Task"] }),
    action(moveTaskToColumn, { entities: ["Task"] }),
    action(returnTaskToBacklog, { entities: ["Task"] }),
    action(clearTaskSession, { entities: ["Task", "AgentSession"] }),
    action(addTaskComment, { entities: ["TaskComment", "Agent"] }),
    action(uploadTaskAttachment, { entities: ["Task", "TaskAttachment"] }),
];
