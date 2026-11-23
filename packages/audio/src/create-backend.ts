import type { AudioBackend, AudioBackendKind } from './backend';
import { FakeAudioBackend, type FakeAudioBackendOptions } from './fake-backend';
import {
  WorkletAudioBackend,
  type WorkletAudioBackendOptions,
  type WorkletAudioHost,
} from './worklet-backend';

export interface CreateAudioBackendOptions {
  kind: AudioBackendKind;
  fake?: FakeAudioBackendOptions;
  worklet?: Omit<WorkletAudioBackendOptions, 'host'> & { host: WorkletAudioHost };
}

/**
 * Factory for the swappable AudioBackend seam.
 * `native-bridge` is reserved — throws until a desktop host exists.
 */
export function createAudioBackend(opts: CreateAudioBackendOptions): AudioBackend {
  switch (opts.kind) {
    case 'fake':
      return new FakeAudioBackend(opts.fake);
    case 'worklet':
      if (!opts.worklet?.host) {
        throw new Error('createAudioBackend({ kind: "worklet" }) requires worklet.host');
      }
      return new WorkletAudioBackend(opts.worklet);
    case 'native-bridge':
      throw new Error(
        'Native audio bridge is unavailable in v0.1 (stub only). Use kind "worklet" or "fake".',
      );
    default: {
      const _exhaustive: never = opts.kind;
      throw new Error(`Unknown AudioBackend kind: ${String(_exhaustive)}`);
    }
  }
}
