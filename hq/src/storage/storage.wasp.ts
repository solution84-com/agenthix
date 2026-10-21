import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { ProjectFilesPage } from "./pages/ProjectFilesPage" with { type: "ref" };
import { ProjectWorkspacesPage } from "./pages/ProjectWorkspacesPage" with { type: "ref" };
import { createWorkspaceAction as createWorkspace, deleteWorkspaceAction as deleteWorkspace, setWorkspaceAllowedToolsAction as setWorkspaceAllowedTools, connectRepoAction as connectRepo, disconnectRepoAction as disconnectRepo } from "./actions" with { type: "ref" };
import { getRepoStateQuery as getRepoState, getMyStorageQuery as getMyStorage, getWorkspaceQuery as getWorkspace, listLocationFilesQuery as listLocationFiles, getFileContentQuery as getFileContent } from "./queries" with { type: "ref" };
import { listArtefactsQuery as listArtefacts, getArtefactContentQuery as getArtefactContent, listKnowledgeQuery as listKnowledge, getKnowledgeContentQuery as getKnowledgeContent } from "./ownerFolderQueries" with { type: "ref" };
import { getWorkspacesAcrossPlacesQuery as getWorkspacesAcrossPlaces } from "./workspacesAcrossPlaces" with { type: "ref" };
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
    action(disconnectRepo),
    query(getRepoState),
    query(getMyStorage, { entities: ["Project", "Product", "Program"] }),
    query(getWorkspacesAcrossPlaces, { entities: ["Project"] }),
    query(getWorkspace, { entities: ["Project", "Product", "Program"] }),
    query(listLocationFiles),
    query(getFileContent),
    query(listArtefacts),
    query(getArtefactContent),
    query(listKnowledge),
    query(getKnowledgeContent),
    query(getPlaceInstructions, { entities: ["Agent", "Project"] }),
    route("WorkspacesRoute", "/workspaces", page(WorkspacesPage, { authRequired: true })),
    route("WorkspaceDetailRoute", "/workspaces/:workspaceId", page(WorkspaceDetailPage, { authRequired: true })),
    route("FilesRoute", "/files/:ownerType/:ownerId", page(FilesPage, { authRequired: true })),
];
