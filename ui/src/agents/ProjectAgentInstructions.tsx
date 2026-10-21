import { LinkButton, Section } from './ProjectAgentParts'
import type { InstructionFileData, PlaceInstructionsData } from './projectAgentTypes'

function FileBlock({ heading, file, onOpenFile }: { heading: string; file: InstructionFileData; onOpenFile: (path: string) => void }) {
  return (
    <div className="space-y-1">
      <p className="flex items-center justify-between gap-2 text-small text-text-secondary">
        <span>{heading}</span>
        <LinkButton onClick={() => onOpenFile(file.path)}>Open in Files</LinkButton>
      </p>
      {file.tooLarge
        ? <p className="text-small text-text-muted">Too long to show here.</p>
        : file.text
          ? <p className="line-clamp-4 whitespace-pre-wrap text-small text-text-primary">{file.text}</p>
          : <p className="text-small text-text-muted">Nothing written yet.</p>}
    </div>
  )
}

/**
 * An agent's instructions in this project: the organisation's, read only, then the project's for every agent
 * and for this one. The project's open in Files; skills are only named — an agent changes them when asked.
 */
export function ProjectAgentInstructions({ agentName, instructions, onOpenFile }: {
  agentName: string
  instructions: PlaceInstructionsData | null
  onOpenFile: (path: string) => void
}) {
  if (!instructions) return <Section title="Its instructions here"><p className="text-small text-text-muted">Loading…</p></Section>
  const skills = [...instructions.everyAgent.skills, ...(instructions.forAgent?.skills ?? [])]
  return (
    <Section title="Its instructions here">
      {instructions.organisation && (
        <div className="space-y-1">
          <p className="text-small text-text-secondary">The organisation&apos;s · everywhere · read only</p>
          <p className="line-clamp-4 whitespace-pre-wrap text-small text-text-primary">{instructions.organisation.instructions}</p>
        </div>
      )}
      <FileBlock heading="This project's · for every agent" file={instructions.everyAgent.file} onOpenFile={onOpenFile} />
      {instructions.forAgent && <FileBlock heading={`This project's · for ${agentName} only`} file={instructions.forAgent.file} onOpenFile={onOpenFile} />}
      {skills.length > 0 && <p className="text-small text-text-secondary">Skills here · {skills.join(' · ')}</p>}
    </Section>
  )
}
