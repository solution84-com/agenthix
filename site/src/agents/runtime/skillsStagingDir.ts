/**
 * Where a run's staged skills live under the boundary's Claude home.
 *
 * Its own module because two files that otherwise share nothing have to agree
 * on it: the runtime that stages into it (ClaudeSDKRuntime) and the container
 * start that binds it read-only (AgentContainerManager). No imports, so either
 * can take it without pulling the other's dependencies into a test.
 */
export const SKILLS_STAGING_DIRNAME = '.tmp'
