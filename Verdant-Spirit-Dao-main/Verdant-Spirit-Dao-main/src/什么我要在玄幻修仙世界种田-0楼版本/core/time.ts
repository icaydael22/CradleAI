// src/什么我要在玄幻修仙世界种田-0楼版本/core/time.ts

import { logger } from './logger';

/**
 * TimeManager 负责处理所有与游戏内时间相关的逻辑，
 * 包括解析、格式化和根据游戏进程提供不同的显示文本。
 */
export class TimeManager {
  constructor() {
    // 构造函数可以留空，或用于未来的初始化逻辑
  }

  /**
   * 从游戏时间字符串或对象中解析出结构化的日期信息。
   * @param dateInput - 可以是 "第一年一月一日" 这样的字符串，也可以是 { 年: 1, 月: 1, 日: 1 } 这样的对象。
   * @param parser - 一个可选的函数，用于将字符串中的中文数字转换为阿拉伯数字。
   * @returns 一个包含年、月、日的对象，如果解析失败则返回 null。
   */
  public static parseGameDate(
    dateInput: string | { 年: number, 月: number, 日: number },
    parser?: (text: string) => number
  ): { year: number, month: number, day: number } | null {
    logger('info', 'Time', 'parseGameDate called with:', dateInput);

    if (typeof dateInput === 'object' && dateInput !== null) {
        const { 年: year, 月: month, 日: day } = dateInput;
        if (typeof year === 'number' && typeof month === 'number' && typeof day === 'number') {
            const result = { year, month, day };
            logger('log', 'Time', `Successfully parsed date object.`, result);
            return result;
        }
    }

    if (typeof dateInput === 'string' && parser) {
        const match = dateInput.match(/第一年([一二三四五六七八九十百千万\d]+)月([一二三四五六七八九十百千万\d]+)日/);
        if (match && match[1] && match[2]) {
            const month = parser(match[1]);
            const day = parser(match[2]);
            const result = { year: 1, month, day };
            logger('log', 'Time', `Successfully parsed date string "${dateInput}".`, result);
            return result;
        }
    }
    
    logger('warn', 'Time', 'Invalid date input or format:', dateInput);
    return null;
  }
}

/**
 * Converts a date object to a total day count from year 1, day 1.
 * @param date The date object { 年, 月, 日 }.
 * @returns The absolute day count.
 */
export const dateToAbsoluteDays = (date: { 年: number, 月: number, 日: number }): number => {
    if (!date) return 0;
    return (date.年 - 1) * 360 + (date.月 - 1) * 30 + date.日;
}

/**
 * Converts an absolute day count back to a date object.
 * @param absoluteDays The absolute day count from year 1, day 1.
 * @returns The date object { 年, 月, 日 }.
 */
export const absoluteDaysToDate = (absoluteDays: number): { 年: number, 月: number, 日: number } => {
    const year = Math.floor((absoluteDays - 1) / 360) + 1;
    const dayInYear = (absoluteDays - 1) % 360;
    const month = Math.floor(dayInYear / 30) + 1;
    const day = (dayInYear % 30) + 1;
    return { 年: year, 月: month, 日: day };
}

export const parseDayFromChinese = (chineseNum: string): number | null => {
    logger('info', 'Time', 'parseDayFromChinese called with:', chineseNum);
    if (!chineseNum) return null;
    const numMap: { [key: string]: number } = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    };

    // Handle simple case "十"
    if (chineseNum === '十') return 10;

    const parts = chineseNum.split('十');

    if (parts.length === 1) { // No '十'
        return numMap[parts[0]] || null;
    } else if (parts.length === 2) { // Contains '十'
        const tenPart = parts[0];
        const onePart = parts[1];
        let day = 0;

        if (tenPart === '') { // Starts with '十', e.g., "十一"
            day = 10;
        } else if (numMap[tenPart]) { // e.g., "二十"
            day = numMap[tenPart] * 10;
        } else {
            return null; // Invalid format before '十'
        }

        if (onePart !== '') {
            if (numMap[onePart]) { // e.g., "二十一"
                day += numMap[onePart];
            } else {
                return null; // Invalid format after '十'
            }
        }
        logger('log', 'Time', `Parsed Chinese day number "${chineseNum}" to ${day}.`);
        return day;
    }

    logger('warn', 'Time', 'Unsupported Chinese number format:', chineseNum);
    return null; // More than one '十', format not supported
};

/**
 * 计算从开局日期到当前日期总共经过了多少天。
 * @param currentDate - 当前日期对象 { 年, 月, 日 }。
 * @param startDate - 开局日期对象 { 年, 月, 日 }。
 * @returns {number} 总天数。
 */
export const getTotalDays = (currentDate: { 年: number, 月: number, 日: number }, startDate: { 年: number, 月: number, 日: number }): number => {
    if (!currentDate || !startDate) {
        return 1;
    }
    // 假设每年360天，每月30天
    const startDays = (startDate.年 - 1) * 360 + (startDate.月 - 1) * 30 + startDate.日;
    const currentDays = (currentDate.年 - 1) * 360 + (currentDate.月 - 1) * 30 + currentDate.日;
    return currentDays - startDays + 1;
};

/**
 * 中国古代时辰映射表。
 * 一天分为12个时辰，每个时辰等于现代的2个小时。
 */
const SHICHEN_MAP: { [key: string]: number } = {
  '子': 0, '丑': 1, '寅': 2, '卯': 3, '辰': 4, '巳': 5,
  '午': 6, '未': 7, '申': 8, '酉': 9, '戌': 10, '亥': 11,
};
export const SHICHEN_NAMES = Object.keys(SHICHEN_MAP);


/**
 * 常见时间描述到时辰的映射。
 */
const TIME_OF_DAY_MAP: { [key: string]: { name: string, index: number } } = {
    '子时': { name: '子', index: 0 }, '丑时': { name: '丑', index: 1 },
    '寅时': { name: '寅', index: 2 }, '卯时': { name: '卯', index: 3 },
    '辰时': { name: '辰', index: 4 }, '巳时': { name: '巳', index: 5 },
    '午时': { name: '午', index: 6 }, '未时': { name: '未', index: 7 },
    '申时': { name: '申', index: 8 }, '酉时': { name: '酉', index: 9 },
    '戌时': { name: '戌', index: 10 }, '亥时': { name: '亥', index: 11 },
    '清晨': { name: '辰', index: 4 },
    '上午': { name: '巳', index: 5 },
    '中午': { name: '午', index: 6 },
    '午后': { name: '未', index: 7 },
    '黄昏': { name: '酉', index: 9 },
    '傍晚': { name: '酉', index: 9 },
    '深夜': { name: '子', index: 0 },
};


/**
 * From LLM's time string, parse out the relative day and time of day.
 * @param timeStr - e.g., "穿越后第二天辰时"
 * @returns An object with relative day and hour info, or null on failure.
 */
export const parseTimeDetailsFromString = (timeStr: string): {
  relativeDay: number;
  hourIndex: number;
  hourName: string;
} | null => {
  if (!timeStr) return null;

  // Match "第X天" or "第X日"
  const dayPartMatch = timeStr.match(/第(\S+)[天日]/);
  if (!dayPartMatch || !dayPartMatch[1]) return null;

  const relativeDay = parseDayFromChinese(dayPartMatch[1]);
  if (relativeDay === null) return null;

  let hourIndex = 6; // Default to 午时
  let hourName = '午';

  // Robust hour parsing, supports fuzzy descriptions
  const timeOfDayKeywords = Object.keys(TIME_OF_DAY_MAP);
  const foundKeyword = timeOfDayKeywords.find(keyword => timeStr.includes(keyword));

  if (foundKeyword) {
      const timeDetails = TIME_OF_DAY_MAP[foundKeyword];
      hourName = timeDetails.name;
      hourIndex = timeDetails.index;
  } else {
      // Fallback to exact "X时" match
      const hourPartMatch = timeStr.match(/(\S+)时/);
      if (hourPartMatch && hourPartMatch[1] && Object.prototype.hasOwnProperty.call(SHICHEN_MAP, hourPartMatch[1])) {
          hourName = hourPartMatch[1];
          hourIndex = SHICHEN_MAP[hourName];
      }
  }

  return { relativeDay, hourIndex, hourName };
};

/**
 * 从持续时间字符串中解析出时辰数。
 * @param durationStr - 例如 "12个时辰"
 * @returns 时辰数，如果解析失败则返回 0。
 */
export const parseDurationToHours = (durationStr: string): number => {
    if (!durationStr) return 0;
    const match = durationStr.match(/(\d+)\s*个?时辰/);
    if (match && match[1]) {
        return parseInt(match[1], 10);
    }
    return 0;
};
