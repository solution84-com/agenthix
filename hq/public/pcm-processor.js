class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0]
    if (channel && channel.length > 0) {
      const copy = channel.slice(0)
      this.port.postMessage(copy.buffer, [copy.buffer])
    }
    return true
  }
}

registerProcessor('pcm-processor', PcmProcessor)
