/**
 * AudioWorklet: post interleaved stereo Float32 PCM to the main thread.
 * No processing — raw capture path for Session Recorder.
 * Outputs are explicitly zeroed so the keep-alive connection to
 * AudioContext.destination never passes the mic to the speakers.
 */
class RawPcmProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      const left = input[0];
      const right = input[1] && input[1].length === left.length ? input[1] : left;
      const interleaved = new Float32Array(left.length * 2);
      for (let i = 0; i < left.length; i++) {
        interleaved[i * 2] = left[i];
        interleaved[i * 2 + 1] = right[i];
      }
      this.port.postMessage({ type: 'pcm', samples: interleaved }, [interleaved.buffer]);
    }

    // Never pass input through to outputs (would monitor via keep-alive → destination).
    const output = outputs[0];
    if (output) {
      for (let c = 0; c < output.length; c++) {
        const ch = output[c];
        if (ch) ch.fill(0);
      }
    }
    return true;
  }
}

registerProcessor('raw-pcm-processor', RawPcmProcessor);
