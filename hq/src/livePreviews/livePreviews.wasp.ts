import { action, query, type Spec } from "@wasp.sh/spec";
import {
    getLivePreviewPlacesQuery as getLivePreviewPlaces, getLivePreviewQuery as getLivePreview,
    startLivePreviewAction as startLivePreview, stopLivePreviewAction as stopLivePreview,
    resumeLivePreviewAction as resumeLivePreview, reloadLivePreviewAction as reloadLivePreview,
    setLivePreviewAutoAction as setLivePreviewAuto, markLivePreviewInUseAction as markLivePreviewInUse,
    answerLivePreviewQuestionAction as answerLivePreviewQuestion, openLiveAppAction as openLiveApp,
    runLivePreviewWorkflowAction as runLivePreviewWorkflow, startLiveAppAction as startLiveApp,
} from "./operations" with { type: "ref" };
import { getTrustedPackageScopes, setTrustedPackageScopes } from "./packageScopes" with { type: "ref" };

const LIVE_PREVIEWS = ["LivePreview", "LiveApp", "LiveAppRun", "LivePreviewGuardReport", "ExecutionSite", "WorkspaceBranch", "BranchCopy"] as const;

export const livePreviewsSpec: Spec = [
    query(getLivePreviewPlaces, { entities: [...LIVE_PREVIEWS] }),
    query(getLivePreview, { entities: [...LIVE_PREVIEWS] }),
    action(startLivePreview, { entities: [...LIVE_PREVIEWS] }),
    action(stopLivePreview, { entities: [...LIVE_PREVIEWS] }),
    action(resumeLivePreview, { entities: [...LIVE_PREVIEWS] }),
    action(reloadLivePreview, { entities: ["LivePreview"] }),
    action(setLivePreviewAuto, { entities: ["LivePreview"] }),
    // No entities: telling HQ it is in use changes nothing a screen shows, so it makes no query read again.
    action(markLivePreviewInUse, { entities: [] }),
    action(answerLivePreviewQuestion, { entities: ["LivePreview"] }),
    action(openLiveApp, { entities: [...LIVE_PREVIEWS] }),
    action(startLiveApp, { entities: ["LivePreview", "LiveApp", "LiveAppRun", "ExecutionSite"] }),
    action(runLivePreviewWorkflow, { entities: ["LivePreview", "Workflow"] }),
    query(getTrustedPackageScopes, { entities: ["Org", "UserSettings"] }),
    action(setTrustedPackageScopes, { entities: ["Org", "UserSettings"] }),
];
