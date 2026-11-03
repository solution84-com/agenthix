import { action, query, type Spec } from "@wasp.sh/spec";
import {
    getWorkspaceBranchesQuery as getWorkspaceBranches, getBranchChangesQuery as getBranchChanges,
    getBranchCommitsQuery as getBranchCommits, getMainVersionsQuery as getMainVersions, getGitTreeQuery as getGitTree,
    getGitFileQuery as getGitFile, turnGitOnAction as turnGitOn, mergeBranchAction as mergeBranch,
    restoreVersionAction as restoreVersion, renameBranchAction as renameBranch, deleteBranchAction as deleteBranch,
    startWorkspaceConversationAction as startWorkspaceConversation, getWorkspaceRemovalQuery as getWorkspaceRemoval,
} from "./operations" with { type: "ref" };
import { getTaskWorkspaces } from "./taskWorkspace" with { type: "ref" };

export const branchesSpec: Spec = [
    query(getWorkspaceBranches, { entities: ["WorkspaceBranch", "BranchCopy"] }),
    query(getBranchChanges, { entities: ["WorkspaceBranch"] }),
    query(getBranchCommits, { entities: ["WorkspaceBranch"] }),
    query(getMainVersions, { entities: ["WorkspaceBranch"] }),
    query(getGitTree, { entities: ["WorkspaceBranch"] }),
    query(getGitFile, { entities: ["WorkspaceBranch"] }),
    query(getWorkspaceRemoval, { entities: ["WorkspaceBranch"] }),
    query(getTaskWorkspaces, { entities: ["Task"] }),
    action(turnGitOn, { entities: ["WorkspaceBranch"] }),
    action(mergeBranch, { entities: ["WorkspaceBranch", "BranchCopy"] }),
    action(restoreVersion, { entities: ["WorkspaceBranch"] }),
    action(renameBranch, { entities: ["WorkspaceBranch"] }),
    action(deleteBranch, { entities: ["WorkspaceBranch", "BranchCopy"] }),
    action(startWorkspaceConversation, { entities: ["Conversation", "WorkspaceBranch"] }),
];
