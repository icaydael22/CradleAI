module.exports = function (api) {
  api.cache(true);
  const presets = [
    [
      "babel-preset-expo",
      {
        unstable_transformImportMeta: true, // 支持Matrix SDK的WASM模块
      }
    ]
  ];

  const plugins = [
    // 如果您已经在使用 expo-router，这一行可能已经存在
    "@babel/plugin-transform-export-namespace-from",
    // 添加模块解析插件
    [
      'module-resolver',
      {
        alias: {
          // 您现有的别名
          '@': './',
          // Node.js 模块的 polyfills
          'stream': 'stream-browserify',
          'crypto': 'crypto-browserify',
          'buffer': 'buffer/',
        },
      },
    ],
    // 将 Reanimated 插件添加到这里，确保在最后
    "react-native-reanimated/plugin",
  ];

  // Only strip console.* in production builds. Keep console.error and console.warn.
  const env = {
    production: {
      plugins: [
        [
          "transform-remove-console",
          { "exclude": ["error", "warn"] }
        ]
      ]
    }
  };

  return {
    presets,
    plugins,
    env,
  };
};