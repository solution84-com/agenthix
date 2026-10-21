import { page, query, route, type Spec } from "@wasp.sh/spec";
import { OnboardingPage } from "./pages/OnboardingPage" with { type: "ref" };
import { getOnboardingData } from "./queries" with { type: "ref" };

export const onboardingSpec: Spec = [
    route("OnboardingRoute", "/onboarding", page(OnboardingPage, { authRequired: true })),
    query(getOnboardingData, { entities: ["Org", "User", "UserSettings", "Invite", "Project", "Provider", "ModelCredential"] }),
];
