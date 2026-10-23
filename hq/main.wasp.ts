/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// hq's Wasp declarations. The DOM libraries above are for the client sources this file reference-imports,
// which tsconfig.wasp.json (limited by Wasp to the ES2025 lib) would otherwise type-check without them.
import { api, app } from "@wasp.sh/spec";
import { healthHandler as healthApi } from "./src/server/apis" with { type: "ref" };
import { mcpHandler as mcpApi } from "./src/server/mcp/handler" with { type: "ref" };
import { jwksHandler as jwksApi, mintSiteTokenHandler as mintSiteTokenApi, renewCapabilityHandler as renewCapabilityApi } from "./src/server/identity/identityApi" with { type: "ref" };
import { dataHandler as dataApi } from "./src/server/controlplane/dataApi" with { type: "ref" };
import { refuseSignup } from "./src/auth/refuseSignup" with { type: "ref" };
import { refuseLogin } from "./src/auth/refuseLogin" with { type: "ref" };
import { webSocketFn } from "./src/server/socket" with { type: "ref" };
import { setupClient } from "./src/queryClient" with { type: "ref" };
import { App } from "./src/App" with { type: "ref" };
import { setupServer } from "./src/server/setup" with { type: "ref" };
import { middlewareConfig } from "./src/server/middleware" with { type: "ref" };
import { seed } from "./src/server/seed" with { type: "ref" };
import { adminSpec } from "./src/admin/admin.wasp";
import { agentsSpec } from "./src/agents/agents.wasp";
import { authSpec } from "./src/auth/auth.wasp";
import { billingSpec } from "./src/billing/billing.wasp";
import { automationSpec } from "./src/automation/automation.wasp";
import { chatSpec } from "./src/chat/chat.wasp";
import { cloudSpec } from "./src/cloud/cloud.wasp";
import { connectionsSpec } from "./src/connections/connections.wasp";
import { conversationsSpec } from "./src/conversations/conversations.wasp";
import { dashboardSpec } from "./src/dashboard/dashboard.wasp";
import { fleetSpec } from "./src/fleet/fleet.wasp";
import { diagnosticsSpec } from "./src/diagnostics/diagnostics.wasp";
import { githubSpec } from "./src/github/github.wasp";
import { homeSpec } from "./src/home/home.wasp";
import { librarySpec } from "./src/library/library.wasp";
import { memorySpec } from "./src/memory/memory.wasp";
import { mobileSpec } from "./src/mobile/mobile.wasp";
import { modelAccessSpec } from "./src/model-access/model-access.wasp";
import { modelsSettingsSpec } from "./src/models-settings/models-settings.wasp";
import { notificationsSpec } from "./src/notifications/notifications.wasp";
import { setupSpec } from "./src/setup/setup.wasp";
import { onboardingSpec } from "./src/onboarding/onboarding.wasp";
import { orgSpec } from "./src/org/org.wasp";
import { pinsSpec } from "./src/pins/pins.wasp";
import { previewSpec } from "./src/preview/preview.wasp";
import { productsSpec } from "./src/products/products.wasp";
import { projectsSpec } from "./src/projects/projects.wasp";
import { providersSpec } from "./src/providers/providers.wasp";
import { runsSpec } from "./src/runs/runs.wasp";
import { sessionsSpec } from "./src/sessions/sessions.wasp";
import { settingsSpec } from "./src/settings/settings.wasp";
import { sitesSpec } from "./src/sites/sites.wasp";
import { storageSpec } from "./src/storage/storage.wasp";
import { voiceSpec } from "./src/voice/voice.wasp";

export default app({
  name: "agenthixHq",
  wasp: { version: "^0.25.0" },
  title: "Agenthix",
  head: [
    "<link rel='icon' href='/favicon.ico' sizes='48x48' />",
    "<link rel='icon' href='/favicon.svg' type='image/svg+xml' />",
    "<link rel='apple-touch-icon' href='/apple-touch-icon.png' />",
    "<link rel='preconnect' href='https://fonts.googleapis.com' />",
    "<link rel='preconnect' href='https://fonts.gstatic.com' crossOrigin='' />",
  ],
  auth: {
    userEntity: "User",
    methods: { usernameAndPassword: {} },
    onAuthFailedRedirectTo: "/login",
    // hq creates every account itself; the framework's own sign-up route is refused (R-194)
    onBeforeSignup: refuseSignup,
    // Someone who has left the organisation cannot sign in (adr-0100)
    onBeforeLogin: refuseLogin,
  },
  webSocket: { fn: webSocketFn, autoConnect: true },
  client: { setupFn: setupClient, rootComponent: App },
  server: { setupFn: setupServer, middlewareConfigFn: middlewareConfig },
  db: { seeds: [seed] },
  spec: [
    api("GET", "/health", healthApi, { auth: false }),
    api("POST", "/mcp", mcpApi, { auth: false }),
    api("GET", "/.well-known/jwks.json", jwksApi, { auth: false }),
    api("POST", "/api/auth/site-token", mintSiteTokenApi, { auth: true, entities: ["UserSettings", "Org"] }),
    api("POST", "/api/v1/capabilities/renew", renewCapabilityApi, { auth: false }),
    api("POST", "/api/v1/data", dataApi, { auth: false }),
    agentsSpec,
    authSpec,
    billingSpec,
    automationSpec,
    chatSpec,
    cloudSpec,
    connectionsSpec,
    conversationsSpec,
    dashboardSpec,
    fleetSpec,
    diagnosticsSpec,
    githubSpec,
    homeSpec,
    librarySpec,
    memorySpec,
    mobileSpec,
    modelAccessSpec,
    modelsSettingsSpec,
    notificationsSpec,
    setupSpec,
    onboardingSpec,
    orgSpec,
    adminSpec,
    pinsSpec,
    previewSpec,
    productsSpec,
    projectsSpec,
    providersSpec,
    runsSpec,
    sessionsSpec,
    settingsSpec,
    sitesSpec,
    storageSpec,
    voiceSpec,
  ],
});
