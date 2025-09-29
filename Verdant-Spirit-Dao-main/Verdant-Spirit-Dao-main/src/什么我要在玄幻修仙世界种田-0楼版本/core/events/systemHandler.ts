import { ICharacter, IWorld } from '../../types';
import { EventManager, EventHandler } from '../eventManager';
import { PokedexManager } from '../pokedex';
import { logger } from '../logger';

declare const _: any;
declare const toastr: any;


const systemConfirmationHandler: EventHandler = {
    execute: async (payload: any, currentVars: { 角色: ICharacter, 世界: IWorld }, eventManager?: EventManager, pokedexManager?: PokedexManager): Promise<Partial<{ 角色: Partial<ICharacter>; 世界: Partial<IWorld>; }>> => {
        logger('log', 'systemHandler', 'Confirming system for the game', payload);
        const systemName = payload['系统名称'];
        if (!systemName) {
            logger('warn', 'systemHandler', '[systemConfirmationHandler] Event data is missing "系统名称".', payload);
            return {};
        }

        const updates: any = {
            当前激活系统: { 名称: systemName }
        };

        // Initialize the specific system's state object
        switch (systemName) {
            case '成就系统':
                updates['成就'] = { 成就点数: 0, completed: {} };
                break;
            case '技能面板':
                updates['技能'] = { skills: {} };
                break;
            case '签到系统':
                updates['签到'] = {
                    签到记录: {},
                    连续签到天数: 0,
                    今日已签到: false,
                    月卡: { 状态: '未激活', 剩余天数: 0 }
                };
                break;
            // Add other systems here
        }
        
        logger('info', 'systemHandler', '[systemConfirmationHandler] System confirmed and initialized.');
        
        return { 世界: updates };
    },
};

const newAchievementHandler: EventHandler = {
    execute: async (payload: any, currentVars: { 角色: ICharacter, 世界: IWorld }, eventManager?: EventManager, pokedexManager?: PokedexManager): Promise<Partial<{ 角色: Partial<ICharacter>; 世界: Partial<IWorld>; }>> => {
        logger('log', 'systemHandler', 'Calculating new achievement update', payload);
        const newAchievements = Array.isArray(payload) ? payload : [payload];
        const achievementData = _.cloneDeep(_.get(currentVars, '世界.成就', { 成就点数: 0, completed: {} }));
        let hasNew = false;

        newAchievements.forEach((ach: any) => {
            const achId = ach['id'];
            if (!achId) {
                logger('warn', 'systemHandler', '[newAchievementHandler] Achievement is missing an "id".', ach);
                return;
            }

            if (!achievementData.completed[achId]) {
                const newEntry: Record<string, any> = { ...ach };
                delete newEntry['点数']; // The points are only for the event, not stored per achievement
                
                achievementData.completed[achId] = newEntry;
                achievementData.成就点数 += ach['点数'] || 0;
                toastr.success(`解锁新成就：${ach['名称']}`, '恭喜！');
                hasNew = true;
            }
        });

        if (hasNew) {
            logger('info', 'systemHandler', '[newAchievementHandler] New achievement update calculated.');
            return {
                世界: {
                    成就: achievementData
                }
            };
        }
        
        return {};
    },
};

export { newAchievementHandler, systemConfirmationHandler };
