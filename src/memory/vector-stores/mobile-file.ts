import * as FileSystem from 'expo-file-system';
import { VectorStore, SearchFilters, VectorStoreConfig, VectorStoreResult } from './base';

interface FileVectorStoreConfig extends VectorStoreConfig {
  baseDir?: string; // 可选：自定义存储目录
  dimension: number;
}

export class MobileFileVectorStore implements VectorStore {
  private baseDir: string;
  private collectionName: string;
  private dimension: number;

  constructor(config: FileVectorStoreConfig) {
    this.collectionName = config.collectionName;
    this.dimension = config.dimension || 1536;
    this.baseDir = config.baseDir || `${FileSystem.documentDirectory}vector-store/${this.collectionName}`;
  }

  private getItemPath(id: string): string {
    return `${this.baseDir}/${id}.json`;
  }

  private async ensureDir(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(this.baseDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
    }
  }

  async insert(
    vectors: number[][],
    ids: string[],
    payloads: Record<string, any>[],
  ): Promise<void> {
    await this.ensureDir();
    for (let i = 0; i < vectors.length; i++) {
      if (vectors[i].length !== this.dimension) {
        throw new Error(`向量维度不匹配。期望 ${this.dimension}, 实际 ${vectors[i].length}`);
      }
      const item = {
        id: ids[i],
        vector: vectors[i],
        payload: payloads[i],
      };
      await FileSystem.writeAsStringAsync(this.getItemPath(ids[i]), JSON.stringify(item));
    }
  }

  async search(
    query: number[],
    limit: number = 10,
    filters?: SearchFilters,
  ): Promise<VectorStoreResult[]> {
    await this.ensureDir();
    if (query.length !== this.dimension) {
      throw new Error(`查询向量维度不匹配。期望 ${this.dimension}, 实际 ${query.length}`);
    }
    const files = await FileSystem.readDirectoryAsync(this.baseDir);
    const results: VectorStoreResult[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const content = await FileSystem.readAsStringAsync(`${this.baseDir}/${file}`);
      const item = JSON.parse(content);
      if (filters && !Object.entries(filters).every(([k, v]) => item.payload[k] === v)) continue;
      const score = this.cosineSimilarity(query, item.vector);
      results.push({ id: item.id, payload: item.payload, score });
    }
    results.sort((a, b) => (b.score || 0) - (a.score || 0));
    return results.slice(0, limit);
  }

  async get(vectorId: string): Promise<VectorStoreResult | null> {
    await this.ensureDir();
    try {
      const content = await FileSystem.readAsStringAsync(this.getItemPath(vectorId));
      const item = JSON.parse(content);
      return { id: item.id, payload: item.payload, vector: item.vector };
    } catch {
      return null;
    }
  }

  async update(
    vectorId: string,
    vector: number[] | null,
    payload: Record<string, any>,
  ): Promise<void> {
    await this.ensureDir();
    const existing = await this.get(vectorId);
    if (!existing) throw new Error(`向量ID ${vectorId} 不存在`);
    const newVector = vector === null ? existing.vector : vector;
    await FileSystem.writeAsStringAsync(
      this.getItemPath(vectorId),
      JSON.stringify({ id: vectorId, vector: newVector, payload })
    );
  }

  async delete(vectorId: string): Promise<void> {
    await this.ensureDir();
    await FileSystem.deleteAsync(this.getItemPath(vectorId), { idempotent: true });
  }

  async deleteCol(): Promise<void> {
    await this.ensureDir();
    const files = await FileSystem.readDirectoryAsync(this.baseDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        await FileSystem.deleteAsync(`${this.baseDir}/${file}`, { idempotent: true });
      }
    }
  }

  async list(
    filters?: SearchFilters,
    limit: number = 100,
  ): Promise<[VectorStoreResult[], number]> {
    await this.ensureDir();
    const files = await FileSystem.readDirectoryAsync(this.baseDir);
    const results: VectorStoreResult[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const content = await FileSystem.readAsStringAsync(`${this.baseDir}/${file}`);
      const item = JSON.parse(content);
      if (filters && !Object.entries(filters).every(([k, v]) => item.payload[k] === v)) continue;
      results.push({ id: item.id, payload: item.payload });
    }
    return [results.slice(0, limit), results.length];
  }

  async getByCharacterId(characterId: string, limit: number = 100): Promise<VectorStoreResult[]> {
    await this.ensureDir();
    const files = await FileSystem.readDirectoryAsync(this.baseDir);
    const results: VectorStoreResult[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const content = await FileSystem.readAsStringAsync(`${this.baseDir}/${file}`);
      const item = JSON.parse(content);
      if (item.payload.agentId === characterId) {
        results.push({ id: item.id, payload: item.payload });
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  async getCountByCharacterId(characterId: string): Promise<number> {
    await this.ensureDir();
    const files = await FileSystem.readDirectoryAsync(this.baseDir);
    let count = 0;
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const content = await FileSystem.readAsStringAsync(`${this.baseDir}/${file}`);
      const item = JSON.parse(content);
      if (item.payload.agentId === characterId) count++;
    }
    return count;
  }

  async getDatabaseSize(): Promise<number> {
    await this.ensureDir();
    let total = 0;
    const files = await FileSystem.readDirectoryAsync(this.baseDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const info = await FileSystem.getInfoAsync(`${this.baseDir}/${file}`);
      if (info.exists && info.size) total += info.size;
    }
    return total;
  }

  async getStats(): Promise<{ totalCount: number, dbSize: number }> {
    await this.ensureDir();
    const files = await FileSystem.readDirectoryAsync(this.baseDir);
    let total = 0;
    let count = 0;
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const info = await FileSystem.getInfoAsync(`${this.baseDir}/${file}`);
      if (info.exists && info.size) total += info.size;
      count++;
    }
    return { totalCount: count, dbSize: total };
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
}
