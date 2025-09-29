// @ts-nocheck
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import CharacterCard from '@/components/team/CharacterCard.vue';
import type { ICharacter } from '@/types';

// Mock data for testing
const baseCharacter: ICharacter = {
  姓名: '测试角色',
  等级: 10,
  职业: '修士',
  种族: '人族',
  年龄: 100,
};

const mainCharacterDetails = {
  特质: ['天选之人', '勤奋'],
  天赋: {
    根骨: 9,
    悟性: 8,
    气运: 7,
  },
  状态: {
    体力: { value: 80, max: 100 },
    灵力: { value: 40, max: 100 },
    心神: { value: 20, max: 100 },
  },
  籍贯: '东土大唐',
  外貌特征: '剑眉星目',
  身份背景: {
    前世: '凡人',
    现世: '宗门弟子',
  },
  性格特点: {
    核心: '坚毅',
    习惯: '冥想',
  },
  自定义属性: '这是额外信息',
};

const fullMainCharacter: ICharacter = {
  ...baseCharacter,
  ...mainCharacterDetails,
};

describe('CharacterCard.vue', () => {
  const createWrapper = (character: ICharacter, isMainCharacter: boolean) => {
    return mount(CharacterCard, {
      props: {
        character,
        isMainCharacter,
      },
    });
  };

  it('应该渲染所有角色的基本信息', () => {
    const wrapper = createWrapper(baseCharacter, false);
    expect(wrapper.text()).toContain('测试角色');
    expect(wrapper.text()).toContain('等级: 10');
    expect(wrapper.text()).toContain('职业: 修士');
    expect(wrapper.text()).toContain('种族: 人族');
    expect(wrapper.text()).toContain('年龄: 100');
  });

  it('当 isMainCharacter 为 false 时，不应渲染详细信息', () => {
    const wrapper = createWrapper(fullMainCharacter, false);
    // 详细信息不应该被渲染
    expect(wrapper.text()).not.toContain('特质:');
    expect(wrapper.text()).not.toContain('天赋:');
    expect(wrapper.text()).not.toContain('状态:');
    expect(wrapper.find('details').exists()).toBe(false);
  });

  it('当 isMainCharacter 为 true 时，应该渲染所有详细信息', async () => {
    const wrapper = createWrapper(fullMainCharacter, true);

    // 检查特质
    expect(wrapper.text()).toContain('特质:');
    expect(wrapper.text()).toContain('天选之人');
    expect(wrapper.text()).toContain('勤奋');

    // 检查天赋 (对象形式)
    expect(wrapper.text()).toContain('天赋:');
    expect(wrapper.text()).toContain('根骨: 9');
    expect(wrapper.text()).toContain('悟性: 8');
    expect(wrapper.text()).toContain('气运: 7');

    // 检查状态
    expect(wrapper.text()).toContain('状态:');
    expect(wrapper.text()).toContain('体力');
    expect(wrapper.text()).toContain('80 / 100');
    expect(wrapper.text()).toContain('灵力');
    expect(wrapper.text()).toContain('40 / 100');

    // 检查可折叠的详细信息
    const details = wrapper.find('details');
    expect(details.exists()).toBe(true);
    expect(details.text()).toContain('籍贯: 东土大唐');
    expect(details.text()).toContain('外貌: 剑眉星目');
    expect(details.text()).toContain('前世: 凡人');
    expect(details.text()).toContain('核心: 坚毅');
  });

  it('应该能正确渲染数组形式的天赋', async () => {
    const charWithArrayTalent = {
      ...fullMainCharacter,
      天赋: ['剑道奇才', '炼丹圣手'],
    };
    const wrapper = createWrapper(charWithArrayTalent, true);
    expect(wrapper.text()).toContain('天赋:');
    const talentItems = wrapper.findAll('ul > li');
    expect(talentItems.some(item => item.text() === '剑道奇才')).toBe(true);
    expect(talentItems.some(item => item.text() === '炼丹圣手')).toBe(true);
  });

  it('应该在详细信息部分渲染额外的自定义属性', () => {
    const wrapper = createWrapper(fullMainCharacter, true);
    const details = wrapper.find('details');
    // 查找所有动态渲染的属性 div
    const additionalPropertiesDivs = details.findAll('div > span.font-semibold');
    // 找到包含“自定义属性”文本的那个 span
    const customPropSpan = additionalPropertiesDivs.find(span => span.text().startsWith('自定义属性'));
    // 断言该 span 存在，并且其父元素 div 的完整文本是我们期望的
    expect(customPropSpan).toBeDefined();
    expect(customPropSpan!.element.parentElement!.textContent).toContain('自定义属性:这是额外信息');
  });

  it('应该根据状态百分比应用正确的进度条颜色', () => {
    const wrapper = createWrapper(fullMainCharacter, true);
    const progressBars = wrapper.findAll('.progress-bar-fg');

    // 体力: 80/100 = 80% -> green
    const healthBar = progressBars.find(bar => (bar.element as HTMLElement).style.width === '80%');
    expect(healthBar?.classes()).toContain('bg-green-500');

    // 灵力: 40/100 = 40% -> yellow
    const manaBar = progressBars.find(bar => (bar.element as HTMLElement).style.width === '40%');
    expect(manaBar?.classes()).toContain('bg-yellow-500');

    // 心神: 20/100 = 20% -> red
    const spiritBar = progressBars.find(bar => (bar.element as HTMLElement).style.width === '20%');
    expect(spiritBar?.classes()).toContain('bg-red-500');
  });

  it('如果某些数据字段缺失，则不应渲染对应的部分', () => {
    const partialCharacter: ICharacter = {
      姓名: '残缺的角色',
      // 等级, 职业, 种族, 年龄 缺失
    };
    const wrapper = createWrapper(partialCharacter, true);

    expect(wrapper.text()).toContain('残缺的角色');
    expect(wrapper.text()).not.toContain('等级:');
    expect(wrapper.text()).not.toContain('职业:');
    expect(wrapper.text()).not.toContain('特质:');
    expect(wrapper.text()).not.toContain('状态:');
  });
});