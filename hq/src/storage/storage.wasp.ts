import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { ProjectFilesPage } from "./pages/ProjectFilesPage" with { type: "ref" };
import { ProjectWorkspacesPage } from "./pages/ProjectWorkspacesPage" with { type: "ref" };
import { createWorkspaceAction as createWorkspace, deleteWorkspaceAction as deleteWorkspace, setWorkspaceAllowedToolsAction as setWorkspaceAllowedTools, connectRepoAction as connectRepo, checkConnectAction as checkConnect, disconnectRepoAction as disconnectRepo } from "./actions" with { type: "ref" };
import { getRepoStateQuery as getRepoState, getMyStorageQuery as getMyStorage, getWorkspaceQuery as getWorkspace, listLocationFilesQuery as listLocationFiles } from "./queries" with { type: "ref" };
import { listArtefactsQuery as listArtefacts } from "./ownerFolderQueries" with { type: "ref" };
import {
    listKnowledgePagesQuery as listKnowledgePages, getKnowledgePageQuery as getKnowledgePage, knowledgePageVersionsQuery as knowledgePageVersions,
    recentlyDeletedKnowledgeQuery as recentlyDeletedKnowledge, searchKnowledgePagesQuery as searchKnowledgePages,
    saveKnowledgePageAction as saveKnowledgePage, moveKnowledgePageAction as moveKnowledgePage,
    deleteKnowledgePageAction as deleteKnowledgePage, restoreKnowledgeVersionAction as restoreKnowledgeVersion,
} from "../knowledge/people/operations" with { type: "ref" };
import { getWorkspacesAcrossPlacesQuery as getWorkspacesAcrossPlaces } from "./workspacesAcrossPlaces" with { type: "ref" };
import { getGitStatusQuery as getGitStatus } from "./gitStatus" with { type: "ref" };
import { getPlaceInstructions } from "./placeInstructions" with { type: "ref" };
import { WorkspacesPage } from "./pages/WorkspacesPage" with { type: "ref" };
import { WorkspaceDetailPage } from "./pages/WorkspaceDetailPage" with { type: "ref" };
import { FilesPage } from "./pages/FilesPage" with { type: "ref" };

export const storageSpec: Spec = [
    route("ProjectFilesRoute", "/projects/:key/files", page(ProjectFilesPage, { authRequired: true })),
    route("ProjectWorkspacesRoute", "/projects/:key/workspaces", page(ProjectWorkspacesPage, { authRequired: true })),
    action(createWorkspace),
    action(deleteWorkspace),
    action(setWorkspaceAllowedTools),
    action(connectRepo),
    action(checkConnect),
    action(disconnectRepo),
    query(getRepoState),
    query(getGitStatus),
    query(getMyStorage, { entities: ["Project", "Product", "Program"] }),
    query(getWorkspacesAcrossPlaces, { entities: ["Project"] }),
    query(getWorkspace, { entities: ["Project", "Product", "Program"] }),
    query(listLocationFiles),
    query(listArtefacts),
    // Knowledge, at every level (agent knowledge spec, part 5): the change record is read for who made each change.
    query(listKnowledgePages, { entities: ["KnowledgeChange"] }),
    query(getKnowledgePage, { entities: ["KnowledgeChange"] }),
    query(knowledgePageVersions, { entities: ["KnowledgeChange"] }),
    query(recentlyDeletedKnowledge, { entities: ["KnowledgeChange"] }),
    query(searchKnowledgePages),
    action(saveKnowledgePage, { entities: ["KnowledgeChange"] }),
    action(moveKnowledgePage, { entities: ["KnowledgeChange"] }),
    action(deleteKnowledgePage, { entities: ["KnowledgeChange"] }),
    action(restoreKnowledgeVersion, { entities: ["KnowledgeChange"] }),
    query(getPlaceInstructions, { entities: ["Agent", "Project"] }),
    route("WorkspacesRoute", "/workspaces", page(WorkspacesPage, { authRequired: true })),
    route("WorkspaceDetailRoute", "/workspaces/:workspaceId", page(WorkspaceDetailPage, { authRequired: true })),
    route("FilesRoute", "/files/:ownerType/:ownerId", page(FilesPage, { authRequired: true })),
];
