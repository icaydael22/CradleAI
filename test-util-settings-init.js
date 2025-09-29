// 测试 UtilSettings 初始化功能
// 这个文件仅用于验证初始化逻辑，可以在测试完成后删除

const AsyncStorage = require('@react-native-async-storage/async-storage');

// 模拟存储键（与实际文件中的保持一致）
const AUTO_MESSAGE_STORAGE_KEY = 'auto_message_prompt_config';
const MEMORY_SUMMARY_STORAGE_KEY = 'memory_summary_prompt_config';
const SCRIPT_SUMMARY_STORAGE_KEY = 'script_summary_prompt_config';
const MEMORY_SERVICE_STORAGE_KEY = 'memory_service_config';
const IMAGEGEN_STORAGE_KEY = 'imagegen_prompt_config';
const INIT_FLAG_STORAGE_KEY = 'util_settings_initialized';

async function testInitialization() {
  console.log('开始测试初始化功能...');
  
  try {
    // 清除所有相关存储项以模拟首次启动
    await AsyncStorage.multiRemove([
      AUTO_MESSAGE_STORAGE_KEY,
      MEMORY_SUMMARY_STORAGE_KEY,
      SCRIPT_SUMMARY_STORAGE_KEY,
      MEMORY_SERVICE_STORAGE_KEY,
      IMAGEGEN_STORAGE_KEY,
      INIT_FLAG_STORAGE_KEY
    ]);
    
    console.log('已清除现有配置，模拟首次启动状态');
    
    // 检查初始化标志
    const initFlag = await AsyncStorage.getItem(INIT_FLAG_STORAGE_KEY);
    console.log('初始化标志:', initFlag);
    
    // 检查各配置项是否存在
    const configs = await AsyncStorage.multiGet([
      AUTO_MESSAGE_STORAGE_KEY,
      MEMORY_SUMMARY_STORAGE_KEY,
      SCRIPT_SUMMARY_STORAGE_KEY,
      MEMORY_SERVICE_STORAGE_KEY,
      IMAGEGEN_STORAGE_KEY
    ]);
    
    console.log('当前配置状态:');
    configs.forEach(([key, value]) => {
      console.log(`${key}: ${value ? '已存在' : '不存在'}`);
    });
    
    console.log('\n测试完成。请在应用中调用 initializeUtilSettings() 来初始化配置。');
    
  } catch (error) {
    console.error('测试过程中出错:', error);
  }
}

module.exports = { testInitialization };