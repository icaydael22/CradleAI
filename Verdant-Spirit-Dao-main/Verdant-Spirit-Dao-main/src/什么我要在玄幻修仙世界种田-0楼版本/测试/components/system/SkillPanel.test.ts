import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import SkillPanel from '@/components/system/SkillPanel.vue';
import { useSkillStore } from '../../../stores/systems/skillStore';
import { useDetailsStore } from '../../../stores/ui/detailsStore';
import { useWorldStore } from '../../../stores/core/worldStore';

// Mock the details store
const mockShowDetails = vi.fn();
vi.mock('../../../stores/ui/detailsStore', () => ({
  useDetailsStore: () => ({
    showDetails: mockShowDetails,
  }),
}));

describe('SkillPanel.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockShowDetails.mockClear();
  });

  const mockSkills = {
    gongfa1: { id: 'gongfa1', 名称: '基础心法', 类别: '功法', 等级: 3, 熟练度: 50 },
    gongfa2: { id: 'gongfa2', 名称: '烈火掌', 类别: '功法', 等级: 1, 熟练度: 10 },
    shenghuo1: { id: 'shenghuo1', 名称: '采药', 类别: '生活', 等级: 5, 熟练度: 80 },
  };

  const getMockWorldState = (skills: any) => ({
    角色: {
      '主控角色名': '主角',
      '主角': {
        姓名: '主角',
        技能: skills,
      },
    },
  });

  const createWrapper = (skills: any) => {
    const pinia = createTestingPinia({
      // We don't stub actions because we are not testing them here.
      // We manually set getters.
    });

    // Manually set the state and getters for the skill store
    const skillStore = useSkillStore(pinia);
    
    const skillList = Object.values(skills);
    // @ts-ignore
    skillStore.skills = skillList;
    // @ts-ignore
    skillStore.hasSkills = skillList.length > 0;
    // @ts-ignore
    skillStore.gongfaSkills = skillList.filter(s => s.类别 === '功法');
    // @ts-ignore
    skillStore.shengHuoSkills = skillList.filter(s => s.类别 === '生活');

    const wrapper = mount(SkillPanel, {
      global: {
        plugins: [pinia],
      },
    });
    return wrapper;
  };

  it('renders empty state message when no skills are available', () => {
    const wrapper = createWrapper({});
    expect(wrapper.text()).toContain('尚未学习任何技能。');
  });

  it('renders both gongfa and shenghuo skills correctly', async () => {
    const wrapper = createWrapper(mockSkills);
    await wrapper.vm.$nextTick();

    // Check for headers
    expect(wrapper.text()).toContain('功法');
    expect(wrapper.text()).toContain('功法');
    expect(wrapper.text()).toContain('生活');

    // Find all section wrappers inside the main container
    const sections = wrapper.findAll('.space-y-4 > div');

    // Identify sections by their headings
    const gongfaSectionWrapper = sections.find(s => s.find('h4').text() === '功法');
    const shenghuoSectionWrapper = sections.find(s => s.find('h4').text() === '生活');

    // Check gongfa skills
    expect(gongfaSectionWrapper).toBeDefined();
    const gongfaSkills = gongfaSectionWrapper!.findAll('.cursor-pointer');
    expect(gongfaSkills.length).toBe(2);
    expect(gongfaSectionWrapper!.text()).toContain('基础心法');
    expect(gongfaSectionWrapper!.text()).toContain('Lv. 3');
    expect(gongfaSectionWrapper!.text()).toContain('50 / 100');
    const gongfaProgressBar = gongfaSectionWrapper!.find('.progress-bar-fg');
    expect(gongfaProgressBar.attributes('style')).toContain('width: 50%');

    // Check shenghuo skills
    expect(shenghuoSectionWrapper).toBeDefined();
    const shenghuoSkills = shenghuoSectionWrapper!.findAll('.cursor-pointer');
    expect(shenghuoSkills.length).toBe(1);
    expect(shenghuoSectionWrapper!.text()).toContain('采药');
    expect(shenghuoSectionWrapper!.text()).toContain('Lv. 5');
    expect(shenghuoSectionWrapper!.text()).toContain('80 / 100');
    const shenghuoProgressBar = shenghuoSectionWrapper!.find('.progress-bar-fg');
    expect(shenghuoProgressBar.attributes('style')).toContain('width: 80%');
  });

  it('renders only gongfa skills when no shenghuo skills are available', async () => {
    const onlyGongfa = { ...mockSkills };
    delete (onlyGongfa as any).shenghuo1;
    const wrapper = createWrapper(onlyGongfa);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('⚙️ 技能面板');
    expect(wrapper.text()).not.toContain('生活');
    const skills = wrapper.findAll('.cursor-pointer');
    expect(skills.length).toBe(2);
  });

  it('renders only shenghuo skills when no gongfa skills are available', async () => {
    const onlyShenghuo = { shenghuo1: mockSkills.shenghuo1 };
    const wrapper = createWrapper(onlyShenghuo);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain('功法');
    expect(wrapper.text()).toContain('⚙️ 技能面板');
    const skills = wrapper.findAll('.cursor-pointer');
    expect(skills.length).toBe(1);
  });

  it('calls detailsStore.showDetails when a skill is clicked', async () => {
    const wrapper = createWrapper(mockSkills);
    await wrapper.vm.$nextTick();

    const firstSkill = wrapper.find('.cursor-pointer');
    await firstSkill.trigger('click');

    expect(mockShowDetails).toHaveBeenCalledTimes(1);
    // The store getter returns an array, so we check against the object from the mock
    expect(mockShowDetails).toHaveBeenCalledWith(expect.objectContaining({
      id: 'gongfa1',
      名称: '基础心法',
    }));
  });
});