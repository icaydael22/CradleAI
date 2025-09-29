/**
 * 嵌入器接口
 * 定义了将文本转换为向量表示的基本功能
 */
export interface Embedder {
  /**
   * 将单个文本转换为向量
   * @param text 要嵌入的文本
   * @returns 向量表示（浮点数数组）
   */
  embed(text: string): Promise<number[]>;

  /**
   * 批量将多个文本转换为向量
   * @param texts 要嵌入的文本数组
   * @returns 向量表示数组
   */
  embedBatch(texts: string[]): Promise<number[][]>;
  
  /**
   * 更新API密钥
   * @param apiKey 新的API密钥
   */
  updateApiKey?(apiKey: string): void;
}
