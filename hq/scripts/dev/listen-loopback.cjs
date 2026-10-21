// Preloaded (NODE_OPTIONS=--require) by `start.sh --tailnet`. Wasp's server calls
// `server.listen(port)` with no host, which binds every interface; this makes any
// listen that names no host bind 127.0.0.1 instead, so the dev servers are reached
// only through `tailscale serve` and never from the local network.
const net = require('node:net')

const host = process.env.HQ_DEV_LISTEN_HOST
if (host) {
  const listen = net.Server.prototype.listen
  net.Server.prototype.listen = function (...args) {
    const first = args[0]
    if (typeof first === 'number' || (typeof first === 'string' && /^\d+$/.test(first))) {
      if (args[1] == null) args[1] = host
      else if (typeof args[1] !== 'string') args.splice(1, 0, host)
    } else if (first && typeof first === 'object' && first.port !== undefined && !first.host && !first.path) {
      args[0] = { ...first, host }
    }
    return listen.apply(this, args)
  }
}
