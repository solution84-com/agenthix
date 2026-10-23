import { action, api, query, type Spec } from "@wasp.sh/spec";
import {
    getBillingProfiles, getBillingProfileChoices, getProjectBilling, getUsageReport,
    createBillingProfile, renameBillingProfile, makeDefaultBillingProfile, archiveBillingProfile, setProjectBillingProfile,
    setOrganisationTimeZone, reportSpeechSession,
} from "./operations" with { type: "ref" };
import { usageExportHandler as usageExportApi } from "./exportApi" with { type: "ref" };

// Billing profiles, a project's billing and the usage report (models from one place, part 5). The ledger itself is
// written by hq's call paths, never through an operation.
export const billingSpec: Spec = [
    query(getBillingProfiles, { entities: ["BillingProfile", "Project", "UsageEntry"] }),
    query(getBillingProfileChoices, { entities: ["BillingProfile"] }),
    query(getProjectBilling, { entities: ["Project", "BillingProfile", "ProjectBillingChange"] }),
    query(getUsageReport, { entities: ["UsageEntry", "BillingProfile"] }),
    action(createBillingProfile, { entities: ["BillingProfile", "Project", "ProjectBillingChange"] }),
    action(renameBillingProfile, { entities: ["BillingProfile"] }),
    action(makeDefaultBillingProfile, { entities: ["BillingProfile"] }),
    action(archiveBillingProfile, { entities: ["BillingProfile", "Project", "ProjectBillingChange"] }),
    action(setProjectBillingProfile, { entities: ["Project", "BillingProfile", "ProjectBillingChange"] }),
    action(setOrganisationTimeZone, { entities: ["Org"] }),
    action(reportSpeechSession, { entities: ["UsageEntry"] }),
    api("GET", "/api/v1/usage/export", usageExportApi, { auth: true, entities: ["UsageEntry"] }),
];
