// const { createClient } = require('matrix-js-sdk');

// async function testConnection() {
//   try {
//     console.log('正在测试 Matrix 服务器连接...');
//     const client = createClient({ baseUrl: 'https://cradleintro.top' });
//     const versions = await client.getVersions();
    
//     console.log('✅ Matrix 服务器连接成功！');
//     console.log('支持的版本:', versions.versions);
//     console.log('不稳定特性数量:', Object.keys(versions.unstable_features || {}).length);
//     return true;
//   } catch (error) {
//     console.error('❌ Matrix 服务器连接失败:', error.message);
    
//     if (error.code === 'ENOTFOUND') {
//       console.log('💡 可能的原因：');
//       console.log('1. 域名解析失败 - 检查 cradleintro.top 是否可访问');
//       console.log('2. 服务器未运行 - 确认 Synapse 服务正在运行');
//       console.log('3. 端口问题 - 检查 443 端口是否开放');
//     }
//     return false;
//   }
// }

// testConnection(); 