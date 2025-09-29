import vue from '@vitejs/plugin-vue';
import { glob } from 'glob';
import fs from 'node:fs';
import path from 'node:path';
import { Server } from 'socket.io';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { defineConfig, Plugin, ViteDevServer } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 与 webpack.config.ts 保持一致的端口
const TAVERN_HELPER_PORT = 6621;

/**
 * 自定义 Vite 插件，用于在文件变更时通过 Socket.IO 通知酒馆刷新
 */
function tavernHmrNotifier(): Plugin {
  let io: Server;

  return {
    name: 'tavern-hmr-notifier',
    configureServer(server: ViteDevServer) {
      if (!io) {
        io = new Server(TAVERN_HELPER_PORT, { cors: { origin: '*' } });
        console.info(`[Vite Notifier] 已启动酒馆监听服务, 正在监听: http://0.0.0.0:${TAVERN_HELPER_PORT}`);
        io.on('connect', socket => {
          console.info(`[Vite Notifier] 成功连接到酒馆网页 '${socket.id}'`);
          socket.on('disconnect', reason => {
            console.info(`[Vite Notifier] 与酒馆网页 '${socket.id}' 断开连接: ${reason}`);
          });
        });
      }

      server.watcher.on('change', file => {
        console.info(`\n[Vite Notifier] 文件变更: ${path.relative(process.cwd(), file)}, 推送更新事件...`);
        io.emit('iframe_updated');
      });
    },
  };
}

// 定义需要从编译中排除的目录
const excludedDirs = [
  '**/PaxHeaders/**',
  '**/脚本模板/**',
  '**/脚本示例/**',
  '**/界面模板/**',
  '**/界面示例/**',
];

// 扫描 src 目录，生成多入口配置
const entries = glob.sync('src/**/index.{ts,js}', { ignore: excludedDirs });
const input: { [key: string]: string } = {};

for (const entry of entries) {
  const entryPath = path.parse(entry);
  const name = path.relative(path.join(process.cwd(), 'src'), entryPath.dir);
  const htmlPath = path.join(entryPath.dir, 'index.html');

  // 如果存在 index.html，则它作为入口
  if (fs.existsSync(htmlPath)) {
    input[name || 'index'] = htmlPath;
  }
  // 否则，ts/js 文件自身作为库模式的入口
  else {
    input[name] = entry;
  }
}

// 模拟 webpack.config.ts 中的 externals
const externalGlobals = {
  lodash: '_',
  toastr: 'toastr',
  yaml: 'YAML',
  jquery: '$',
  zod: 'z',
  pinia: 'Pinia',
};

export default defineConfig({
  // 'base' 设置为 './' 确保在内联 HTML 中资源路径正确
  base: './',
  plugins: [
    vue(),
    viteSingleFile(),
    tavernHmrNotifier(),
    // 自动导入 Vue 相关函数，如：ref, reactive, toRef 等
    AutoImport({
      imports: ['vue', 'pinia'],
      dts: 'src/auto-imports.d.ts',
    }),
    // 自动导入自定义组件
    Components({
      // 指定组件位置，默认是 src/components
      dirs: ['src/**/components'],
      // 配置文件生成位置
      dts: 'src/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  server: {
    // 注意：Vite 的开发服务器主要用于 HMR 和资源服务，
    // 最终的产物需要通过 `npm run build:vite` 生成。
    // 这里的端口主要用于 socket.io 通信。
    port: TAVERN_HELPER_PORT,
    strictPort: true,
  },
  build: {
    // 关闭 sourcemap 以匹配原始配置
    sourcemap: false,
    // 将产物输出到 dist-vite 目录，以区别于 webpack 的 dist
    outDir: 'dist-vite',
    rollupOptions: {
      // 多入口配置
      input,
      // 定义外部依赖，这些库不会被打包
      external: Object.keys(externalGlobals),
      output: {
        // 为每个入口文件生成独立的产物
        entryFileNames: '[name]/index.js',
        chunkFileNames: '[name]/[hash].js',
        assetFileNames: '[name]/[ext]',
        // 配置全局变量，告诉 Rollup 如何在浏览器中找到外部依赖
        globals: externalGlobals,
        // 对于没有 HTML 的脚本，我们构建为 IIFE 格式
        format: 'iife',
      },
    },
    // 设置一个较高的阈值，避免因资源内联导致的警告
    chunkSizeWarningLimit: 2000,
  },
  test: {
    // Vitest 相关配置
    environment: 'jsdom', // 或 'node', 'happy-dom' 等
  },
});
