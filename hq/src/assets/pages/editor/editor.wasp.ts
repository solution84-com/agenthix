import { page, query, route, type Spec } from "@wasp.sh/spec";
import { EditorPage, PlaceEditorPage } from "./EditorPage" with { type: "ref" };
import { NewSkillPage } from "./NewSkillPage" with { type: "ref" };
import { getEditorView } from "./editorOperations" with { type: "ref" };

const EDITOR_ENTITIES = [
    "Asset", "AssetVersion", "AssetGrant", "Draft", "DraftRevision", "PackageContent", "PackageFile", "Org", "Agent", "User", "UserSettings",
    "LibraryMaintainer", "PlaceSkill", "PlaceSkillVersion", "Project", "ProjectMember", "TrustedPublisher",
] as const;

/**
 * The editor (skills spec part 6, board U3b): a skill's files in a tree, in View, Edit and Changes, saved as a draft and
 * published as the revision seen; and New skill. The fixed paths come before `/library/:assetId` in the Library's own
 * routes, so `/library/new-skill` is never read as an asset.
 */
export const editorSpec: Spec = [
    route("LibraryNewSkillRoute", "/library/new-skill", page(NewSkillPage, { authRequired: true })),
    route("LibraryAssetEditRoute", "/library/:assetId/edit", page(EditorPage, { authRequired: true })),
    route("LibraryPlaceSkillEditRoute", "/library/place-skills/:placeSkillId", page(PlaceEditorPage, { authRequired: true })),
    query(getEditorView, { entities: [...EDITOR_ENTITIES] }),
];
