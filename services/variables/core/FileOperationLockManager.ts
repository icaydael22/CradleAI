/**
 * 文件操作锁管理器 - 防止并发写入
 * 提供基于键的异步锁机制，确保同一资源的操作不会并发执行
 */

export class FileOperationLockManager {
    private static instance: FileOperationLockManager;
    private locks = new Map<string, Promise<any>>();

    static getInstance(): FileOperationLockManager {
        if (!FileOperationLockManager.instance) {
            FileOperationLockManager.instance = new FileOperationLockManager();
        }
        return FileOperationLockManager.instance;
    }

    /**
     * 获取锁并执行操作
     * @param key 锁的键，用于识别资源
     * @param operation 要执行的异步操作
     * @returns 操作结果
     */
    async acquire<T>(key: string, operation: () => Promise<T>): Promise<T> {
        // 等待当前操作完成
        const currentLock = this.locks.get(key);
        if (currentLock) {
            try {
                await currentLock;
            } catch (error) {
                // 忽略之前操作的错误，继续执行新操作
            }
        }

        // 执行新操作
        const newOperation = operation();
        this.locks.set(key, newOperation);

        try {
            const result = await newOperation;
            // 如果当前锁还是我们设置的，才删除
            if (this.locks.get(key) === newOperation) {
                this.locks.delete(key);
            }
            return result;
        } catch (error) {
            // 如果当前锁还是我们设置的，才删除
            if (this.locks.get(key) === newOperation) {
                this.locks.delete(key);
            }
            throw error;
        }
    }

    /**
     * 检查指定键是否被锁定
     * @param key 锁的键
     * @returns 是否被锁定
     */
    isLocked(key: string): boolean {
        return this.locks.has(key);
    }

    /**
     * 获取当前锁的数量
     * @returns 锁的数量
     */
    getLockCount(): number {
        return this.locks.size;
    }

    /**
     * 清除所有锁（慎用）
     */
    clearAllLocks(): void {
        this.locks.clear();
    }
}