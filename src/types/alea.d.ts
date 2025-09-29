declare module 'alea' {
  /**
   * Alea 确定性随机数生成器
   * @param seed 随机种子
   * @returns 返回一个函数，每次调用返回0-1之间的随机数
   */
  function alea(seed: string): () => number;
  export = alea;
}
