export type {
  AudioBackend,
  AudioBackendKind,
  AudioBackendMeters,
  AudioBackendOpenOptions,
  AudioBackendSnapshot,
  AudioDeviceChangeHandler,
  AudioInputInfo,
  PcmHandler,
} from './backend';
export { EMPTY_METERS, createBackendSnapshot } from './backend';

export {
  isBuiltInOrPhoneMic,
  isPreferredInterface,
  filterSelectableAudioInputs,
} from './mic-filter';

export {
  FakeAudioBackend,
  type FakeAudioBackendOptions,
  type FakeAudioInputSpec,
} from './fake-backend';

export {
  WorkletAudioBackend,
  MemoryWorkletHost,
  type WorkletAudioBackendOptions,
  type WorkletAudioHost,
} from './worklet-backend';

export { createAudioBackend, type CreateAudioBackendOptions } from './create-backend';
