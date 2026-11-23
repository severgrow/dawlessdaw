/**
 * SP effect CTRL “name by ear” profile (Phase 3).
 *
 * User hears which physical knob moves during a guided CC sweep, then saves a
 * label. Stays **untested** until Patryk marks verified — never auto-claim.
 */

import { SP_EFFECT_CCS, SP_EFFECT_NAMES_KEY } from './sp404-setup';

export type SpEffectHonesty = 'untested' | 'docs-backed' | 'verified';

export interface SpEffectKnobName {
  cc: number;
  /** User-chosen plain name, e.g. "Filter" / "CTRL 3" */
  label: string;
  honesty: SpEffectHonesty;
  /** ISO time when user last saved this mapping */
  namedAt: string | null;
}

export interface SpEffectNameProfile {
  version: 1;
  channel: number;
  knobs: SpEffectKnobName[];
  /** True only after owner confirms on hardware. */
  ownerVerified: boolean;
}

export function defaultSpEffectProfile(channel = 1): SpEffectNameProfile {
  return {
    version: 1,
    channel: Math.min(16, Math.max(1, channel)),
    knobs: SP_EFFECT_CCS.map((cc, i) => ({
      cc,
      label: `Effect control ${i + 1}`,
      honesty: 'docs-backed',
      namedAt: null,
    })),
    ownerVerified: false,
  };
}

export function normalizeSpEffectProfile(raw: unknown): SpEffectNameProfile {
  const base = defaultSpEffectProfile();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  if (typeof r.channel === 'number' && r.channel >= 1 && r.channel <= 16) {
    base.channel = Math.round(r.channel);
  }
  base.ownerVerified = r.ownerVerified === true;
  if (!Array.isArray(r.knobs)) return base;
  for (const item of r.knobs) {
    if (!item || typeof item !== 'object') continue;
    const k = item as Record<string, unknown>;
    const cc = Number(k.cc);
    if (!SP_EFFECT_CCS.includes(cc as (typeof SP_EFFECT_CCS)[number])) continue;
    const slot = base.knobs.find((x) => x.cc === cc);
    if (!slot) continue;
    if (typeof k.label === 'string' && k.label.trim()) {
      slot.label = k.label.trim().slice(0, 40);
    }
    if (k.honesty === 'verified' || k.honesty === 'untested' || k.honesty === 'docs-backed') {
      slot.honesty = base.ownerVerified && k.honesty === 'verified' ? 'verified' : k.honesty === 'verified' ? 'untested' : k.honesty;
    }
    // Never promote to verified without ownerVerified flag
    if (!base.ownerVerified && slot.honesty === 'verified') slot.honesty = 'untested';
    if (typeof k.namedAt === 'string') slot.namedAt = k.namedAt;
  }
  return base;
}

export function setEffectKnobLabel(
  profile: SpEffectNameProfile,
  cc: number,
  label: string,
): SpEffectNameProfile {
  const next = {
    ...profile,
    knobs: profile.knobs.map((k) =>
      k.cc === cc
        ? {
            ...k,
            label: label.trim().slice(0, 40) || k.label,
            honesty: 'untested' as SpEffectHonesty,
            namedAt: new Date().toISOString(),
          }
        : { ...k },
    ),
    ownerVerified: false,
  };
  return next;
}

export { SP_EFFECT_NAMES_KEY };
