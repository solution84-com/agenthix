import { action, query, type Spec } from "@wasp.sh/spec";
import { getPlaceWorkflows, getWorkflow, getWorkflowVersion } from "./queries" with { type: "ref" };
import { approveWorkflowVersion, declineWorkflowVersion, switchWorkflow } from "./actions" with { type: "ref" };
import {
    getWorkflowRun, getWorkflowRuns, getWorkflowSwitches, setWorkflowAgentRunsPerHour, startWorkflowRun, stopWorkflowRun,
} from "./runsOperations" with { type: "ref" };

const runEntities = ["Workflow", "WorkflowVersion", "WorkflowVersionFile", "WorkflowApproval", "WorkflowRun", "WorkflowStepRun", "WorkflowMintedToken", "PlaceSecret", "PlaceVariable", "SecretRecord", "Project", "ProjectMember", "User", "UserStoragePlacement", "WorkspacePlacement", "ExecutionSite"] as const;

export const workflowsSpec: Spec = [
    query(getPlaceWorkflows, { entities: ["Workflow", "WorkflowVersion", "Project", "ProjectMember", "User"] }),
    query(getWorkflow, { entities: ["Workflow", "WorkflowVersion", "WorkflowApproval", "Project", "ProjectMember", "User"] }),
    query(getWorkflowVersion, { entities: ["Workflow", "WorkflowVersion", "WorkflowVersionFile", "Project", "ProjectMember", "User"] }),
    action(approveWorkflowVersion, { entities: ["Workflow", "WorkflowVersion", "WorkflowVersionFile", "WorkflowApproval", "Project", "ProjectMember", "User", "UserSettings"] }),
    action(declineWorkflowVersion, { entities: ["Workflow", "WorkflowVersion", "Project", "ProjectMember", "User"] }),
    action(switchWorkflow, { entities: ["Workflow", "WorkflowVersion", "WorkflowRun", "WorkflowSwitch", "Project", "ProjectMember", "User"] }),
    action(startWorkflowRun, { entities: [...runEntities] }),
    action(stopWorkflowRun, { entities: ["WorkflowRun", "Project", "ProjectMember", "User"] }),
    action(setWorkflowAgentRunsPerHour, { entities: ["Workflow", "Project", "ProjectMember", "User"] }),
    query(getWorkflowRuns, { entities: ["Workflow", "WorkflowRun", "WorkflowStepRun", "WorkflowVersion", "Project", "ProjectMember", "User"] }),
    query(getWorkflowRun, { entities: ["Workflow", "WorkflowRun", "WorkflowStepRun", "WorkflowVersion", "Project", "ProjectMember", "User"] }),
    query(getWorkflowSwitches, { entities: ["Workflow", "WorkflowSwitch", "Project", "ProjectMember", "User"] }),
];
