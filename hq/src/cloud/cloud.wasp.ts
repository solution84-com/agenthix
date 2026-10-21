import { action, query, type Spec } from "@wasp.sh/spec";
import {
    getMyCloudSignIn, askForCloudSignIn, getWhereHqRuns, getMyCloudOffers, dismissCloudOffer,
} from "./cloudForMembers" with { type: "ref" };

// What hq's screens show of Agenthix Cloud to its people (pre-release spec part D). The sign-in and linking APIs are the auth feature's.
export const cloudSpec: Spec = [
    query(getMyCloudSignIn, { entities: ["CloudAccountLink", "CloudSignInAsk"] }),
    query(getWhereHqRuns, { entities: [] }),
    query(getMyCloudOffers, { entities: ["User", "OfferDismissal"] }),
    action(askForCloudSignIn, { entities: ["CloudSignInAsk"] }),
    action(dismissCloudOffer, { entities: ["User", "OfferDismissal"] }),
];
