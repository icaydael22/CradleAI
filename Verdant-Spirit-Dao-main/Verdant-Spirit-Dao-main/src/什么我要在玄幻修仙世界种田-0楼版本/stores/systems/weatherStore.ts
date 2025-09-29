import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import _ from 'lodash';
import { logger } from '../../core/logger';
import { updateVariables } from '../../core/variables';
import { SOLARTERMS } from '../../data/time-data';
import { emit } from '../../core/reactiveMessageBus';
import { IWeatherInfluence, IWeatherState, WeatherSchema } from '../../types';
import { useEventLogStore } from '../core/eventLogStore';
import { useTimeStore } from './timeStore';
import { useWorldStore, type WorldState } from '../core/worldStore';

declare const toastr: any;

export const useWeatherStore = defineStore('weather', () => {
  // #region Stores
  const worldStore = useWorldStore();
  const timeStore = useTimeStore();
  // #endregion

  // #region Getters
  const state = computed(() => worldStore.weather);
  // #endregion

  // #region Helpers
  type WeatherProbabilities = { [weatherName: string]: number };

  function getSolarTermAndSeason(dayOfYear: number) {
    for (let i = SOLARTERMS.length - 1; i >= 0; i--) {
      if (dayOfYear >= SOLARTERMS[i].startDay) {
        return SOLARTERMS[i];
      }
    }
    return SOLARTERMS[0];
  }

  function getWeatherProbabilitiesForSeason(season: '春' | '夏' | '秋' | '冬'): WeatherProbabilities {
    const presets = {
      '春': { '晴朗': 0.6, '微雨': 0.3, '多云': 0.1, '大风': 0, '灵气雨': 0, '风暴': 0, '暴雪': 0, '冰雹': 0 },
      '夏': { '烈日': 0.5, '雷阵雨': 0.4, '闷热': 0.1, '大风': 0, '灵气雨': 0, '风暴': 0, '暴雪': 0, '冰雹': 0.01 },
      '秋': { '秋高气爽': 0.7, '阴天': 0.2, '小雨': 0.1, '大风': 0, '灵气雨': 0, '风暴': 0, '暴雪': 0, '冰雹': 0.01 },
      '冬': { '小雪': 0.4, '阴冷': 0.4, '晴暖': 0.2, '大风': 0, '灵气雨': 0, '风暴': 0, '暴雪': 0, '冰雹': 0 },
    };
    return presets[season];
  }

  function getWeatherDetails(weatherName: string): { description: string; effects: string[] } {
      const details: { [key: string]: { description: string; effects: string[] } } = {
          '晴朗': { description: '春光明媚，微风和煦。', effects: ['心情愉悦'] },
          '微雨': { description: '细雨蒙蒙，滋润着刚刚复苏的大地。', effects: ['植物生长加速'] },
          '多云': { description: '云层较厚，偶有阳光洒落。', effects: [] },
          '烈日': { description: '骄阳似火，空气中弥漫着灼热的气息。', effects: ['体力消耗加快', '易中暑'] },
          '雷阵雨': { description: '乌云密布，雷声滚滚，大雨倾盆而下。', effects: ['雷系功法修炼加成', '危险'] },
          '闷热': { description: '天气湿热，让人有些喘不过气。', effects: ['体力恢复减慢'] },
          '秋高气爽': { description: '天高云淡，金风送爽，是一年中最舒适的时节。', effects: ['采集收获增加'] },
          '阴天': { description: '天空被灰色的云层覆盖，略带凉意。', effects: [] },
          '小雨': { description: '淅淅沥沥的秋雨，为世界染上一层清冷的色调。', effects: [] },
          '小雪': { description: '零星的雪花从天而降，给大地铺上一层薄薄的银装。', effects: ['寒冷'] },
          '阴冷': { description: '寒风刺骨，天空阴沉，万物萧瑟。', effects: ['寒冷', '体力消耗加快'] },
          '晴暖': { description: '难得的冬日暖阳，让人感到一丝暖意。', effects: [] },
          '大风': { description: '狂风呼啸，飞沙走石，令人寸步难行。', effects: ['行动不便', '部分植物可能受损'] },
          '灵气雨': { description: '天降甘霖，雨滴中蕴含着精纯的灵气，万物欢欣。', effects: ['灵气充裕', '所有植物生长加速', '修炼速度提升'] },
          '风暴': { description: '电闪雷鸣，狂风夹杂着暴雨，天色昏暗如夜。', effects: ['极度危险', '无法外出', '建筑可能受损'] },
          '暴雪': { description: '鹅毛大雪铺天盖地，寒风呼啸，能见度极低。', effects: ['极度危险', '无法外出', '建筑可能受损', '极度寒冷'] },
          '冰雹': { description: '毫无征兆地，冰冷的石块从天而降，密集地敲打着大地。', effects: ['危险', '建筑可能受损', '植物严重受损'] },
      };
      return details[weatherName] || { description: '天气异常，请检查配置。', effects: ['未知'] };
  }

  function normalizeProbabilities(probs: WeatherProbabilities): WeatherProbabilities {
      const total = Object.values(probs).reduce((sum, p) => sum + p, 0);
      if (total === 0) return probs;
      const normalized: WeatherProbabilities = {};
      for (const key in probs) {
          normalized[key] = probs[key] / total;
      }
      return normalized;
  }

  function weightedRandomChoice(probs: WeatherProbabilities): string {
      const rand = Math.random();
      let cumulative = 0;
      for (const weather in probs) {
          cumulative += probs[weather];
          if (rand < cumulative) {
              return weather;
          }
      }
      return Object.keys(probs)[0];
  }
  // #endregion

  // #region Actions
  async function updateWeatherOnTimeChange(toDay: number, fromDay: number) {
    if (!state.value || !worldStore.world.时间) return;
    
    const oldWeatherState = _.cloneDeep(state.value);
    const elapsedHours = (toDay - fromDay) * 12;
    if (elapsedHours <= 0) return;

    const activeInfluences: IWeatherInfluence[] = [];
    if (oldWeatherState.天气影响 && oldWeatherState.天气影响.length > 0) {
        oldWeatherState.天气影响.forEach(inf => {
            const newDuration = inf.剩余时长 - elapsedHours;
            if (newDuration > 0) {
                activeInfluences.push({ ...inf, 剩余时长: newDuration });
            }
        });
    }

    const dayOfYear = (toDay - 1) % 360 + 1;
    const termInfo = getSolarTermAndSeason(dayOfYear);
    const newSeason = termInfo.season as '春' | '夏' | '秋' | '冬';
    const newSolarTerm = termInfo.name;

    let weatherProbs = getWeatherProbabilitiesForSeason(newSeason);
    const temporaryEffects: string[] = [];

    activeInfluences.forEach(inf => {
        switch (inf.类型) {
            case '祈雨': {
                const rainTypes = ['微雨', '小雨', '雷阵雨', '灵气雨'];
                rainTypes.forEach(rainType => {
                    if (weatherProbs[rainType] !== undefined) {
                        const currentProb = weatherProbs[rainType];
                        weatherProbs[rainType] += (1 - currentProb) * inf.强度;
                    }
                });
                break;
            }
            case '干旱': {
                const rainTypes = ['微雨', '小雨', '雷阵雨', '小雪', '灵气雨'];
                rainTypes.forEach(rainType => {
                    if (weatherProbs[rainType] !== undefined) {
                        weatherProbs[rainType] *= (1 - inf.强度);
                    }
                });
                break;
            }
            case '强风': {
                if (weatherProbs['大风'] !== undefined) {
                    const currentProb = weatherProbs['大风'];
                    weatherProbs['大风'] += (1 - currentProb) * inf.强度;
                }
                break;
            }
            case '灵气浓郁': {
                if (weatherProbs['灵气雨'] !== undefined) {
                    const currentProb = weatherProbs['灵气雨'];
                    weatherProbs['灵气雨'] += (1 - currentProb) * inf.强度 * 0.5; // 灵气浓郁不一定下雨，所以影响权重低一些
                }
                if (!temporaryEffects.includes('灵气充裕')) {
                    temporaryEffects.push('灵气充裕');
                }
                break;
            }
            case '引发风暴': {
                if (weatherProbs['风暴'] !== undefined) {
                    const currentProb = weatherProbs['风暴'];
                    weatherProbs['风暴'] += (1 - currentProb) * inf.强度;
                }
                break;
            }
            case '引发暴雪': {
                if (newSeason === '冬' && weatherProbs['暴雪'] !== undefined) {
                    const currentProb = weatherProbs['暴雪'];
                    weatherProbs['暴雪'] += (1 - currentProb) * inf.强度;
                }
                break;
            }
            case '引发冰雹': {
                if ((newSeason === '夏' || newSeason === '秋') && weatherProbs['冰雹'] !== undefined) {
                    const currentProb = weatherProbs['冰雹'];
                    weatherProbs['冰雹'] += (1 - currentProb) * inf.强度;
                }
                break;
            }
        }
    });
    weatherProbs = normalizeProbabilities(weatherProbs);

    let newWeatherName = weightedRandomChoice(weatherProbs);
    let newWeatherDetails = getWeatherDetails(newWeatherName);

    let newSpecialPhenomenon: string | null = oldWeatherState.特殊天象 ?? null;
    // @ts-ignore
    const currentTimeOfDay = (worldStore.world as WorldState).时间.时辰 ?? '';
    // @ts-ignore
    const isNight = ['戌', '亥', '子', '丑', '寅'].includes(currentTimeOfDay);
    
    // 清理仅限夜晚的特殊天象
    if (!isNight && (oldWeatherState.特殊天象 === '血月' || oldWeatherState.特殊天象 === '双月临空')) {
        newSpecialPhenomenon = null;
    }

    // 触发新的特殊天象
    if (isNight) {
        if (activeInfluences.some(inf => inf.类型 === '引发血月')) {
            newSpecialPhenomenon = '血月';
        } else if (newSpecialPhenomenon === null) {
            // 如果没有其他天象，则有小概率触发双月
            if (Math.random() < 0.05) { // 5% 概率
                newSpecialPhenomenon = '双月临空';
                logger('info', 'WeatherStore', 'A rare phenomenon has occurred: 双月临空!');
                // 双月临空时，天气强制为晴朗
                newWeatherName = '晴朗';
                newWeatherDetails = getWeatherDetails(newWeatherName);
            }
        }
    }

    const newWeatherState: IWeatherState = {
      ...oldWeatherState,
      当前天气: newWeatherName,
      天气描述: newWeatherDetails.description,
      季节: newSeason,
      节气: newSolarTerm,
      特殊天象: newSpecialPhenomenon,
      效果: _.uniq([...newWeatherDetails.effects, ...temporaryEffects]),
      天气影响: activeInfluences,
    };

    // TODO: This function should emit an internal event to worldStore to apply the changes.
    // For now, we log the intended change.
    logger('info', 'WeatherStore', 'Calculated new weather state, emitting event.', { ...newWeatherState });
    emit('weatherCalculated', { newState: newWeatherState });
  }
  // #endregion

  // #region Watchers
  watch(() => timeStore.day, (newDay, oldDay) => {
    if (state.value === null || newDay === undefined || oldDay === undefined || newDay <= oldDay) return;
    updateWeatherOnTimeChange(newDay, oldDay);
  });

  // #endregion

  function _handleWeatherEvent(event: any, worldState: any) {
    if (!worldState.天气) return;

    const { type, payload } = event;
    const currentWeather = worldState.天气;

    if (type === '施加天气影响') {
      const { 影响类型, 强度, 持续时间, 来源, 描述 } = payload;
      if (影响类型 && typeof 强度 === 'number' && typeof 持续时间 === 'number' && 来源) {
        if (!currentWeather.天气影响) {
          currentWeather.天气影响 = [];
        }
        currentWeather.天气影响.push({
          类型: 影响类型,
          强度: 强度,
          剩余时长: 持续时间,
          来源: 来源,
          描述: 描述 || '',
        });
      } else {
        toastr.error('收到了格式不正确的“施加天气影响”事件，缺少关键字段。');
      }
    } else if (type === '设置特殊天象') {
      const { 天象类型, 来源, 描述 } = payload;
      if (天象类型 && 来源) {
          if (!currentWeather.天气影响) {
              currentWeather.天气影响 = [];
          }
          currentWeather.天气影响.push({
              类型: `引发${天象类型}`,
              强度: 1,
              剩余时长: 12, // 默认持续一个晚上
              来源: 来源,
              描述: 描述 || '',
          });
      } else {
        toastr.error('收到了格式不正确的“设置特殊天象”事件，缺少关键字段。');
      }
    }
  }

  function initialize() {
    worldStore.registerEventHandler('施加天气影响', _handleWeatherEvent);
    worldStore.registerEventHandler('设置特殊天象', _handleWeatherEvent);
  }

  return {
    state,
    _handleWeatherEvent,
    initialize,
    updateWeatherOnTimeChange, // Expose for testing
  };
});
