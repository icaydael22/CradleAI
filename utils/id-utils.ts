/**
 * Generates a simple ID string
 */
export function generateId(): string {
  // 解决 crypto.getRandomValues() 不支持的问题
  // 使用 Math.random() 和 Date.now() 的组合替代 UUID
  console.log('【ID Utils】使用安全的ID生成方法');
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Generates a unique action ID based on source, target and type
 */
export function generateActionId(source: string, target: string, type: string): string {
  // 创建一个基于源数据的确定性ID，避免使用crypto
  console.log(`【ID Utils】为关系行动生成ID: ${source}-${target}-${type}`);
  const timestamp = Date.now().toString(36);
  return `${source.substring(0, 4)}-${target.substring(0, 4)}-${type.substring(0, 4)}-${timestamp}`;
}

/**
 * Generates a unique ID for action-service
 */
export function generateUniqueId(): string {
  // 为action-service生成唯一ID，避免使用crypto
  console.log('【ID Utils】为action-service生成唯一ID');
  return `action-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}
