import { action, query, type Spec } from "@wasp.sh/spec";
import {
    getMyCloudSignIn, askForCloudSignIn, getWhereHqRuns, getMyCloudOffers, dismissCloudOffer,
} from "./cloudForMembers" with { type: "ref" };
import { getHqCloudConnection, connectHqToCloud, disconnectHqFromCloud } from "./adminCloud" with { type: "ref" };

// What hq's screens show of Agenthix Cloud to its people (pre-release spec part D). The sign-in and linking APIs are the auth feature's.
export const cloudSpec: Spec = [
    query(getMyCloudSignIn, { entities: ["CloudAccountLink", "CloudSignInAsk"] }),
    query(getWhereHqRuns, { entities: [] }),
    query(getMyCloudOffers, { entities: ["User", "OfferDismissal"] }),
    action(askForCloudSignIn, { entities: ["CloudSignInAsk"] }),
    // Connecting hq to Cloud: organisation admins, in setup and on the AI page.
    query(getHqCloudConnection, { entities: [] }),
    action(connectHqToCloud, { entities: ["AiProvider", "AiProviderRecord"] }),
    action(disconnectHqFromCloud, { entities: ["AiProvider", "AiProviderRecord"] }),
    action(dismissCloudOffer, { entities: ["User", "OfferDismissal"] }),
];
