import { action, api, page, query, route, type Spec } from "@wasp.sh/spec";
import { MobileConnectPage } from "./pages/MobileConnectPage" with { type: "ref" };
import { ConnectMobilePage } from "./pages/ConnectMobilePage" with { type: "ref" };
import { generateMobileAuthToken, exchangeMobileAuthToken } from "./actions" with { type: "ref" };
import { getMyPhones, signOutPhone, registerPhoneSessionHandler as registerPhoneSessionApi } from "./phoneOperations" with { type: "ref" };

export const mobileSpec: Spec = [
    route("MobileConnectRoute", "/mobile-connect", page(MobileConnectPage)),
    route("ConnectMobileRoute", "/settings/mobile", page(ConnectMobilePage, { authRequired: true })),
    action(generateMobileAuthToken, { entities: ["MobileAuthToken"] }),
    action(exchangeMobileAuthToken, { entities: ["MobileAuthToken"] }),
    query(getMyPhones, { entities: ["DeviceSession"] }),
    action(signOutPhone, { entities: ["DeviceSession"] }),
    api("POST", "/api/mobile/register-session", registerPhoneSessionApi, { auth: true, entities: ["DeviceSession"] }),
];
