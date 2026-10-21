/**
 * What a person's agenda file is called.
 *
 * Declared here because both apps name it and neither may be the authority:
 * hq puts this name on the wire when it seeds or reads a person's agenda, and
 * site resolves that name against the location's directory and builds the
 * container path a run reads it at. A copy on each side is a name that can
 * drift, and the two halves would still compile and still pass their own
 * suites while onboarding seeded one file and the run read another.
 *
 * Where the file SITS is not here: that differs per boundary, and it is the
 * site's rule because the site has the disk (ADR-0042).
 */
export const AGENDA_FILE_NAME = 'agenda.md'
