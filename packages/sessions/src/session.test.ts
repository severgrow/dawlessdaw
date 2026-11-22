import { describe, it, expect } from 'vitest';
import {
  createEmptySession,
  exportSessionJson,
  importSessionJson,
} from './session';

describe('sessions import/export', () => {
  it('round-trips with schema version', () => {
    const session = createEmptySession('Test', true);
    session.notes = 'hello';
    const json = exportSessionJson(session);
    const result = importSessionJson(json);
    expect(result.ok).toBe(true);
    expect(result.session?.name).toBe('Test');
    expect(result.session?.schemaVersion).toBe(1);
    expect(result.session?.arranger.hardwareSceneSync).toBe(false);
  });

  it('rejects bad schema version', () => {
    const result = importSessionJson(
      JSON.stringify({
        schemaVersion: 99,
        id: 'x',
        name: 'x',
        scenes: [],
        routingPresets: [],
      }),
    );
    expect(result.ok).toBe(false);
  });
});
