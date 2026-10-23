import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { AgentListPage } from "./pages/AgentListPage" with { type: "ref" };
import { AgentPlacePage } from "./pages/AgentPlacePage" with { type: "ref" };
import { AgentsManageListPage } from "./pages/manage/AgentsManageListPage" with { type: "ref" };
import { AgentManagePage } from "./pages/manage/AgentManagePage" with { type: "ref" };
import { SkillsRedirectPage } from "../library/pages/SkillsRedirectPage" with { type: "ref" };
import { getAgents, getAgent, getAgentByHandle, getAgentDetail, getAgentChatStats, getAgentPromptPreview, getAgentSkills, getSkillLibrary, getInstalledSkillVersions } from "./queries" with { type: "ref" };
import { getToolCallLog, getSessionPendingManifest, getRunManifestStatus } from "./manifestQueries" with { type: "ref" };
import { getOrgRunLimitsQuery as getOrgRunLimits, updateOrgRunLimits, getProjectRunLimitsQuery as getProjectRunLimits, setProjectRunLimits } from "./runLimits/runLimitsActions" with { type: "ref" };
import { createAgent, updateAgent, stopAgent, saveAgentSkill, deleteAgentSkill, createLibrarySkill, updateLibrarySkill, deleteLibrarySkill, installSkill, uninstallSkill, deleteAgent, uploadAgentImage, applyAgentPreset } from "./actions" with { type: "ref" };
import { updateAgentFile, updateAgentSettings } from "./definitionActions" with { type: "ref" };
import { getAgentOverride, setAgentOverride } from "./overrides/overrideOperations" with { type: "ref" };
import { getAgentPermissions, getAgentPermissionsHere, getAgentCardHere } from "./permissions/permissionQueries" with { type: "ref" };
import { exportAgent, importAgent } from "./agentZipActions" with { type: "ref" };
import { getProjectAgents, getProjectAgent } from "./projectAgentQueries" with { type: "ref" };
import { getOrgAgents, getAgentPlace, getAgentProfile } from "./agentPlaceQueries" with { type: "ref" };
import { getAgentAssignments } from "./agentAssignments" with { type: "ref" };
import { getAgentUsage } from "./agentUsageQueries" with { type: "ref" };
import { approveManifest, rejectManifest } from "./manifestActions" with { type: "ref" };

export const agentsSpec: Spec = [
    route("AgentListRoute", "/agents", page(AgentListPage, { authRequired: true })),
    route("AgentDetailRoute", "/agents/:handle", page(AgentPlacePage, { authRequired: true })),
    route("OrgAgentsRoute", "/admin/agents", page(AgentsManageListPage, { authRequired: true })),
    route("OrgAgentRoute", "/admin/agents/:handle", page(AgentManagePage, { authRequired: true })),
    route("SkillsLibraryRoute", "/skills", page(SkillsRedirectPage, { authRequired: true })),
    query(getAgents, { entities: ["Agent"] }),
    query(getAgent, { entities: ["Agent"] }),
    query(getAgentByHandle, { entities: ["Agent"] }),
    query(getAgentDetail, { entities: ["Agent", "AgentSession", "Task"] }),
    query(getAgentChatStats, { entities: ["Agent", "Task", "AgentSession"] }),
    query(getAgentPromptPreview, { entities: ["Agent"] }),
    // The Agents design's reads (every screen reviewed spec §3). Entities name what the
    // assign, remove, override and task actions write, so their results refresh.
    query(getProjectAgents, { entities: ["ProjectAgent", "Agent", "Task", "Routine", "AgentOverride", "Project"] }),
    query(getProjectAgent, { entities: ["ProjectAgent", "Agent", "Task", "Routine", "AgentOverride", "Project"] }),
    query(getOrgAgents, { entities: ["Agent", "ProjectAgent", "Task", "Routine", "ProjectMember"] }),
    query(getAgentPlace, { entities: ["Agent", "ProjectAgent", "Task", "Routine", "AgentOverride", "AgentSession"] }),
    query(getAgentProfile, { entities: ["Agent", "ProjectAgent", "Task", "Routine"] }),
    query(getAgentAssignments, { entities: ["Agent", "ProjectAgent", "AgentOverride", "Project", "ProjectMember"] }),
    query(getAgentUsage, { entities: ["Agent", "AgentSession", "ProjectMember"] }),
    query(getAgentSkills, { entities: ["Agent"] }),
    query(getSkillLibrary, { entities: ["Skill"] }),
    query(getInstalledSkillVersions, { entities: ["Skill"] }),
    query(getToolCallLog, { entities: ["AgentSession"] }),
    query(getSessionPendingManifest, { entities: ["AgentSession"] }),
    query(getRunManifestStatus, { entities: ["AgentSession"] }),
    query(getOrgRunLimits, { entities: ["Org"] }),
    action(updateOrgRunLimits, { entities: ["Org", "UserSettings"] }),
    query(getProjectRunLimits, { entities: ["Org", "Project"] }),
    action(setProjectRunLimits, { entities: ["Org", "Project", "ProjectMember"] }),
    action(createAgent, { entities: ["Agent"] }),
    action(updateAgent, { entities: ["Agent"] }),
    action(updateAgentFile, { entities: ["Agent"] }),
    action(updateAgentSettings, { entities: ["Agent"] }),
    query(getAgentOverride, { entities: ["AgentOverride", "ProjectAgent", "ProjectMember", "Agent"] }),
    action(setAgentOverride, { entities: ["AgentOverride", "ProjectAgent", "ProjectMember", "Agent"] }),
    // An agent's permissions at each level, and its card where it is opened (every screen reviewed spec §3).
    query(getAgentPermissions, { entities: ["Agent"] }),
    query(getAgentPermissionsHere, { entities: ["Agent", "AgentOverride", "ProjectAgent", "ProjectMember"] }),
    query(getAgentCardHere, { entities: ["Agent", "AgentOverride", "ProjectMember", "Project", "Task", "Routine"] }),
    action(stopAgent, { entities: ["Agent"] }),
    action(exportAgent, { entities: ["Agent"] }),
    action(importAgent, { entities: ["Agent"] }),
    action(saveAgentSkill, { entities: ["Agent"] }),
    action(deleteAgentSkill, { entities: ["Agent"] }),
    action(createLibrarySkill, { entities: ["Skill"] }),
    action(updateLibrarySkill, { entities: ["Skill"] }),
    action(deleteLibrarySkill, { entities: ["Skill"] }),
    action(installSkill, { entities: ["Skill", "Agent", "Project"] }),
    action(uninstallSkill, { entities: ["Skill"] }),
    action(deleteAgent, { entities: ["Agent", "AgentSession"] }),
    action(uploadAgentImage, { entities: ["Agent"] }),
    action(applyAgentPreset, { entities: ["Agent"] }),
    action(approveManifest, { entities: ["Task"] }),
    action(rejectManifest, { entities: ["Task", "TaskComment"] }),
];
