/**
 * What `agenthix console remove` says (spec §7): a Fleet Console HQ no longer lets in — retired while this machine was
 * outside the fleet — taken away by the machine admin, keys and all.
 */
import type { HqReach, ConsoleRemoved } from '../install/console'
import { cmd, nextStep, wrap } from './words'

export function consoleRemoveWarning(machine: string, hq: HqReach | null): string {
  const why = hq === 'refused'
    ? `HQ refuses to let the Fleet Console on ${machine} in: it was most likely retired when the Fleet Console started on another machine.`
    : hq === 'connected'
      ? `HQ still lets the Fleet Console on ${machine} in: it may be the one the fleet uses now. Taking it away leaves the machines it manages without a Fleet Console until each connects to another.`
      : `The Fleet Console on ${machine} is not reaching HQ just now, so this machine cannot tell whether it was retired.`
  return [
    wrap(why),
    nextStep('Taking it away stops and removes it, and deletes its keys with it: they cannot be brought back. A machine that ' +
      'still answers it would have to connect to another Fleet Console again, with', cmd('console connect <hq address> <code>')),
  ].join('\n')
}

export function consoleRemoved(r: ConsoleRemoved): string {
  return [
    wrap(`Taken away. No Fleet Console runs on ${r.machine} now, and its keys are gone.`),
    nextStep("To run one here again, with a code a machine admin of HQ's machine makes:", cmd('console install <hq address> <code>')),
  ].join('\n')
}

/** `agenthix status`: a Fleet Console running here that HQ does not let in, or does not reach. */
export function consoleNotInLines(hq: HqReach, indent: string): string[] {
  if (hq === 'notConnected') return [wrap('Running, but not reaching HQ just now; it keeps trying by itself.', indent)]
  return [
    wrap('Running, but HQ refuses to let it in: it may have been retired when the Fleet Console started on another machine, or its code was not accepted.', indent),
    nextStep('If no machine needs it any more, take it away:', cmd('console remove'), indent),
  ]
}
