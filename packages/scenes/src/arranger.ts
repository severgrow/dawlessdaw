import type { DeviceId } from '@dawlessdaw/core';

export type ArrangerProviderKind = 'none' | 'circuit-rhythm' | 'manual';

export interface ArrangerConfig {
  kind: ArrangerProviderKind;
  deviceId: DeviceId | null;
  /** Human label for the configured provider */
  label: string;
  /**
   * Hardware Scene Sync is unavailable — this flag is always false in v0.1.
   * Kept explicit so UI cannot imply fake sync.
   */
  hardwareSceneSync: false;
}

export interface ArrangerProvider {
  getConfig(): ArrangerConfig;
  configure(partial: Partial<Omit<ArrangerConfig, 'hardwareSceneSync'>>): void;
}

/**
 * Arranger-provider abstraction. Circuit is configurable;
 * no fake Scene sync with hardware.
 */
export class ConfigurableArrangerProvider implements ArrangerProvider {
  private config: ArrangerConfig = {
    kind: 'none',
    deviceId: null,
    label: 'No arranger',
    hardwareSceneSync: false,
  };

  getConfig(): ArrangerConfig {
    return { ...this.config, hardwareSceneSync: false };
  }

  configure(partial: Partial<Omit<ArrangerConfig, 'hardwareSceneSync'>>): void {
    this.config = {
      ...this.config,
      ...partial,
      hardwareSceneSync: false,
    };
    if (partial.kind === 'circuit-rhythm') {
      this.config.label = partial.label ?? 'Circuit Rhythm (logical arranger)';
    }
  }
}
