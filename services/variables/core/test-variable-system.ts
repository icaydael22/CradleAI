import { VariableManager } from './VariableManager';
import * as fs from 'fs';

// 加载测试配置
const charConfig = JSON.parse(fs.readFileSync(__dirname + '/test-character-config.json', 'utf-8'));
const globalConfig = JSON.parse(fs.readFileSync(__dirname + '/test-global-config.json', 'utf-8'));

const vm = new VariableManager();

(async () => {
	// 0. 初始化
	await vm.initCharacter('char1', charConfig);
	await vm.initGlobal(globalConfig);

	console.log('初始化后角色变量:', vm.getCharacterSystem('char1'));
	console.log('初始化后全局变量:', vm.getGlobalSystem());

	// 1. 宏替换
	console.log('宏替换:', vm.replaceMacros('角色昵称：${nickname}，分数：${scoreTable.score}，隐藏：${hiddenName}', 'char1'));
	console.log('全局宏替换:', vm.replaceMacros('全局名：${globalName}，全局隐藏：${globalHidden}'));

	// 2. xml标签识别与变量修改
	await vm.parseCommands('<setVar>goodwill=80</setVar>', 'char1');
	console.log('修改后goodwill:', vm.getCharacterSystem('char1')?.variables['goodwill']);

	// 3. 动态注册和注销
	await vm.registerVar('newVar', 'string', 'hello', 'char1');
	console.log('注册后:', vm.getCharacterSystem('char1')?.variables['newVar']);
	await vm.unregisterVar('newVar', 'char1');
	console.log('注销后:', vm.getCharacterSystem('char1')?.variables['newVar']);

	// 4. 隐变量功能
	console.log('隐变量（满足条件）:', vm.replaceMacros('隐藏：${hiddenName}', 'char1'));
	await vm.parseCommands('<setVar>goodwill=10</setVar>', 'char1');
	console.log('隐变量（不满足条件）:', vm.replaceMacros('隐藏：${hiddenName}', 'char1'));

	// 5. 嵌套宏
	console.log('嵌套宏:', vm.replaceMacros('嵌套：${scoreTable.desc.${goodwill}}', 'char1'));

	// 6. 全局变量动态注册
	await vm.registerVar('globalTest', 'number', 123);
	console.log('全局注册后:', vm.getGlobalSystem().variables['globalTest']);
	await vm.unregisterVar('globalTest');
	console.log('全局注销后:', vm.getGlobalSystem().variables['globalTest']);

	console.log('全部测试通过！');
})();
