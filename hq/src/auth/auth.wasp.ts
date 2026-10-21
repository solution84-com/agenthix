import { action, api, page, query, route, type Spec } from "@wasp.sh/spec";
import { LoginPage } from "./pages/LoginPage" with { type: "ref" };
import { InvitePage } from "./pages/InvitePage" with { type: "ref" };
import { ResetPasswordPage } from "./pages/ResetPasswordPage" with { type: "ref" };
import { bootstrapStatusHandler as bootstrapStatusApi, validateInviteHandler as validateInviteApi, acceptInviteApiHandler as acceptInviteApi } from "./api" with { type: "ref" };
import { readPasswordResetHandler as readPasswordResetApi, completePasswordResetHandler as completePasswordResetApi } from "./passwordResetApi" with { type: "ref" };
import { createInvite, revokeInvite } from "./actions" with { type: "ref" };
import { createPasswordResetLink } from "./passwordReset" with { type: "ref" };
import { listInvites } from "./queries" with { type: "ref" };
import { changePasswordHandler as changePasswordApi } from "./changePassword" with { type: "ref" };
import { CloudReturnPage } from "./pages/CloudReturnPage" with { type: "ref" };
import {
    cloudSignInStatusHandler as cloudSignInStatusApi, startCloudSignInHandler as startCloudSignInApi,
    finishCloudSignInHandler as finishCloudSignInApi, cloudLinkHandler as cloudLinkApi,
    unlinkCloudAccountHandler as unlinkCloudAccountApi,
} from "../cloud/signInApi" with { type: "ref" };

export const authSpec: Spec = [
    route("LoginRoute", "/login", page(LoginPage)),
    route("InviteRoute", "/invite/:token?", page(InvitePage)),
    route("ResetPasswordRoute", "/reset-password/:token?", page(ResetPasswordPage)),
    // Where Agenthix Cloud sends a person back to after signing in there (core's CLOUD_SIGN_IN_CALLBACK_PATH).
    route("CloudReturnRoute", "/login/cloud", page(CloudReturnPage)),
    api("GET", "/api/auth/bootstrap-status", bootstrapStatusApi, { auth: false }),
    api("POST", "/api/auth/validate-invite", validateInviteApi, { auth: false }),
    // auth: true only so a signed-in caller's session is seen and refused; no session is needed.
    api("POST", "/api/auth/accept-invite", acceptInviteApi, { auth: true }),
    api("POST", "/api/auth/password-reset/read", readPasswordResetApi, { auth: false }),
    api("POST", "/api/auth/password-reset", completePasswordResetApi, { auth: true }),
    api("POST", "/api/auth/change-password", changePasswordApi, { auth: true }),
    api("GET", "/api/auth/cloud/status", cloudSignInStatusApi, { auth: false }),
    // auth: true so linking sees who is signed in; signing in needs no session.
    api("POST", "/api/auth/cloud/start", startCloudSignInApi, { auth: true }),
    api("POST", "/api/auth/cloud/finish", finishCloudSignInApi, { auth: true }),
    api("GET", "/api/auth/cloud/link", cloudLinkApi, { auth: true }),
    api("POST", "/api/auth/cloud/unlink", unlinkCloudAccountApi, { auth: true }),
    action(createInvite, { entities: ["Invite", "UserSettings", "Project"] }),
    action(revokeInvite, { entities: ["Invite", "UserSettings"] }),
    action(createPasswordResetLink, { entities: ["PasswordReset", "User", "UserSettings"] }),
    query(listInvites, { entities: ["Invite", "User", "UserSettings"] }),
];
