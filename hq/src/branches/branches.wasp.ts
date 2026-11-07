import { action, query, type Spec } from "@wasp.sh/spec";
import {
    getWorkspaceBranchesQuery as getWorkspaceBranches, getBranchChangesQuery as getBranchChanges,
    getBranchCommitsQuery as getBranchCommits, getMainVersionsQuery as getMainVersions, getMainVersionAtQuery as getMainVersionAt,
    getMainVersionChangesQuery as getMainVersionChanges,
    getGitTreeQuery as getGitTree,
    getGitFileQuery as getGitFile, turnGitOnAction as turnGitOn, mergeBranchAction as mergeBranch,
    restoreVersionAction as restoreVersion, renameBranchAction as renameBranch, deleteBranchAction as deleteBranch,
    getWorkspaceRemovalQuery as getWorkspaceRemoval,
    bringBranchUpToDateAction as bringBranchUpToDate, getWorkspaceRefusalQuery as getWorkspaceRefusal,
} from "./operations" with { type: "ref" };
import { getTaskWorkspaces } from "./taskWorkspace" with { type: "ref" };

export const branchesSpec: Spec = [
    query(getWorkspaceBranches, { entities: ["WorkspaceBranch", "BranchCopy"] }),
    query(getBranchChanges, { entities: ["WorkspaceBranch"] }),
    query(getBranchCommits, { entities: ["WorkspaceBranch"] }),
    query(getMainVersions, { entities: ["WorkspaceBranch"] }),
    query(getMainVersionAt, { entities: ["WorkspaceBranch"] }),
    query(getMainVersionChanges, { entities: ["WorkspaceBranch"] }),
    query(getGitTree, { entities: ["WorkspaceBranch"] }),
    query(getGitFile, { entities: ["WorkspaceBranch"] }),
    query(getWorkspaceRemoval, { entities: ["WorkspaceBranch"] }),
    query(getTaskWorkspaces, { entities: ["Task"] }),
    action(turnGitOn, { entities: ["WorkspaceBranch"] }),
    action(mergeBranch, { entities: ["WorkspaceBranch", "BranchCopy"] }),
    action(restoreVersion, { entities: ["WorkspaceBranch"] }),
    action(renameBranch, { entities: ["WorkspaceBranch"] }),
    action(deleteBranch, { entities: ["WorkspaceBranch", "BranchCopy"] }),
    query(getWorkspaceRefusal, { entities: ["Project"] }),
    action(bringBranchUpToDate, { entities: ["WorkspaceBranch"] }),
];
