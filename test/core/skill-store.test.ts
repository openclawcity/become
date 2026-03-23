import { describe, it, expect, beforeEach } from 'vitest';
import { SkillStore } from '../../src/core/skill-store.js';
import { MemoryStore } from '../../src/adapters/memory.js';

let store: MemoryStore;
let skills: SkillStore;

beforeEach(() => {
  store = new MemoryStore();
  skills = new SkillStore(store);
});

describe('SkillStore.normalizeName', () => {
  it('lowercases', () => expect(SkillStore.normalizeName('Debugging')).toBe('debugging'));
  it('replaces spaces with underscores', () => expect(SkillStore.normalizeName('image composition')).toBe('image_composition'));
  it('strips special chars', () => expect(SkillStore.normalizeName('C++ Programming!')).toBe('c_programming'));
  it('handles multiple spaces', () => expect(SkillStore.normalizeName('  a  b  ')).toBe('_a_b_'));
});

describe('SkillStore.validateName', () => {
  it('accepts valid names', () => {
    expect(SkillStore.validateName('debugging')).toBe(true);
    expect(SkillStore.validateName('image_composition')).toBe(true);
    expect(SkillStore.validateName('web-dev')).toBe(true);
    expect(SkillStore.validateName('a1b2c3')).toBe(true);
  });

  it('rejects invalid names', () => {
    expect(SkillStore.validateName('')).toBe(false);
    expect(SkillStore.validateName('has space')).toBe(false);
    expect(SkillStore.validateName('UPPERCASE')).toBe(false);
    expect(SkillStore.validateName('a'.repeat(101))).toBe(false);
  });
});

describe('CRUD', () => {
  it('upserts and gets a skill', async () => {
    const skill = await skills.upsert('agent-1', { name: 'debugging', category: 'coding' });
    expect(skill.name).toBe('debugging');
    expect(skill.score).toBe(0);
    expect(skill.dreyfus_stage).toBe('novice');

    const fetched = await skills.get('agent-1', 'debugging');
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('debugging');
  });

  it('normalizes name on upsert', async () => {
    const skill = await skills.upsert('agent-1', { name: 'Image Composition' });
    expect(skill.name).toBe('image_composition');
  });

  it('throws on invalid name after normalization', async () => {
    await expect(skills.upsert('agent-1', { name: '' })).rejects.toThrow('Invalid skill name');
  });

  it('updates existing skill', async () => {
    await skills.upsert('agent-1', { name: 'debugging', category: 'coding' });
    const updated = await skills.upsert('agent-1', { name: 'debugging', category: 'advanced-coding' });
    expect(updated.category).toBe('advanced-coding');
  });

  it('lists skills for agent', async () => {
    await skills.upsert('agent-1', { name: 'debugging' });
    await skills.upsert('agent-1', { name: 'testing' });
    await skills.upsert('agent-2', { name: 'debugging' });

    const list = await skills.list('agent-1');
    expect(list).toHaveLength(2);
  });

  it('deletes a skill', async () => {
    await skills.upsert('agent-1', { name: 'debugging' });
    await skills.delete('agent-1', 'debugging');
    const fetched = await skills.get('agent-1', 'debugging');
    expect(fetched).toBeNull();
  });
});

describe('catalog', () => {
  it('auto-registers in catalog', async () => {
    await skills.upsert('agent-1', { name: 'debugging', category: 'coding' });
    const catalog = await skills.catalog();
    expect(catalog.some((c) => c.skill === 'debugging')).toBe(true);
  });

  it('auto-verifies at 3 adopters', async () => {
    await skills.upsert('agent-1', { name: 'debugging' });
    await skills.upsert('agent-2', { name: 'debugging' });

    let catalog = await skills.catalog();
    expect(catalog.find((c) => c.skill === 'debugging')!.status).toBe('community');

    await skills.upsert('agent-3', { name: 'debugging' });
    catalog = await skills.catalog();
    expect(catalog.find((c) => c.skill === 'debugging')!.status).toBe('verified');
  });
});

describe('suggest', () => {
  it('suggests verified skills the agent does not have', async () => {
    // Create a verified skill
    await skills.upsert('agent-1', { name: 'music' });
    await skills.upsert('agent-2', { name: 'music' });
    await skills.upsert('agent-3', { name: 'music' });

    // Agent-4 should get music as suggestion
    const suggestions = await skills.suggest('agent-4');
    expect(suggestions).toContain('music');
  });

  it('does not suggest skills the agent already has', async () => {
    await skills.upsert('agent-1', { name: 'music' });
    await skills.upsert('agent-2', { name: 'music' });
    await skills.upsert('agent-3', { name: 'music' });

    const suggestions = await skills.suggest('agent-1');
    expect(suggestions).not.toContain('music');
  });
});

describe('holders', () => {
  it('returns all agents with a skill', async () => {
    await skills.upsert('agent-1', { name: 'debugging' });
    await skills.upsert('agent-2', { name: 'debugging' });

    const holders = await skills.holders('debugging');
    expect(holders).toHaveLength(2);
  });
});
