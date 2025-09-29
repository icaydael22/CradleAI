/**
 * 用于添加 React Native 项目所需的 polyfills
 * 在应用入口点导入此文件
 */

// 声明全局变量，但避免与 Node.js 类型冲突
declare global {
  // 仅声明我们实际使用的变量，不干扰 Node.js 类型
  var stream: any;
  // 不要在全局命名空间中声明 process，避免冲突
}

// 导入必要的 polyfills
import 'react-native-get-random-values'; // 用于 uuid
import 'react-native-url-polyfill/auto'; // URL polyfill

// 为 crypto 创建 polyfill
if (typeof global.crypto !== 'object') {
  global.crypto = require('crypto-browserify');
}

// 为 stream 创建 polyfill (解决 cipher-base 问题)
if (!global.stream) {
  global.stream = require('stream-browserify');
}

// 如果 Buffer 不存在，则从 buffer 包中导入
if (typeof global.Buffer === 'undefined') {
  global.Buffer = require('buffer/').Buffer;
}

// 安全地初始化或更新 process.env
// 使用类型断言来避免类型冲突
if (typeof global.process === 'undefined') {
  // 创建一个最小化的 process 对象，不声明类型
  (global as any).process = { env: {} };
}

// 使用安全的方法确保 process.env 存在
if (!global.process?.env) {
  (global.process as any).env = {};
}

// 只有当 NODE_ENV 未定义时才设置它
if (!(global.process.env as any).NODE_ENV) {
  // 使用类型断言安全地设置属性
  try {
    Object.defineProperty(global.process.env, 'NODE_ENV', {
      value: 'production',
      enumerable: true,
      configurable: true,
      writable: true
    });
  } catch (e) {
    // 如果 defineProperty 失败，直接赋值
    (global.process.env as any).NODE_ENV = 'production';
  }
}

// MD5 哈希函数的简单实现（用于生成记忆哈希值）
export function md5(str: string): string {
  // 简化的实现，仅用于演示
  // 在生产环境中，应使用 crypto-browserify 或其他库的正确实现
  function hashCode(s: string): number {
    let hash = 0;
    if (s.length === 0) return hash;
    
    for (let i = 0; i < s.length; i++) {
      const char = s.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return hash;
  }
  
  const hash = Math.abs(hashCode(str)).toString(16);
  return '0'.repeat(32 - hash.length) + hash;
}
