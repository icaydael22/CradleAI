/**
 * VNDB API 日志服务
 */

// 日志级别枚举
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// 配置当前日志级别，可以根据环境变量设置
const currentLogLevel: LogLevel = LogLevel.DEBUG;

// 日志记录类
export class VNDBLogger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  /**
   * 格式化日志消息
   */
  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${this.context}] ${message}`;
  }

  /**
   * 记录调试日志
   */
  debug(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.DEBUG) {
      console.debug(this.formatMessage('调试', message), ...args);
    }
  }

  /**
   * 记录信息日志
   */
  info(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.INFO) {
      console.info(this.formatMessage('信息', message), ...args);
    }
  }

  /**
   * 记录警告日志
   */
  warn(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.WARN) {
      console.warn(this.formatMessage('警告', message), ...args);
    }
  }

  /**
   * 记录错误日志
   */
  error(message: string, error?: any): void {
    if (currentLogLevel <= LogLevel.ERROR) {
      console.error(this.formatMessage('错误', message));
      if (error) {
        if (error.stack) {
          console.error(this.formatMessage('错误', `堆栈信息: ${error.stack}`));
        } else {
          console.error(this.formatMessage('错误', '详细信息:'), error);
        }
      }
    }
  }
}

// 创建默认日志记录器
export const defaultLogger = new VNDBLogger('VNDB-API');
