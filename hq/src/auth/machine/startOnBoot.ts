import { firstAdminLogLine, issueFirstAdminLink } from '../firstAdmin'
import { controlSocketPath, startControlSocket } from './controlSocket'
import { runHqMachineCommand } from './hqMachineCommands'

/**
 * At every start (`server/setup.ts`): while hq has no users, a fresh first-admin
 * link, printed from hq's own address — only its hash is stored, so this log
 * line is the one place it appears, and the earlier link stops working.
 * Then the control socket for commands run on hq's machine. Neither stops hq
 * from starting.
 */
export async function startFirstAdminAndControlSocket(noUsers: boolean, log: (line: string) => void): Promise<void> {
  if (noUsers) {
    try {
      const issued = await issueFirstAdminLink()
      if (issued) log(firstAdminLogLine(issued.link))
    } catch (err) {
      log(`First-admin link not made: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  try {
    await startControlSocket(runHqMachineCommand)
    log(`Commands on this machine reach hq at ${controlSocketPath()}.`)
  } catch (err) {
    log(`Control socket not started: ${err instanceof Error ? err.message : String(err)}`)
  }
}
