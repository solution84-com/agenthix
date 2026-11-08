import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { LibraryPage } from "./pages/LibraryPage" with { type: "ref" };
import { getWorkforceTemplates, getWorkforceTemplate, getExistingAgentHandles, getWorkforceReviewTask, getAgentTemplates } from "./queries" with { type: "ref" };
import { applyWorkforceTemplate, confirmWorkforceTemplate, saveWorkforceDraft, applyAgentTemplate } from "./actions" with { type: "ref" };
import { WorkforceReviewPage } from "./pages/WorkforceReviewPage" with { type: "ref" };
import { MarketplacePage } from "./pages/MarketplacePage" with { type: "ref" };
import { assetPagesSpec } from "../assets/pages/assetPages.wasp";
import { getLibraryAssets, getMarketplace } from "./assetList/operations" with { type: "ref" };
import { getLibrary, exportLibraryItem } from "./packages/packageActions" with { type: "ref" };
import { getTaskTemplateInstallPlan, installTaskTemplateInProject, getNewTaskTypeChoices, createTaskTypeFromTemplate, getTaskTemplateSource, publishTaskTemplate, proposeTaskTemplate, getTaskTemplateProposal, acceptTaskTemplateProposal, rejectTaskTemplateProposal } from "./taskTemplates/templateOperations" with { type: "ref" };
import { TaskTemplateProposalPage } from "./pages/TaskTemplateProposalPage" with { type: "ref" };

const TASK_TEMPLATE_ENTITIES = [
    "Asset", "AssetVersion", "AssetPinChange", "PackageContent", "PackageFile", "Proposal", "Org", "TrustedPublisher", "User", "UserSettings",
    "LibraryMaintainer", "Project", "ProjectMember", "TaskType", "TypeColumn", "CustomField", "FieldOption", "Task", "Board",
] as const;

export const librarySpec: Spec = [
    assetPagesSpec,
    route("LibraryRoute", "/library", page(LibraryPage, { authRequired: true })),
    route("LibraryMarketplaceRoute", "/library/marketplace", page(MarketplacePage, { authRequired: true })),
    query(getLibraryAssets, { entities: ["Asset", "AssetVersion", "Draft", "DraftRevision", "AssetGrant", "TrustedPublisher", "Proposal", "Agent", "User", "UserSettings", "LibraryMaintainer", "Org", "PackageContent", "PackageFile"] }),
    query(getMarketplace, { entities: [] }),
    route("WorkforceReviewRoute", "/workforce-templates/review", page(WorkforceReviewPage, { authRequired: true })),
    query(getWorkforceTemplates, { entities: ["Asset", "AssetVersion", "PackageContent", "PackageFile"] }),
    query(getWorkforceTemplate, { entities: ["Asset", "AssetVersion", "PackageContent", "PackageFile"] }),
    query(getExistingAgentHandles, { entities: ["Agent"] }),
    query(getWorkforceReviewTask, { entities: ["Task"] }),
    action(applyWorkforceTemplate, { entities: ["Agent", "Team", "Project", "Board", "TaskType", "TypeColumn", "CustomField", "FieldOption", "Asset", "AssetVersion", "AssetPinChange", "AssetGrant", "PackageContent", "PackageFile"] }),
    action(confirmWorkforceTemplate, { entities: ["Task", "Agent", "Team", "Project", "Board", "TaskType", "TypeColumn", "CustomField", "FieldOption", "Asset", "AssetVersion", "AssetPinChange", "AssetGrant", "PackageContent", "PackageFile"] }),
    action(saveWorkforceDraft, { entities: ["Task"] }),
    query(getAgentTemplates, { entities: ["Asset", "AssetVersion", "PackageContent", "PackageFile"] }),
    action(applyAgentTemplate, { entities: ["Asset", "AssetVersion", "AssetGrant", "PackageContent", "PackageFile", "Agent"] }),
    query(getLibrary, { entities: ["Asset", "AssetVersion", "PackageContent", "PackageFile"] }),
    action(exportLibraryItem, { entities: ["Asset", "AssetVersion", "PackageContent", "PackageFile"] }),
    route("TaskTemplateProposalRoute", "/library/task-template-proposals/:proposalId", page(TaskTemplateProposalPage, { authRequired: true })),
    query(getTaskTemplateInstallPlan, { entities: [...TASK_TEMPLATE_ENTITIES] }),
    action(installTaskTemplateInProject, { entities: [...TASK_TEMPLATE_ENTITIES] }),
    query(getNewTaskTypeChoices, { entities: [...TASK_TEMPLATE_ENTITIES] }),
    action(createTaskTypeFromTemplate, { entities: [...TASK_TEMPLATE_ENTITIES] }),
    query(getTaskTemplateSource, { entities: [...TASK_TEMPLATE_ENTITIES] }),
    action(publishTaskTemplate, { entities: [...TASK_TEMPLATE_ENTITIES] }),
    action(proposeTaskTemplate, { entities: [...TASK_TEMPLATE_ENTITIES] }),
    query(getTaskTemplateProposal, { entities: [...TASK_TEMPLATE_ENTITIES] }),
    action(acceptTaskTemplateProposal, { entities: [...TASK_TEMPLATE_ENTITIES] }),
    action(rejectTaskTemplateProposal, { entities: [...TASK_TEMPLATE_ENTITIES] }),
];
