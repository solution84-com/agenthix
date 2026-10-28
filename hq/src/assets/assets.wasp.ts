import { action, query, type Spec } from "@wasp.sh/spec";
import { previewAssetInstall, installAsset } from "./operations" with { type: "ref" };
import {
    getAssetVersions, getAssetVersionChanges, acceptAssetUpdate, rollBackAsset, installAssetVersionOnPurpose,
    getAssetDraft, saveAssetDraft, discardAssetDraft, publishAssetDraft, createSkillDraft,
    editLibraryAsset, switchToOriginalAsset, switchToOwnCopy, getAssetCopyNews,
    getAssetCredit, addAssetCredit,
    getAssetHolders, setAssetEveryAgent, addAssetToAgents, removeAssetFromAgent, removeLibraryAsset,
} from "./lifecycle/operations" with { type: "ref" };

import {
    listTrustedPublishers, addTrustedPublisher, trustPublisher, removeTrustedPublisher,
} from "./people/trustedPublishers" with { type: "ref" };
import { getAssetSettings, updateAssetSettings } from "./people/settings" with { type: "ref" };
import { listLibraryMaintainers, nameLibraryMaintainer, removeLibraryMaintainer } from "./people/maintainers" with { type: "ref" };

const INSTALL_ENTITIES = ["Asset", "AssetVersion", "AssetPinChange", "TrustedPublisher", "Org", "PackageContent"] as const;
const LIFECYCLE_ENTITIES = [
    "Asset", "AssetVersion", "AssetPinChange", "AssetGrant", "Draft", "DraftRevision", "Agent", "Org", "PackageContent",
] as const;
const PEOPLE_ENTITIES = ["TrustedPublisher", "Org", "LibraryMaintainer", "User", "UserSettings"] as const;

/** The asset layer's operations (skills spec parts 2 and 3). Stage B lanes add theirs in their own block below. */
export const assetsSpec: Spec = [
    // Installing (lane 2a): what installing would do, then installing it as confirmed.
    action(previewAssetInstall, { entities: [...INSTALL_ENTITIES] }),
    action(installAsset, { entities: [...INSTALL_ENTITIES] }),

    // The lifecycle (lane 2d): versions, drafts and publishing, own copies, credit, and which agents have it.
    query(getAssetVersions, { entities: [...LIFECYCLE_ENTITIES] }),
    query(getAssetVersionChanges, { entities: [...LIFECYCLE_ENTITIES] }),
    action(acceptAssetUpdate, { entities: [...LIFECYCLE_ENTITIES] }),
    action(rollBackAsset, { entities: [...LIFECYCLE_ENTITIES] }),
    action(installAssetVersionOnPurpose, { entities: [...INSTALL_ENTITIES] }),
    query(getAssetDraft, { entities: [...LIFECYCLE_ENTITIES] }),
    action(saveAssetDraft, { entities: [...LIFECYCLE_ENTITIES] }),
    action(discardAssetDraft, { entities: [...LIFECYCLE_ENTITIES] }),
    action(publishAssetDraft, { entities: [...LIFECYCLE_ENTITIES] }),
    action(createSkillDraft, { entities: [...LIFECYCLE_ENTITIES] }),
    action(editLibraryAsset, { entities: [...LIFECYCLE_ENTITIES] }),
    action(switchToOriginalAsset, { entities: [...LIFECYCLE_ENTITIES] }),
    action(switchToOwnCopy, { entities: [...LIFECYCLE_ENTITIES] }),
    query(getAssetCopyNews, { entities: [...LIFECYCLE_ENTITIES] }),
    query(getAssetCredit, { entities: [...LIFECYCLE_ENTITIES] }),
    action(addAssetCredit, { entities: [...LIFECYCLE_ENTITIES] }),
    query(getAssetHolders, { entities: [...LIFECYCLE_ENTITIES] }),
    action(setAssetEveryAgent, { entities: [...LIFECYCLE_ENTITIES] }),
    action(addAssetToAgents, { entities: [...LIFECYCLE_ENTITIES] }),
    action(removeAssetFromAgent, { entities: [...LIFECYCLE_ENTITIES] }),
    action(removeLibraryAsset, { entities: [...LIFECYCLE_ENTITIES] }),

    // People (lane 2e): trusted publishers (P1), the organisation's settings (P2, P3, C1, D15), Library maintainers.
    query(listTrustedPublishers, { entities: [...PEOPLE_ENTITIES] }),
    action(addTrustedPublisher, { entities: [...PEOPLE_ENTITIES] }),
    action(trustPublisher, { entities: [...PEOPLE_ENTITIES] }),
    action(removeTrustedPublisher, { entities: [...PEOPLE_ENTITIES] }),
    query(getAssetSettings, { entities: [...PEOPLE_ENTITIES] }),
    action(updateAssetSettings, { entities: [...PEOPLE_ENTITIES] }),
    query(listLibraryMaintainers, { entities: [...PEOPLE_ENTITIES] }),
    action(nameLibraryMaintainer, { entities: [...PEOPLE_ENTITIES] }),
    action(removeLibraryMaintainer, { entities: [...PEOPLE_ENTITIES] }),
];
