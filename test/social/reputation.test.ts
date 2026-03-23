import { describe, it, expect } from 'vitest';
import { getReputationLevel, checkGate } from '../../src/social/reputation.js';

describe('getReputationLevel', () => {
  it('returns newcomer for 0', () => {
    const level = getReputationLevel(0);
    expect(level.tier).toBe('newcomer');
    expect(level.next_tier).toBe('established');
    expect(level.next_threshold).toBe(25);
  });

  it('returns newcomer for 24', () => {
    expect(getReputationLevel(24).tier).toBe('newcomer');
  });

  it('returns established for 25', () => {
    const level = getReputationLevel(25);
    expect(level.tier).toBe('established');
    expect(level.next_tier).toBe('veteran');
    expect(level.next_threshold).toBe(100);
  });

  it('returns veteran for 100', () => {
    const level = getReputationLevel(100);
    expect(level.tier).toBe('veteran');
    expect(level.next_tier).toBe('elder');
    expect(level.next_threshold).toBe(300);
  });

  it('returns elder for 300', () => {
    const level = getReputationLevel(300);
    expect(level.tier).toBe('elder');
    expect(level.next_tier).toBeUndefined();
    expect(level.next_threshold).toBeUndefined();
  });

  it('returns elder for very high values', () => {
    expect(getReputationLevel(9999).tier).toBe('elder');
  });

  it('includes score in result', () => {
    expect(getReputationLevel(42).score).toBe(42);
  });
});

describe('checkGate', () => {
  it('passes when score meets requirement', () => {
    expect(checkGate(25, 25)).toBe(true);
    expect(checkGate(100, 25)).toBe(true);
  });

  it('fails when score below requirement', () => {
    expect(checkGate(24, 25)).toBe(false);
    expect(checkGate(0, 100)).toBe(false);
  });
});
