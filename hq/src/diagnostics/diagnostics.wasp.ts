import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { getDiagnosticsHealth, checkDiagnosticsHealthNow, getRecentErrors, getDiagnosticsSummary } from "./operations" with { type: "ref" };
import { getLogSources, getLogs, downloadLogs, buildSupportBundle } from "./logOperations" with { type: "ref" };
import { DiagnosticsPage } from "./pages/DiagnosticsPage" with { type: "ref" };
import { LogsPage } from "./pages/LogsPage" with { type: "ref" };
import { BundlePage } from "./pages/BundlePage" with { type: "ref" };

export const diagnosticsSpec: Spec = [
    route("InfrastructureDiagnosticsRoute", "/admin/infrastructure/diagnostics", page(DiagnosticsPage, { authRequired: true })),
    route("InfrastructureLogsRoute", "/admin/infrastructure/diagnostics/logs", page(LogsPage, { authRequired: true })),
    route("InfrastructureBundleRoute", "/admin/infrastructure/diagnostics/bundle", page(BundlePage, { authRequired: true })),
    query(getDiagnosticsHealth, { entities: ["UserSettings", "ExecutionSite"] }),
    action(checkDiagnosticsHealthNow, { entities: ["UserSettings", "ExecutionSite"] }),
    query(getRecentErrors, { entities: ["UserSettings", "RecordedError"] }),
    query(getDiagnosticsSummary, { entities: ["UserSettings", "RecordedError", "ExecutionSite"] }),
    query(getLogSources, { entities: ["UserSettings", "ExecutionSite"] }),
    query(getLogs, { entities: ["UserSettings", "ExecutionSite"] }),
    action(downloadLogs, { entities: ["UserSettings", "ExecutionSite"] }),
    action(buildSupportBundle, { entities: ["UserSettings", "ExecutionSite", "RecordedError"] }),
];
