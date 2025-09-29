import * as FileSystem from 'expo-file-system';

export class MobileFileHistoryManager {
  private baseDir: string;

  constructor(baseDir?: string) {
    // 1. 默认目录
    let dir = baseDir || 'memory_history';
    // 2. 如果是 .db 文件名，转为 _data
    if (dir.endsWith('.db')) {
      dir = dir.replace(/\.db$/, '_data');
    }
    // 3. 如果不是绝对路径，则拼接到 documentDirectory
    if (!dir.startsWith(FileSystem.documentDirectory ?? '')) {
      dir = `${FileSystem.documentDirectory}${dir}`;
    }
    this.baseDir = dir;
    this.ensureDir();
  }

  private async ensureDir() {
    const dirInfo = await FileSystem.getInfoAsync(this.baseDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
    }
  }

  private getHistoryFilePath(memoryId: string) {
    return `${this.baseDir}/${memoryId}.json`;
  }

  private getIndexFilePath() {
    return `${this.baseDir}/history-index.json`;
  }

  /**
   * 添加历史记录
   */
  async addHistory(
    memoryId: string,
    previousValue: string | null,
    newValue: string | null,
    action: string,
    createdAt?: string,
    updatedAt?: string,
    isDeleted: number = 0,
  ): Promise<void> {
    await this.ensureDir();
    const record = {
      id: Date.now() + Math.random(), // 简单唯一ID
      memory_id: memoryId,
      previous_value: previousValue,
      new_value: newValue,
      action,
      created_at: createdAt || new Date().toISOString(),
      updated_at: updatedAt || createdAt || new Date().toISOString(),
      is_deleted: isDeleted,
    };
    // 写入单条历史文件
    const filePath = this.getHistoryFilePath(memoryId);
    let historyArr: any[] = [];
    try {
      const content = await FileSystem.readAsStringAsync(filePath);
      historyArr = JSON.parse(content);
    } catch {}
    historyArr.unshift(record);
    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(historyArr));

    // 更新索引
    let index: Record<string, number[]> = {};
    try {
      const idxStr = await FileSystem.readAsStringAsync(this.getIndexFilePath());
      index = JSON.parse(idxStr);
    } catch {}
    if (!index[memoryId]) index[memoryId] = [];
    index[memoryId].unshift(record.id);
    await FileSystem.writeAsStringAsync(this.getIndexFilePath(), JSON.stringify(index));
  }

  /**
   * 获取特定记忆的历史记录
   */
  async getHistory(memoryId: string): Promise<any[]> {
    await this.ensureDir();
    const filePath = this.getHistoryFilePath(memoryId);
    try {
      const content = await FileSystem.readAsStringAsync(filePath);
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * 重置历史数据库
   */
  async reset(): Promise<void> {
    await this.ensureDir();
    const files = await FileSystem.readDirectoryAsync(this.baseDir);
    for (const file of files) {
      await FileSystem.deleteAsync(`${this.baseDir}/${file}`, { idempotent: true });
    }
  }
}
