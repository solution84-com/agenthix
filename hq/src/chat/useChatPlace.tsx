import { useMemo } from 'react'
import { useAuth } from 'wasp/client/auth'
import {
  useQuery, getMyPersonalProject, getProjectByKey, getProjectActiveRuns, getMyStorageSite,
} from 'wasp/client/operations'
import type { Place } from '../places/placeTypes'
import { CHAT_PATH, useChatComposerPlace } from './chatComposer'
import { SPACE_PATH } from './chatPlacePaths'
import { SPACE_SECTION_ORDER, chatFacts, chatLinkedTools, chatToolGroups, type PersonalProject } from './chatPlace'
import { useFilesToolCounts } from '../storage/pages/filesToolGroup'
import { useWorkflowsTool } from '../workflows/pages/useWorkflowsTool'
import { useSecretsTool } from '../secrets/pages/useSecretsTool'
import { useArtefactLinks } from '../storage/pages/useArtefactLinks'
import { useSkillsTool } from '../assets/pages/place/useSkillsTool'

/**
 * Your space as a place (spec §7, §8): the person's personal space — their conversations outside any project, with
 * any agent, and the tools of their personal project and own storage. Its sections are at `/space`; its
 * conversations at `/chat`. Undefined until the person is known.
 */
export function useChatPlace(): Place | undefined {
  const { data: user } = useAuth()
  const { data: personal } = useQuery(getMyPersonalProject)
  const key = (personal as { key: string } | undefined)?.key
  const { data: projectData } = useQuery(getProjectByKey, key ? { key } : undefined, { enabled: !!key })
  const project: PersonalProject | undefined = projectData
  const projectId = project?.id
  const { data: runs } = useQuery(getProjectActiveRuns, projectId ? { projectId } : undefined, { enabled: !!projectId })
  const { data: site } = useQuery(getMyStorageSite)
  const composer = useChatComposerPlace(null)
  useArtefactLinks()
  const filesCounts = useFilesToolCounts(user ? { ownerType: 'user', ownerId: user.id } : undefined)
  const workflows = useWorkflowsTool(user ? { type: 'user', id: user.id } : undefined)
  const secrets = useSecretsTool(user ? { type: 'user', id: user.id } : undefined)
  const skills = useSkillsTool(projectId ? { projectId, name: 'Your space', isSpace: true, agents: composer.agents.map((a) => ({ id: a.id, name: a.name })) } : undefined)

  return useMemo(() => {
    if (!user) return undefined
    return {
      ...composer,
      homePath: SPACE_PATH,
      breadcrumbs: [{ label: 'Chat', href: CHAT_PATH }],
      name: 'Your space',
      talkLabel: 'Talk in your space',
      factsHeading: 'Your space',
      backHref: null,
      projectId: null,
      facts: chatFacts(site as { id: string; label: string } | null | undefined),
      linkedTools: chatLinkedTools(projectId),
      toolGroups: chatToolGroups({
        userId: user.id, project, runs: runs as unknown[] | undefined,
        siteLabel: (site as { label: string } | null | undefined)?.label ?? null, filesCounts, workflows, skills, secrets,
      }),
      sectionOrder: SPACE_SECTION_ORDER,
    }
  }, [user, projectId, composer.agents, composer.defaultAgentId, site, project, runs, filesCounts, workflows, skills, secrets])
}
