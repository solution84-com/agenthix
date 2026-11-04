import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { LibraryPage } from "./pages/LibraryPage" with { type: "ref" };
import { getBoardTemplates, getBoardTemplate, getWorkforceTemplates, getWorkforceTemplate, getExistingAgentHandles, getWorkforceReviewTask, getAgentTemplates } from "./queries" with { type: "ref" };
import { createBoardTemplate, updateBoardTemplate, deleteBoardTemplate, applyWorkforceTemplate, confirmWorkforceTemplate, saveWorkforceDraft, applyAgentTemplate } from "./actions" with { type: "ref" };
import { WorkforceReviewPage } from "./pages/WorkforceReviewPage" with { type: "ref" };
import { MarketplacePage } from "./pages/MarketplacePage" with { type: "ref" };
import { assetPagesSpec } from "../assets/pages/assetPages.wasp";
import { getLibraryAssets, getMarketplace } from "./assetList/operations" with { type: "ref" };
import { getLibrary, exportLibraryItem } from "./packages/packageActions" with { type: "ref" };

export const librarySpec: Spec = [
    assetPagesSpec,
    route("LibraryRoute", "/library", page(LibraryPage, { authRequired: true })),
    route("LibraryMarketplaceRoute", "/library/marketplace", page(MarketplacePage, { authRequired: true })),
    query(getLibraryAssets, { entities: ["Asset", "AssetVersion", "Draft", "DraftRevision", "AssetGrant", "TrustedPublisher", "Proposal", "Agent", "User", "UserSettings", "LibraryMaintainer", "Org", "PackageContent", "PackageFile"] }),
    query(getMarketplace, { entities: [] }),
    query(getBoardTemplates, { entities: ["Asset", "AssetVersion", "PackageContent", "PackageFile"] }),
    query(getBoardTemplate, { entities: ["Asset", "AssetVersion", "PackageContent", "PackageFile"] }),
    action(createBoardTemplate, { entities: ["Asset", "AssetVersion", "AssetPinChange", "PackageContent", "PackageFile", "Org", "TrustedPublisher", "UserSettings", "LibraryMaintainer", "User"] }),
    action(updateBoardTemplate, { entities: ["Asset", "AssetVersion", "AssetPinChange", "PackageContent", "PackageFile", "Org", "TrustedPublisher", "UserSettings", "LibraryMaintainer", "User"] }),
    action(deleteBoardTemplate, { entities: ["Asset", "AssetVersion", "AssetPinChange", "PackageContent", "PackageFile", "Org", "TrustedPublisher", "UserSettings", "LibraryMaintainer", "User"] }),
    route("WorkforceReviewRoute", "/workforce-templates/review", page(WorkforceReviewPage, { authRequired: true })),
    query(getWorkforceTemplates, { entities: ["Asset", "AssetVersion", "PackageContent", "PackageFile"] }),
    query(getWorkforceTemplate, { entities: ["Asset", "AssetVersion", "PackageContent", "PackageFile"] }),
    query(getExistingAgentHandles, { entities: ["Agent"] }),
    query(getWorkforceReviewTask, { entities: ["Task"] }),
    action(applyWorkforceTemplate, { entities: ["Agent", "Team", "Project", "Board", "Asset", "AssetVersion", "AssetPinChange", "AssetGrant", "PackageContent", "PackageFile"] }),
    action(confirmWorkforceTemplate, { entities: ["Task", "Agent", "Team", "Project", "Board", "Asset", "AssetVersion", "AssetPinChange", "AssetGrant", "PackageContent", "PackageFile"] }),
    action(saveWorkforceDraft, { entities: ["Task"] }),
    query(getAgentTemplates, { entities: ["Asset", "AssetVersion", "PackageContent", "PackageFile"] }),
    action(applyAgentTemplate, { entities: ["Asset", "AssetVersion", "AssetGrant", "PackageContent", "PackageFile", "Agent"] }),
    query(getLibrary, { entities: ["Asset", "AssetVersion", "PackageContent", "PackageFile"] }),
    action(exportLibraryItem, { entities: ["Asset", "AssetVersion", "PackageContent", "PackageFile"] }),
];
