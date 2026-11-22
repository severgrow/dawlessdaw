import { describe, it, expect } from 'vitest';
import { stitchChunks } from './stitch';

describe('chunk stitch', () => {
  it('concatenates in order with no gaps or repeats', () => {
    const a = new Float32Array([0.1, 0.2, 0.3, 0.4]); // 2 frames stereo
    const b = new Float32Array([0.5, 0.6]);
    const audio = stitchChunks(
      [
        { index: 1, samples: b },
        { index: 0, samples: a },
      ],
      48000,
    );
    expect(audio.left.length).toBe(3);
    expect(audio.left[0]).toBeCloseTo(0.1, 5);
    expect(audio.left[1]).toBeCloseTo(0.3, 5);
    expect(audio.left[2]).toBeCloseTo(0.5, 5);
    expect(audio.right[0]).toBeCloseTo(0.2, 5);
    expect(audio.right[1]).toBeCloseTo(0.4, 5);
    expect(audio.right[2]).toBeCloseTo(0.6, 5);
  });

  it('rejects gaps', () => {
    expect(() =>
      stitchChunks(
        [
          { index: 0, samples: new Float32Array([0, 0]) },
          { index: 2, samples: new Float32Array([1, 1]) },
        ],
        48000,
      ),
    ).toThrow(/gap or repeat/);
  });

  it('rejects repeats', () => {
    expect(() =>
      stitchChunks(
        [
          { index: 0, samples: new Float32Array([0, 0]) },
          { index: 0, samples: new Float32Array([1, 1]) },
        ],
        48000,
      ),
    ).toThrow(/gap or repeat/);
  });
});
