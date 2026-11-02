import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { FeaturesPage } from "./pages/FeaturesPage" with { type: "ref" };
import { getFeatures, setFeature } from "./operations" with { type: "ref" };

export const featuresSpec: Spec = [
    route("OrgFeaturesRoute", "/admin/settings/features", page(FeaturesPage, { authRequired: true })),
    query(getFeatures, { entities: ["Org", "UserSettings", "User"] }),
    action(setFeature, { entities: ["Org", "UserSettings", "User"] }),
];
