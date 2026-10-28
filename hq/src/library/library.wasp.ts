import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { LibraryPage } from "./pages/LibraryPage" with { type: "ref" };
import { getBoardTemplates, getBoardTemplate, getWorkforceTemplates, getWorkforceTemplate, getExistingAgentHandles, getWorkforceReviewTask, getAgentTemplates } from "./queries" with { type: "ref" };
import { createBoardTemplate, updateBoardTemplate, deleteBoardTemplate, applyWorkforceTemplate, confirmWorkforceTemplate, saveWorkforceDraft, applyAgentTemplate } from "./actions" with { type: "ref" };
import { WorkforceReviewPage } from "./pages/WorkforceReviewPage" with { type: "ref" };
import { getLibrary, exportLibraryItem, importLibraryItem } from "./packages/packageActions" with { type: "ref" };

export const librarySpec: Spec = [
    route("LibraryRoute", "/library", page(LibraryPage, { authRequired: true })),
    query(getBoardTemplates, { entities: ["BoardTemplate"] }),
    query(getBoardTemplate, { entities: ["BoardTemplate"] }),
    action(createBoardTemplate, { entities: ["BoardTemplate"] }),
    action(updateBoardTemplate, { entities: ["BoardTemplate"] }),
    action(deleteBoardTemplate, { entities: ["BoardTemplate"] }),
    route("WorkforceReviewRoute", "/workforce-templates/review", page(WorkforceReviewPage, { authRequired: true })),
    query(getWorkforceTemplates, { entities: ["WorkforceTemplate"] }),
    query(getWorkforceTemplate, { entities: ["WorkforceTemplate"] }),
    query(getExistingAgentHandles, { entities: ["Agent"] }),
    query(getWorkforceReviewTask, { entities: ["Task"] }),
    action(applyWorkforceTemplate, { entities: ["WorkforceTemplate", "Agent", "Team", "Project", "Board"] }),
    action(confirmWorkforceTemplate, { entities: ["Task"] }),
    action(saveWorkforceDraft, { entities: ["Task"] }),
    query(getAgentTemplates, { entities: ["AgentTemplate"] }),
    action(applyAgentTemplate, { entities: ["AgentTemplate", "Agent"] }),
    query(getLibrary, { entities: ["AgentTemplate", "BoardTemplate", "Asset", "AssetVersion", "WorkforceTemplate"] }),
    action(exportLibraryItem, { entities: ["AgentTemplate", "BoardTemplate", "Asset", "AssetVersion", "WorkforceTemplate"] }),
    action(importLibraryItem, { entities: ["AgentTemplate", "BoardTemplate", "Asset", "AssetVersion", "AssetPinChange", "TrustedPublisher", "PackageContent", "WorkforceTemplate", "Org"] }),
];
