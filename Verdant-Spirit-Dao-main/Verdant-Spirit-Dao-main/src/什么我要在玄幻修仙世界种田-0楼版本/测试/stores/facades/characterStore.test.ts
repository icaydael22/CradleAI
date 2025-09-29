import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWorldStore } from '@/stores/core/worldStore';
import { useCharacterStore } from '@/stores/facades/characterStore';

describe('useCharacterStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should return an empty array if no characters exist', () => {
    const characterStore = useCharacterStore();
    expect(characterStore.characters).toEqual([]);
  });

  it('should return a list of characters from worldStore', () => {
    const worldStore = useWorldStore();
    worldStore.world = {
      角色: {
        '主控角色名': '主角',
        '主角': { 姓名: '主角', 等级: 10 },
        '队友A': { 姓名: '队友A', 等级: 8 },
      },
    } as any;

    const characterStore = useCharacterStore();
    expect(characterStore.characters.length).toBe(2);
    expect(characterStore.characters).toEqual([
      { 姓名: '主角', 等级: 10 },
      { 姓名: '队友A', 等级: 8 },
    ]);
  });

  it('should identify the main character correctly', () => {
    const worldStore = useWorldStore();
    worldStore.world = {
      角色: {
        '主控角色名': '主角',
        '主角': { 姓名: '主角' },
        '队友A': { 姓名: '队友A' },
      },
    } as any;

    const characterStore = useCharacterStore();
    expect(characterStore.mainCharacter).toBeDefined();
    expect(characterStore.mainCharacter?.姓名).toBe('主角');
    expect(characterStore.mainCharacterName).toBe('主角');
  });

  it('should return null if no main character is defined', () => {
    const worldStore = useWorldStore();
    worldStore.world = {
      角色: {
        '路人甲': { 姓名: '路人甲' },
        '路人乙': { 姓名: '路人乙' },
      },
    } as any;

    const characterStore = useCharacterStore();
    expect(characterStore.mainCharacter).toBeNull();
    expect(characterStore.mainCharacterName).toBe('');
  });

  it('should reactively update when worldStore changes', async () => {
    const worldStore = useWorldStore();
    const characterStore = useCharacterStore();

    // 1. Start with an empty state
    expect(characterStore.characters).toEqual([]);

    // 2. Set initial state
    worldStore.world = {
      角色: {
        '主控角色名': '主角',
        '主角': { 姓名: '主角', 等级: 1 },
      },
    } as any;
    
    // Wait for Vue's reactivity to settle
    await new Promise(resolve => setTimeout(resolve, 0));

    // 3. Assert initial derived state
    expect(characterStore.characters.length).toBe(1);
    // ✅ 正确做法: 从数组中找到角色，再断言其属性
    expect(characterStore.characters.find(c => c.姓名 === '主角')?.等级).toBe(1);

    // 4. Simulate an update
    if (worldStore.world?.角色) {
      (worldStore.world.角色['主角'] as any).等级 = 2;
    }
    await new Promise(resolve => setTimeout(resolve, 0));

    // 5. Assert updated derived state
    expect(characterStore.characters.find(c => c.姓名 === '主角')?.等级).toBe(2);
  });

  it('should correctly handle characters with additional, non-standard properties', () => {
    const worldStore = useWorldStore();
    worldStore.world = {
      角色: {
        '主控角色名': '主角',
        '主角': { 姓名: '主角', 等级: 10, 情绪: '平静' }, // Custom property
        '队友A': { 姓名: '队友A', 等级: 8, 称号: '剑客' }, // Custom property
      },
    } as any;

    const characterStore = useCharacterStore();
    expect(characterStore.characters.length).toBe(2);

    const mainChar = characterStore.characters.find(c => c.姓名 === '主角');
    const teammate = characterStore.characters.find(c => c.姓名 === '队友A');

    expect(mainChar).toBeDefined();
    expect(teammate).toBeDefined();

    // @ts-ignore - Testing dynamic properties
    expect(mainChar?.情绪).toBe('平静');
    // @ts-ignore - Testing dynamic properties
    expect(teammate?.称号).toBe('剑客');
  });
});