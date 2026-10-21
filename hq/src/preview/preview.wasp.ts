import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { OpenPreviewPage } from "./OpenPreviewPage" with { type: "ref" };
import { openPreview } from "./openPreviewAction" with { type: "ref" };
import { listPlacePreviewsQuery as listPlacePreviews } from "./placePreviewsQuery" with { type: "ref" };

export const previewSpec: Spec = [
    route("OpenPreviewRoute", "/open-preview/:previewId", page(OpenPreviewPage)),
    action(openPreview, { entities: ["PreviewSession"] }),
    query(listPlacePreviews, { entities: ["PreviewSession"] }),
];
