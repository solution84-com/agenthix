/** For container tests: the subnets the host service would choose on this machine now, as `installSubnets` does. */
import { chooseSubnets, machineAddresses, parseNetworkInspect } from '../compose/subnets'
import type { InstallNames } from '../state/namespace'

export function machineSubnets(docker: (...args: string[]) => string, names: InstallNames) {
  const all = docker('network', 'ls', '--format', '{{.Name}}').split('\n').map(n => n.trim()).filter(Boolean)
  const inspected = docker('network', 'inspect', '--format', '{{.Name}}\t{{range .IPAM.Config}}{{.Subnet}} {{end}}', ...all)
  return chooseSubnets(names, parseNetworkInspect(inspected), machineAddresses())
}
