/**
 * AudioWorklet: post interleaved stereo Float32 PCM to the main thread.
 * No processing — raw capture path for Session Recorder.
 */
class RawPcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;
    const left = input[0];
    const right = input[1] && input[1].length === left.length ? input[1] : left;
    const interleaved = new Float32Array(left.length * 2);
    for (let i = 0; i < left.length; i++) {
      interleaved[i * 2] = left[i];
      interleaved[i * 2 + 1] = right[i];
    }
    this.port.postMessage({ type: 'pcm', samples: interleaved }, [interleaved.buffer]);
    return true;
  }
}

registerProcessor('raw-pcm-processor', RawPcmProcessor);
