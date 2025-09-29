/**
 * VNDB API 服务入口
 */

import { VNDBClient } from './vndbClient';
import { VNDBLogger } from './logger';
export * from './types';

// 创建默认客户端实例
const defaultClient = new VNDBClient();

// 导出所有组件
export {
  VNDBClient,
  VNDBLogger,
  defaultClient
};

// 默认导出
export default defaultClient;
