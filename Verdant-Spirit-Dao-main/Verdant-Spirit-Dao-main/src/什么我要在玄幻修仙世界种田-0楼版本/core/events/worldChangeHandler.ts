import { ICharacter, IWorld } from '../../types';
import { TimeChangedPayload } from '../events/definitions';
import { getIsRecalculatingState } from '../state';
import { EventHandler, EventManager } from '../eventManager';
import { logger } from '../logger';
import { PokedexManager } from '../pokedex';
import { parseTimeDetailsFromString, parseDurationToHours, dateToAbsoluteDays, absoluteDaysToDate, SHICHEN_NAMES } from '../time';
import { emit } from '../reactiveMessageBus';

declare const _: any;
declare const toastr: any;


const contextUpdateHandler: EventHandler = {
    execute: async (payload: any, currentVars: { 角色: ICharacter, 世界: IWorld }, eventManager?: EventManager, pokedexManager?: PokedexManager): Promise<Partial<{ 角色: Partial<ICharacter>; 世界: Partial<IWorld>; }>> => {
        logger('log', 'worldChangeHandler', 'Calculating context update', payload);
        
        const worldUpdates: any = {};
        const characterUpdates: any = {};

        // 新的天气影响指令处理
        if (payload['指令'] === '施加天气影响') {
            const duration = parseDurationToHours(payload['持续时间']);
            if (duration > 0) {
                const newInfluence = {
                    类型: payload['影响类型'],
                    强度: payload['强度'] || 0.5,
                    剩余时长: duration,
                    来源: payload['来源'] || '未知',
                    描述: payload['描述'] || '',
                };
                const currentWeather = _.cloneDeep(_.get(currentVars, '世界.天气', {}));
                const influences = currentWeather.天气影响 || [];
                influences.push(newInfluence);
                currentWeather.天气影响 = influences;
                
                worldUpdates['天气'] = currentWeather;
                // TODO: Migrate 'weatherInfluenceAdded' to the new message bus
                // For now, leaving the old eventEmit to avoid breaking functionality.
                // eventEmit('weatherInfluenceAdded', newInfluence);
                logger('log', 'worldChangeHandler', 'New weather influence added:', newInfluence);
            }
        }

        // Time update logic v4.0
        if (payload['时间']) {
            const timePayload = payload['时间'];
            const currentTimeState = _.get(currentVars, '世界.时间', { day: 1, timeOfDay: '子时' });
            logger('info', 'worldChangeHandler', '[Time Calculation] Start', {
              llmPayload: timePayload,
              currentState: _.cloneDeep(currentTimeState),
            });

            let newDay = currentTimeState.day;
            let newTimeOfDay = currentTimeState.timeOfDay;

            if (typeof timePayload === 'string') {
                // Handle legacy string format
                logger('log', 'worldChangeHandler', '[Time Calculation] Handling string payload.');
                const parsed = parseTimeDetailsFromString(timePayload);
                if (parsed) {
                    newDay = parsed.relativeDay; // Assuming relativeDay is the absolute day for simplicity here
                    newTimeOfDay = `${parsed.hourName}时`;
                    logger('log', 'worldChangeHandler', '[Time Calculation] Parsed string successfully.', { parsed, newDay, newTimeOfDay });
                } else {
                    logger('error', 'worldChangeHandler', `[TIME VALIDATION FAILED] Could not parse time details from LLM string: "${timePayload}".`);
                }
            } else if (typeof timePayload === 'object') {
                // Handle new object format
                logger('log', 'worldChangeHandler', '[Time Calculation] Handling object payload.');
                if (timePayload.day !== undefined) {
                    newDay = timePayload.day;
                }
                if (timePayload.timeOfDay !== undefined) {
                    newTimeOfDay = timePayload.timeOfDay;
                }
                logger('log', 'worldChangeHandler', '[Time Calculation] Extracted from object.', { newDay, newTimeOfDay });
            }

            // Validate that time does not go backwards
            const currentHourIndex = SHICHEN_NAMES.indexOf(currentTimeState.timeOfDay.replace('时','')) || 0;
            const currentTotalHours = (currentTimeState.day - 1) * 12 + currentHourIndex;

            const newHourIndex = SHICHEN_NAMES.indexOf(newTimeOfDay.replace('时','')) || 0;
            const newTotalHours = (newDay - 1) * 12 + newHourIndex;
            
            logger('info', 'worldChangeHandler', '[Time Calculation] Comparing absolute hours.', {
              current: { day: currentTimeState.day, time: currentTimeState.timeOfDay, totalHours: currentTotalHours },
              new: { day: newDay, time: newTimeOfDay, totalHours: newTotalHours },
            });

            if (newTotalHours >= currentTotalHours) {
                // 使用当前状态作为基础，确保所有字段都存在
                const newTimeState = { ...currentTimeState, day: newDay, timeOfDay: newTimeOfDay };
                worldUpdates['时间'] = newTimeState;
                
                logger('info', 'worldChangeHandler', `[Time Calculation] Time update successful.`, { from: currentTimeState, to: newTimeState });

                const eventPayload: TimeChangedPayload = {
                    fromDay: currentTimeState.day,
                    toDay: newDay,
                    fromTimeOfDay: currentTimeState.timeOfDay,
                    toTimeOfDay: newTimeOfDay,
                };
                emit('timeChanged', eventPayload);
                logger('log', 'worldChangeHandler', 'Event emitted via reactiveMessageBus: timeChanged', eventPayload);
            } else {
                logger('error', 'worldChangeHandler', `[TIME VALIDATION FAILED] LLM tried to move time backwards. Current: Day ${currentTimeState.day} Hour ${currentTotalHours}, LLM: Day ${newDay} Hour ${newTotalHours}. Ignoring time update.`);
                if (!getIsRecalculatingState()) {
                    toastr.error('AI返回了无效的时间（时间倒流），时间更新已被忽略。');
                }
            }
        }

        if (payload['地点']) {
            worldUpdates['地点'] = payload['地点'];
        }

        // 角色状态的更新
        if (payload['口渴度'] !== undefined) {
            _.set(characterUpdates, '状态.口渴度', payload['口渴度']);
        }
        if (payload['饱腹度'] !== undefined) {
            _.set(characterUpdates, '状态.饱腹度', payload['饱腹度']);
        }
        if (payload['体力'] !== undefined) {
            _.set(characterUpdates, '状态.体力', payload['体力']);
        }
        if (payload['灵力'] !== undefined) {
            _.set(characterUpdates, '状态.灵力', payload['灵力']);
        }

        const updates: any = {};
        if (!_.isEmpty(worldUpdates)) {
            updates.世界 = worldUpdates;
        }
        if (!_.isEmpty(characterUpdates)) {
            updates.角色 = characterUpdates;
        }

        return updates;
    },
};

export { contextUpdateHandler };
