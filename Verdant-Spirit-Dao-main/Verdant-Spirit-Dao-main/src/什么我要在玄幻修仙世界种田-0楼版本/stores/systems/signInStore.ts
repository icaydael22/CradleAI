// src/什么我要在玄幻修仙世界种田-0楼版本/stores/systems/signInStore.ts

import { defineStore } from 'pinia';
import { computed, watch } from 'vue';
import _ from 'lodash';
import { useTimeStore } from './timeStore';
import { useWorldStore, type WorldState } from '../core/worldStore';
import { emit } from '../../core/reactiveMessageBus';
import { TimeManager, dateToAbsoluteDays } from '../../core/time';
import { logger } from '../../core/logger';
import { useActionStore } from '../ui/actionStore';
import type { GameEvent } from '../core/eventLogStore';

declare const toastr: any;

// --- 辅助函数：中文数字转阿拉伯数字 ---
const chineseToArabic = (text: string): number => {
    const charMap: { [key: string]: number } = {
        '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    };
    const unitMap: { [key: string]: number } = {
        '十': 10, '百': 100, '千': 1000, '万': 10000,
    };

    if (!isNaN(Number(text))) {
        return Number(text);
    }

    let total = 0;
    let currentNum = 0;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char in charMap) {
            currentNum = charMap[char];
        } else if (char in unitMap) {
            if (char === '十' && currentNum === 0) {
                currentNum = 1;
            }
            total += currentNum * unitMap[char];
            currentNum = 0;
        }
    }
    total += currentNum;
    return total;
};

export const useSignInStore = defineStore('signIn', () => {
  const worldStore = useWorldStore();
  const actionStore = useActionStore();
  const timeStore = useTimeStore();

  // Getters - All data is derived reactively from worldStore
  const signInData = computed(() => worldStore.world?.签到);
  const currentDate = computed(() => worldStore.world?.当前日期);

  const systemName = computed(() => signInData.value?.名称 || '签到系统');
  const hasSignedInToday = computed(() => signInData.value?.今日已签到 || false);
  const consecutiveDays = computed(() => signInData.value?.连续签到天数 || 0);
  const monthlyCard = computed(() => signInData.value?.月卡 || { 状态: '未激活', activatedDate: null });

  const isMonthlyCardActive = computed(() => {
    const card = monthlyCard.value;
    if (card.状态 !== '已激活' || !card.activatedDate) {
      return false;
    }
    const daysPassed = timeStore.day - card.activatedDate;
    return daysPassed >= 0 && daysPassed < 30;
  });

  const calendarData = computed(() => {
    if (!currentDate.value) return { year: 0, month: 0, days: [] };

    const { 年: year, 月: month, 日: todayInGame } = currentDate.value;
    const recordKey = `Y${year}M${month}`;
    const signedInDays = _.get(signInData.value, ['签到记录', recordKey], []) as number[];
    const daysInMonth = 30; // Game setting: 30 days per month

    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const dayNumber = i + 1;
      return {
        day: dayNumber,
        isToday: dayNumber === todayInGame,
        isSignedIn: signedInDays.includes(dayNumber),
      };
    });

    return { year, month, days };
  });

  // Actions
  async function signIn() {
    logger('info', 'SignInStore', 'User initiated sign-in action.');
    await actionStore.triggerSystemAction('我决定进行今日签到。');
  }

  async function activateMonthlyCard() {
    logger('info', 'SignInStore', 'User initiated monthly card activation.');
    await actionStore.triggerSystemAction('我想要激活月卡。');
  }

  async function retroactiveSignIn(dateString: string) {
    logger('info', 'SignInStore', `User initiated retroactive sign-in for ${dateString}.`);
    await actionStore.triggerSystemAction(`我消耗了一张【补签卡】，对 ${dateString} 进行了补签。`);
  }

  // Watch for day changes to reset daily status
  watch(() => timeStore.day, (newDay, oldDay) => {
    if (!worldStore.world || !signInData.value) return;
    if (newDay === oldDay || oldDay === 0) return; // Ignore initial set or same-day changes

    logger('log', 'SignInStore', `New day detected. From day ${oldDay} to ${newDay}. Resetting daily sign-in status.`);
    
    const newSignInData = _.cloneDeep(signInData.value);
    newSignInData.今日已签到 = false;

    // Check for monthly card expiration
    const card = newSignInData.月卡;
    if (card && card.状态 === '已激活' && card.activatedDate) {
      const daysPassed = newDay - card.activatedDate;
      if (daysPassed >= 30) {
        logger('info', 'SignInStore', `Monthly card expired. Activated on day ${card.activatedDate}, current day is ${newDay}.`);
        card.状态 = '未激活';
        card.activatedDate = null;
        toastr.info('您的月卡已过期。');
      }
    }

    worldStore.updateWorldState('签到', newSignInData);
  });

  // #region Event Handlers

  /**
   * 重新计算并更新连续签到天数。
   * 这是签到系统的核心逻辑，确保在任何签到记录变化后都能得到正确的连续天数。
   */
  function recalculateConsecutiveDays(worldState: WorldState) {
    const signInState = worldState.签到;
    const today = worldState.当前日期;
    if (!signInState || !today) return;

    const allSignedDays = new Set<number>();
    if (signInState.签到记录) {
      // 将所有签到记录转换为总天数
      for (const key in signInState.签到记录) {
        const match = key.match(/Y(\d+)M(\d+)/);
        if (match && match[1] && match[2]) {
          const year = parseInt(match[1], 10);
          const month = parseInt(match[2], 10);
          const daysInMonth = signInState.签到记录[key];
          daysInMonth.forEach(day => {
            allSignedDays.add(dateToAbsoluteDays({ 年: year, 月: month, 日: day }));
          });
        }
      }
    }

    let consecutive = 0;
    let currentDayInTotal = dateToAbsoluteDays(today);

    // 从今天或昨天开始向前追溯
    // 如果今天还没签到，就从昨天开始算连续
    if (!allSignedDays.has(currentDayInTotal)) {
      currentDayInTotal--;
    }

    while (allSignedDays.has(currentDayInTotal)) {
      consecutive++;
      currentDayInTotal--;
    }
    
    if (signInState.连续签到天数 !== consecutive) {
        logger('info', 'SignInStore', `连续签到天数已更新: ${signInState.连续签到天数} -> ${consecutive}`);
        signInState.连续签到天数 = consecutive;
    }
  }

  function handleSignInEvent(event: GameEvent, worldState: WorldState) {
    const signInState = worldState.签到;
    if (!signInState) {
        logger('error', 'signInStore', 'Sign-in state is not initialized in world state.');
        return;
    }

    const { date: eventDatePayload, days: eventDaysPayload } = event.payload || {};
    const currentDateFromWorld = worldState.当前日期;

    // Handle multi-day sign-in
    if (Array.isArray(eventDaysPayload) && currentDateFromWorld) {
      const { 年: year, 月: month } = currentDateFromWorld;
      const recordKey = `Y${year}M${month}`;
      if (!signInState.签到记录) signInState.签到记录 = {};
      const monthRecords: number[] = _.get(signInState, ['签到记录', recordKey], []);
      
      let newSignIns = 0;
      eventDaysPayload.forEach((day: number) => {
        if (!monthRecords.includes(day)) {
          monthRecords.push(day);
          newSignIns++;
        }
      });
      _.set(signInState, ['签到记录', recordKey], monthRecords);
      if (newSignIns > 0) {
        toastr.success(`成功补签 ${newSignIns} 天！`);
        recalculateConsecutiveDays(worldState); // Recalculate after bulk update
      }
      return;
    }

    // Handle single-day sign-in (today or retroactive)
    const gameDate = eventDatePayload
      ? TimeManager.parseGameDate(eventDatePayload, chineseToArabic)
      : currentDateFromWorld
        ? { year: currentDateFromWorld.年, month: currentDateFromWorld.月, day: currentDateFromWorld.日 }
        : null;

    if (!gameDate) {
      logger('error', 'signInStore', 'Could not determine date for sign-in event. Skipping.', { event });
      toastr.error('处理“签到”事件失败：无法确定签到日期。');
      return;
    }

    const { year, month, day } = gameDate;
    const recordKey = `Y${year}M${month}`;

    const isTodaySignIn = !eventDatePayload ||
                          (currentDateFromWorld &&
                           gameDate.year === currentDateFromWorld.年 &&
                           gameDate.month === currentDateFromWorld.月 &&
                           gameDate.day === currentDateFromWorld.日);

    // 检查是否已签到
    if (!signInState.签到记录) signInState.签到记录 = {};
    const monthRecords: number[] = _.get(signInState, ['签到记录', recordKey], []);
    if (monthRecords.includes(day)) {
      if (isTodaySignIn) toastr.info('今日已签到，请勿重复操作。');
      return; // Already signed in, do nothing
    }

    // 记录签到
    monthRecords.push(day);
    _.set(signInState, ['签到记录', recordKey], monthRecords);

    if (isTodaySignIn) {
      signInState.今日已签到 = true;
    } else {
      toastr.success(`成功为 ${year}年${month}月${day}日 补签！`);
    }

    // 重新计算连续天数
    recalculateConsecutiveDays(worldState);
    
    const newConsecutive = signInState.连续签到天数 || 0;

    if (isTodaySignIn) {
      toastr.success(`签到成功！这是您连续签到的第 ${newConsecutive} 天。`);
    }

    // 检查7日奖励
    if (newConsecutive > 0 && newConsecutive % 7 === 0) {
      toastr.info(`连续签到${newConsecutive}天，获得一张【补签卡】！`);
      emit('awardItem', { itemName: '补签卡', quantity: 1, source: '连续签到奖励' });
    }
  }
  // #endregion

  // #region Initialization
  function initializeEventHandlers() {
    logger('log', 'signInStore', 'Registering event handlers...');
    worldStore.registerEventHandler('签到', (event, worldState) => {
        if (!worldState.签到) {
          worldState.签到 = { 连续签到天数: 0, 今日已签到: false, 签到记录: {}, 月卡: { 状态: '未激活', activatedDate: null } };
        }
        handleSignInEvent(event, worldState);
    });

    worldStore.registerEventHandler('月卡激活', (event, worldState) => {
      if (!worldState.签到) {
        worldState.签到 = { 连续签到天数: 0, 今日已签到: false, 签到记录: {}, 月卡: { 状态: '未激活', activatedDate: null } };
      }
      const currentDay = worldState.时间?.day;
      if (currentDay === undefined) {
        logger('error', 'signInStore', 'Cannot activate monthly card: current day is unknown.');
        return;
      }
      worldState.签到.月卡 = {
        状态: '已激活',
        activatedDate: currentDay,
      };
      logger('info', 'signInStore', `Monthly card activated on day ${currentDay}.`);
      toastr.success('月卡已激活！');
    });
  }

  initializeEventHandlers();
  // #endregion

  return {
    isLoading: computed(() => worldStore.world === null),
    currentDate,
    systemName,
    hasSignedInToday,
    consecutiveDays,
    monthlyCard,
    isMonthlyCardActive,
    calendarData,
    signIn,
    activateMonthlyCard,
    retroactiveSignIn,
  };
});
