import { page, query, route, type Spec } from "@wasp.sh/spec";
import { AssetPage } from "./asset/AssetPage" with { type: "ref" };
import { AddPage } from "./add/AddPage" with { type: "ref" };
import { getAssetPage, getAssetContent, getAssetDiff, getAssetNews } from "./asset/pageOperations" with { type: "ref" };
import { getAssetShelf } from "./add/addOperations" with { type: "ref" };
import { getPackageFiles } from "./add/packageFiles" with { type: "ref" };

const PAGE_ENTITIES = [
    "Asset", "AssetVersion", "AssetPinChange", "AssetGrant", "TrustedPublisher", "Draft", "DraftRevision", "PackageContent", "PackageFile",
    "Org", "User", "UserSettings", "LibraryMaintainer", "Agent", "Board", "Team",
] as const;

/** An asset's page and Add (skills spec part 6; boards U3, U4, U5). The fixed path `/library/add` wins over `/library/:assetId`. */
export const assetPagesSpec: Spec = [
    route("LibraryAddRoute", "/library/add", page(AddPage, { authRequired: true })),
    route("LibraryAssetRoute", "/library/:assetId", page(AssetPage, { authRequired: true })),
    query(getAssetPage, { entities: [...PAGE_ENTITIES] }),
    query(getAssetContent, { entities: [...PAGE_ENTITIES] }),
    query(getAssetDiff, { entities: [...PAGE_ENTITIES] }),
    query(getAssetNews, { entities: [...PAGE_ENTITIES] }),
    query(getAssetShelf, { entities: [...PAGE_ENTITIES] }),
    query(getPackageFiles, { entities: ["Org", "User", "UserSettings", "LibraryMaintainer"] }),
];
