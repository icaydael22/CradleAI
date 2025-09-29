import * as SQLite from 'expo-sqlite'; // Using SQLite API
import { VectorStore } from './base';
import { SearchFilters, VectorStoreConfig, VectorStoreResult } from './base';
import * as FileSystem from 'expo-file-system';

interface MobileSQLiteConfig extends VectorStoreConfig {
  dbName: string;
  dimension: number;
}

interface CountResult {
  count: number;
}
interface VectorRow {
  id: string;
  vector: string;
  payload: string;
}
interface PayloadRow {
  id: string;
  payload: string;
}

export class MobileSQLiteVectorStore implements VectorStore {
  private db: SQLite.SQLiteDatabase | null = null;
  private dimension: number;
  private collectionName: string;
  private dbName: string;
  private ready: Promise<void>;

  constructor(config: MobileSQLiteConfig) {
    this.dimension = config.dimension || 1536;
    this.collectionName = config.collectionName;
    this.dbName = config.dbName;
    this.ready = this._initializeDatabase();
  }

  private async _initializeDatabase(): Promise<void> {
    try {
      console.log(`[MobileSQLiteVectorStore] Opening database: ${this.dbName}`);
      this.db = await SQLite.openDatabaseAsync(this.dbName);
      console.log(`[MobileSQLiteVectorStore] Database opened successfully.`);
      await this.initTable();
    } catch (error) {
      console.error(`[MobileSQLiteVectorStore] Failed to open or initialize database:`, error);
      throw error;
    }
  }

  private async initTable(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized.");
    try {
      await this.db.execAsync(`CREATE TABLE IF NOT EXISTS ${this.collectionName} (
        id TEXT PRIMARY KEY,
        vector TEXT NOT NULL,
        payload TEXT NOT NULL
      )`);
      console.log(`[MobileSQLiteVectorStore] 表 ${this.collectionName} 初始化成功`);
      await this.db.execAsync(`CREATE INDEX IF NOT EXISTS idx_${this.collectionName}_agentId 
        ON ${this.collectionName}(json_extract(payload, '$.agentId'))`);
      console.log(`[MobileSQLiteVectorStore] 为表 ${this.collectionName} 创建角色ID索引成功`);
    } catch (error) {
      console.error(`[MobileSQLiteVectorStore] 初始化表 ${this.collectionName} 失败:`, error);
      throw error;
    }
  }

  private async ensureDbReady(): Promise<SQLite.SQLiteDatabase> {
    await this.ready;
    if (!this.db) throw new Error("Database is not initialized or initialization failed.");
    return this.db;
  }

  private async run(sql: string, params: any[] = []): Promise<void> {
    const db = await this.ensureDbReady();
    try {
      await db.runAsync(sql, params);
    } catch (error) {
      console.error('[MobileSQLiteVectorStore] 执行 SQL 失败:', sql, params, error);
      throw error;
    }
  }

  private async all<T>(sql: string, params: any[] = []): Promise<T[]> {
    const db = await this.ensureDbReady();
    try {
      return await db.getAllAsync<T>(sql, params);
    } catch (error) {
      console.error('[MobileSQLiteVectorStore] 查询多条记录失败:', sql, params, error);
      return [];
    }
  }

  private async getOne<T>(sql: string, params: any[] = []): Promise<T | null> {
    const db = await this.ensureDbReady();
    try {
      return await db.getFirstAsync<T>(sql, params);
    } catch (error) {
      console.error('[MobileSQLiteVectorStore] 查询单条记录失败:', sql, params, error);
      return null;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private filterVector(vector: { id: string, payload: Record<string, any> }, filters?: SearchFilters): boolean {
    if (!filters) return true;
    const payload = typeof vector.payload === 'string' 
      ? JSON.parse(vector.payload) 
      : vector.payload;
    return Object.entries(filters).every(
      ([key, value]) => payload[key] === value
    );
  }

  async insert(
    vectors: number[][],
    ids: string[],
    payloads: Record<string, any>[],
  ): Promise<void> {
    await this.ensureDbReady();
    for (let i = 0; i < vectors.length; i++) {
      if (vectors[i].length !== this.dimension) {
        throw new Error(
          `向量维度不匹配。期望 ${this.dimension}, 实际 ${vectors[i].length}`
        );
      }
      const vectorString = JSON.stringify(vectors[i]);
      await this.run(
        `INSERT OR REPLACE INTO ${this.collectionName} (id, vector, payload) VALUES (?, ?, ?)`,
        [ids[i], vectorString, JSON.stringify(payloads[i])]
      );
    }
  }

  async search(
    query: number[],
    limit: number = 10,
    filters?: SearchFilters,
  ): Promise<VectorStoreResult[]> {
    await this.ensureDbReady();
    if (query.length !== this.dimension) {
      throw new Error(
        `查询向量维度不匹配。期望 ${this.dimension}, 实际 ${query.length}`
      );
    }
    const rows = await this.all<VectorRow>(`SELECT id, vector, payload FROM ${this.collectionName}`);
    const results: VectorStoreResult[] = [];
    for (const row of rows) {
      const vector = JSON.parse(row.vector);
      const payload = JSON.parse(row.payload);
      const item = {
        id: row.id,
        payload
      };
      if (this.filterVector(item, filters)) {
        const score = this.cosineSimilarity(query, vector);
        results.push({
          id: row.id,
          payload,
          score,
        });
      }
    }
    results.sort((a, b) => (b.score || 0) - (a.score || 0));
    return results.slice(0, limit);
  }

  async get(vectorId: string): Promise<VectorStoreResult | null> {
    await this.ensureDbReady();
    const row = await this.getOne<PayloadRow>(
      `SELECT id, payload FROM ${this.collectionName} WHERE id = ?`,
      [vectorId]
    );
    if (!row) return null;
    return {
      id: row.id,
      payload: JSON.parse(row.payload),
    };
  }

  async update(
    vectorId: string,
    vector: number[] | null,
    payload: Record<string, any>,
  ): Promise<void> {
    await this.ensureDbReady();
    if (vector === null) {
      console.log(`[MobileSQLiteVectorStore] 更新记忆 ${vectorId} 的 payload 但保持向量不变`);
      await this.run(
        `UPDATE ${this.collectionName} SET payload = ? WHERE id = ?`,
        [JSON.stringify(payload), vectorId]
      );
      return;
    }
    if (vector.length !== this.dimension) {
      throw new Error(
        `向量维度不匹配。期望 ${this.dimension}, 实际 ${vector.length}`
      );
    }
    const vectorString = JSON.stringify(vector);
    await this.run(
      `UPDATE ${this.collectionName} SET vector = ?, payload = ? WHERE id = ?`,
      [vectorString, JSON.stringify(payload), vectorId]
    );
  }

  async delete(vectorId: string): Promise<void> {
    await this.ensureDbReady();
    await this.run(
      `DELETE FROM ${this.collectionName} WHERE id = ?`,
      [vectorId]
    );
  }

  async deleteCol(): Promise<void> {
    await this.ensureDbReady();
    await this.run(`DROP TABLE IF EXISTS ${this.collectionName}`);
    await this.initTable();
  }

  async list(
    filters?: SearchFilters,
    limit: number = 100,
  ): Promise<[VectorStoreResult[], number]> {
    await this.ensureDbReady();
    const rows = await this.all<PayloadRow>(
      `SELECT id, payload FROM ${this.collectionName}`
    );
    const results: VectorStoreResult[] = [];
    for (const row of rows) {
      const payload = JSON.parse(row.payload);
      const item = {
        id: row.id,
        payload
      };
      if (this.filterVector(item, filters)) {
        results.push({
          id: row.id,
          payload,
        });
      }
    }
    return [results.slice(0, limit), results.length];
  }

  public async getDatabaseSize(): Promise<number> {
    try {
      const dbPath = FileSystem.documentDirectory + 'SQLite/' + this.dbName;
      const fileInfo = await FileSystem.getInfoAsync(dbPath);
      if (fileInfo.exists && fileInfo.size) {
        console.log(`[MobileSQLiteVectorStore] 数据库大小: ${(fileInfo.size / (1024 * 1024)).toFixed(2)}MB`);
        return fileInfo.size;
      }
      return 0;
    } catch (error) {
      console.error('[MobileSQLiteVectorStore] 获取数据库大小失败:', error);
      return 0;
    }
  }

  public async getByCharacterId(characterId: string, limit: number = 100): Promise<VectorStoreResult[]> {
    await this.ensureDbReady();
    try {
      const query = `
        SELECT id, vector, payload 
        FROM ${this.collectionName} 
        WHERE json_extract(payload, '$.agentId') = ?
        ORDER BY json_extract(payload, '$.updatedAt') DESC, json_extract(payload, '$.createdAt') DESC
        LIMIT ?`;
      const rows = await this.db!.getAllAsync<{ id: string; vector: string; payload: string }>(query, [characterId, limit]);
      if (!rows || rows.length === 0) {
        console.log(`[MobileSQLiteVectorStore] 未找到角色ID=${characterId}的记忆数据`);
        return [];
      }
      const results: VectorStoreResult[] = [];
      for (const row of rows) {
        try {
          const payload = typeof row.payload === 'string' 
            ? JSON.parse(row.payload) 
            : row.payload;
          if (!payload.data && payload.memory) {
            payload.data = payload.memory;
          }
          if (!payload.memory && payload.data) {
            payload.memory = payload.data;
          }
          results.push({
            id: row.id,
            payload,
            memory: payload.memory,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt,
            userId: payload.userId,
            agentId: payload.agentId,
            runId: payload.runId,
            metadata: payload,
          } as any);
        } catch (error) {
          console.error(`[MobileSQLiteVectorStore] 处理记忆ID=${row.id}时出错:`, error);
        }
      }
      console.log(`[MobileSQLiteVectorStore] 按角色ID ${characterId} 查询到 ${results.length} 条记录`);
      return results;
    } catch (error) {
      console.error(`[MobileSQLiteVectorStore] 按角色ID查询失败:`, error);
      return [];
    }
  }

  public async getCountByCharacterId(characterId: string): Promise<number> {
    await this.ensureDbReady();
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM ${this.collectionName} 
        WHERE json_extract(payload, '$.agentId') = ?`;
      const result = await this.db!.getFirstAsync<CountResult>(query, [characterId]);
      return result?.count || 0;
    } catch (error) {
      console.error(`[MobileSQLiteVectorStore] 获取角色ID记录数失败:`, error);
      return 0;
    }
  }

  public async getStats(): Promise<{ totalCount: number, dbSize: number }> {
    await this.ensureDbReady();
    try {
      const countQuery = `SELECT COUNT(*) as count FROM ${this.collectionName}`;
      const result = await this.db!.getFirstAsync<CountResult>(countQuery);
      const totalCount = result?.count || 0;
      const dbSize = await this.getDatabaseSize();
      return { totalCount, dbSize };
    } catch (error) {
      console.error('[MobileSQLiteVectorStore] 获取统计信息失败:', error);
      return { totalCount: 0, dbSize: 0 };
    }
  }
}
