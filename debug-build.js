// #!/usr/bin/env node

// /**
//  * 调试生产构建问题的脚本
//  * 用法: node debug-build.js
//  */

// const fs = require('fs');
// const path = require('path');

// console.log('🔍 检查生产构建配置...\n');

// // 检查关键文件是否存在
// const criticalFiles = [
//   'metro.config.js',
//   'package.json',
//   'app.json',
//   'babel.config.js'
// ];

// console.log('📁 检查关键文件:');
// criticalFiles.forEach(file => {
//   const exists = fs.existsSync(file);
//   console.log(`  ${exists ? '✅' : '❌'} ${file}`);
// });

// // 检查 package.json 中的关键依赖
// console.log('\n📦 检查关键依赖:');
// try {
//   const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
//   const criticalDeps = [
//     'matrix-js-sdk',
//     'react-native-get-random-values',
//     'text-encoding-polyfill',
//     'react-native-url-polyfill',
//     'buffer',
//     'crypto-browserify',
//     'stream-browserify',
//     'events',
//     'util',
//     'process'
//   ];
  
//   criticalDeps.forEach(dep => {
//     const hasRegular = packageJson.dependencies && packageJson.dependencies[dep];
//     const hasDev = packageJson.devDependencies && packageJson.devDependencies[dep];
//     const version = hasRegular || hasDev;
//     console.log(`  ${version ? '✅' : '❌'} ${dep}${version ? ` (${version})` : ''}`);
//   });
// } catch (e) {
//   console.log('  ❌ 无法读取 package.json');
// }

// // 检查 Metro 配置
// console.log('\n⚙️  检查 Metro 配置:');
// try {
//   const metroConfig = fs.readFileSync('metro.config.js', 'utf8');
//   const checks = [
//     { name: 'node-libs-react-native', check: metroConfig.includes('node-libs-react-native') },
//     { name: 'extraNodeModules', check: metroConfig.includes('extraNodeModules') },
//     { name: 'buffer polyfill', check: metroConfig.includes('buffer') },
//     { name: 'crypto polyfill', check: metroConfig.includes('crypto-browserify') },
//     { name: 'stream polyfill', check: metroConfig.includes('stream-browserify') }
//   ];
  
//   checks.forEach(({ name, check }) => {
//     console.log(`  ${check ? '✅' : '❌'} ${name}`);
//   });
// } catch (e) {
//   console.log('  ❌ 无法读取 metro.config.js');
// }

// // 给出建议
// console.log('\n💡 调试建议:');
// console.log('1. 检查 Android 日志: adb logcat | grep -E "(ReactNative|ExpoModules|Matrix)"');
// console.log('2. 使用 Flipper 连接应用查看详细错误');
// console.log('3. 在 ProGuard 规则中添加更多 keep 指令');
// console.log('4. 尝试禁用代码混淆: minifyEnabled false');
// console.log('5. 检查是否有 native 模块依赖问题');

// console.log('\n🔧 推荐的调试步骤:');
// console.log('1. 先尝试构建不带 ProGuard 的版本');
// console.log('2. 逐步启用代码压缩功能');
// console.log('3. 使用 --stacktrace 参数查看详细构建日志');
// console.log('4. 检查是否所有 native 依赖都正确 link');

// console.log('\n🎯 针对 Matrix SDK 的特殊建议:');
// console.log('1. 确保所有 crypto 相关的 polyfills 都已正确配置');
// console.log('2. 检查 WebSocket 和网络相关的权限');
// console.log('3. 验证 Matrix 服务器的 SSL 证书配置');
// console.log('4. 确保 AsyncStorage 权限正确设置');

// console.log('\n✅ 调试检查完成!'); 