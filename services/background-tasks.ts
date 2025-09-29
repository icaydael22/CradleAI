// 背景任务（expo-background-task）：定期检查并触发朋友圈定时发布
// 需要：expo-background-task 与 expo-task-manager

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { CircleScheduler } from '@/services/circle-scheduler';
import { AutoMessageScheduler } from '@/services/auto-message-scheduler';

const TASK_NAME = 'BACKGROUND_CIRCLE_CHECK';

// 1) 在模块顶层定义任务（非 React 组件内）
try {
  // 防重复定义
  // 注意：isTaskRegisteredAsync 在某些旧版本可能不可用，故 try/catch 包裹
  // 若不可用，直接尝试 define 也不会重复报错
  TaskManager.isTaskRegisteredAsync?.(TASK_NAME)
    .then((registered) => {
      if (!registered) {
        TaskManager.defineTask(TASK_NAME, async () => {
          try {
            const circle = CircleScheduler.getInstance();
            const autoMsg = AutoMessageScheduler.getInstance();
            await Promise.all([
              circle.runScheduledCheckOnce?.(),
              autoMsg.runScheduledCheckOnce?.(),
            ]);
            return BackgroundTask.BackgroundTaskResult.Success;
          } catch (error) {
            return BackgroundTask.BackgroundTaskResult.Failed;
          }
        });
      }
    })
    .catch(() => {
      // 回退：直接定义
      try {
        TaskManager.defineTask(TASK_NAME, async () => {
          try {
            const circle = CircleScheduler.getInstance();
            const autoMsg = AutoMessageScheduler.getInstance();
            await Promise.all([
              circle.runScheduledCheckOnce?.(),
              autoMsg.runScheduledCheckOnce?.(),
            ]);
            return BackgroundTask.BackgroundTaskResult.Success;
          } catch (error) {
            return BackgroundTask.BackgroundTaskResult.Failed;
          }
        });
      } catch {}
    });
} catch {}

// 2) 注册后台任务（最短间隔分钟）
export async function registerBackgroundTaskAsync(minimumIntervalMinutes: number = 15) {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (isRegistered) return true;
    await BackgroundTask.registerTaskAsync(TASK_NAME, {
      minimumInterval: minimumIntervalMinutes,
    } as any);
    return true;
  } catch (e) {
    return false;
  }
}

export async function unregisterBackgroundTaskAsync() {
  try {
    await BackgroundTask.unregisterTaskAsync(TASK_NAME);
  } catch {}
}

export async function getBackgroundTaskStatus() {
  try {
    return await BackgroundTask.getStatusAsync();
  } catch {
    return null;
  }
}

// 3) 根据是否存在定时任务自动注册/注销后台任务
export async function initBackgroundTasks() {
  try {
    const circle = CircleScheduler.getInstance();
    const autoMsg = AutoMessageScheduler.getInstance();
    const [hasCircle, hasAuto] = await Promise.all([
      circle.hasScheduledTasks(),
      autoMsg.hasScheduledTasks(),
    ]);
    if (hasCircle || hasAuto) {
      await registerBackgroundTaskAsync(15);
    } else {
      await unregisterBackgroundTaskAsync();
    }
  } catch {}
}

// 4) 测试触发（仅开发模式可用）
export async function triggerBackgroundTaskForTesting() {
  try {
    // 立即触发任务 worker 执行，无需等待系统调度（开发调试）
    // @ts-ignore
    if (BackgroundTask.triggerTaskWorkerForTestingAsync) {
      await (BackgroundTask as any).triggerTaskWorkerForTestingAsync();
      return true;
    }
  } catch {}
  return false;
}


