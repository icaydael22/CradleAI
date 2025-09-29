/**
 * VNDB API 服务使用示例
 */

import { defaultClient as vndb } from '../services/vndb';

async function main() {
  try {
    // 验证认证
    const isAuthenticated = await vndb.verifyAuth();
    console.log('认证状态:', isAuthenticated);
    
    // 获取单个角色信息
    const character = await vndb.getCharacterById('c1');
    console.log('角色信息:', character?.name);
    
    // 搜索角色
    const searchResults = await vndb.searchCharacters('Saber', { results: 5 });
    console.log('搜索结果:', searchResults.results.map(c => c.name));
    
    // 获取角色特征
    const characterTraits = await vndb.getCharacterTraits('c1');
    console.log('角色特征:', characterTraits?.traits?.length);
    
    // 使用过滤条件查询角色
    const filteredCharacters = await vndb.getCharacters({
      bloodType: 'a',
      sex: 'f',
      results: 5
    });
    console.log('筛选结果:', filteredCharacters.results.map(c => c.name));
    
  } catch (error) {
    console.error('发生错误:', error);
  }
}

main();
