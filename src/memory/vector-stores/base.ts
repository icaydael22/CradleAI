/**
 * 向量存储的基础接口
 */
export interface VectorStore {
  /**
   * 插入向量到存储
   * @param vectors 向量数组
   * @param ids 向量ID数组
   * @param payloads 向量附加信息数组
   */
  insert(
    vectors: number[][],
    ids: string[],
    payloads: Record<string, any>[],
  ): Promise<void>;

  /**
   * 根据查询向量搜索相似向量
   * @param query 查询向量
   * @param limit 返回结果限制
   * @param filters 过滤条件
   */
  search(
    query: number[],
    limit?: number,
    filters?: SearchFilters,
  ): Promise<VectorStoreResult[]>;

  /**
   * 根据ID获取向量
   * @param vectorId 向量ID
   */
  get(vectorId: string): Promise<VectorStoreResult | null>;

  /**
   * 更新向量
   * @param vectorId 向量ID
   * @param vector 新向量（如果为null则保持原向量不变）
   * @param payload 新附加信息
   */
  update(
    vectorId: string,
    vector: number[] | null,
    payload: Record<string, any>,
  ): Promise<void>;

  /**
   * 删除向量
   * @param vectorId 向量ID
   */
  delete(vectorId: string): Promise<void>;

  /**
   * 删除集合
   */
  deleteCol(): Promise<void>;

  /**
   * 列出向量
   * @param filters 过滤条件
   * @param limit 返回结果限制
   */
  list(
    filters?: SearchFilters,
    limit?: number,
  ): Promise<[VectorStoreResult[], number]>;

  /**
   * 按角色ID获取向量数据
   * @param characterId 角色ID
   * @param limit 结果限制
   */
  getByCharacterId(characterId: string, limit?: number): Promise<VectorStoreResult[]>;
  
  /**
   * 按角色ID获取记录数
   * @param characterId 角色ID
   */
  getCountByCharacterId(characterId: string): Promise<number>;
  
  /**
   * 获取数据库文件大小
   */
  getDatabaseSize(): Promise<number>;
  
  /**
   * 获取向量存储统计信息
   */
  getStats(): Promise<{ totalCount: number, dbSize: number }>;
}

/**
 * 搜索过滤条件
 */
export type SearchFilters = Record<string, any>;

/**
 * 向量存储配置
 */
export interface VectorStoreConfig {
  collectionName: string;
  [key: string]: any;
}

/**
 * 向量存储结果
 */
export interface VectorStoreResult {
  id: string;
  payload: Record<string, any>;
  score?: number;
  vector?: number[]; // 添加可选的vector属性，用于存储和传递向量数据
}
