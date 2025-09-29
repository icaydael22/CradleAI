// Learn more https://docs.expo.dev/guides/customizing-metro

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path'); // 确保引入 path 模块

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// 添加 Node.js 模块的 polyfills - 仅包含必需的模块以减少bundle大小
config.resolver.extraNodeModules = {
  // 必需的React Native特定映射
  'react-native-get-random-values': require.resolve('react-native-get-random-values'),
  'react-native-url-polyfill': require.resolve('react-native-url-polyfill'),
};

// 确保能够处理 mjs 文件和其他扩展
config.resolver.sourceExts.push('mjs', 'cjs');
config.resolver.assetExts.push('wasm', 'bin', 'zip');

// ARM64兼容性设置
config.resolver.platforms = ['native', 'android', 'ios', 'web'];
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];


// 添加 resolver platforms
config.resolver.platforms = ['native', 'android', 'ios', 'web'];

// 在生产环境中移除console语句
if (process.env.NODE_ENV === 'production') {
  config.transformer.minifierConfig = {
    keep_fnames: false, // 生产环境不保留函数名
    mangle: {
      keep_fnames: false,
    },
    compress: {
      drop_console: true, // 生产环境移除console语句以提升性能
      drop_debugger: true,
      dead_code: true,
      unused: true,
      conditionals: true,
      evaluate: true,
      booleans: true,
      typeofs: true,
      inline: 2,
    },
  };
}

// 确保 Metro 能够正确处理 ES6 模块
config.transformer.unstable_allowRequireContext = true;

// 添加性能优化配置
if (process.env.NODE_ENV === 'production') {
  // 启用优化配置
  config.serializer.optimize = true;
  config.serializer.customSerializer = config.serializer.customSerializer || (() => {});
}



module.exports = config;