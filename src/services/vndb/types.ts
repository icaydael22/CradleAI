/**
 * VNDB API 类型定义
 */

// 查询参数接口
export interface VNDBQueryParams {
  filters: any;
  fields: string;
  sort?: string;
  reverse?: boolean;
  results?: number;
  page?: number;
  user?: string | null;
  count?: boolean;
  compact_filters?: boolean;
  normalized_filters?: boolean;
}

// 角色查询响应接口
export interface VNDBCharacterResponse {
  results: VNDBCharacter[];
  more: boolean;
  count?: number;
  compact_filters?: string;
  normalized_filters?: any[];
}

// 角色基本信息接口
export interface VNDBCharacter {
  id: string;
  name?: string;
  original?: string | null;
  aliases?: string[];
  description?: string | null;
  image?: {
    id?: string;
    url?: string;
    dims?: number[];
  } | null;
  blood_type?: string | null;
  height?: number | null;
  weight?: number | null;
  bust?: number | null;
  waist?: number | null;
  hips?: number | null;
  cup?: string | null;
  age?: number | null;
  birthday?: [number, number] | null;
  sex?: [string | null, string | null] | null;
  vns?: VNDBCharacterVN[];
  traits?: VNDBCharacterTrait[];
}

// 角色所属视觉小说信息接口
export interface VNDBCharacterVN {
  spoiler: number;
  role: string;
  // 移除vn字段，因为它在API中不存在
  release?: any; // 可以根据需要扩展此类型
}

// 角色特征接口
export interface VNDBCharacterTrait {
  spoiler: number;
  lie: boolean;
  group_name?: string;
  name?: string;
  description?: string;
}

// API错误接口
export interface VNDBError {
  code: number;
  message: string;
  details?: any;
}

// 角色查询选项接口
export interface CharacterQueryOptions {
  id?: string;
  search?: string;
  role?: string;
  bloodType?: string;
  sex?: string;
  sexSpoil?: string;
  gender?: string;
  genderSpoil?: string;
  height?: number | null;
  weight?: number | null;
  bust?: number | null;
  waist?: number | null;
  hips?: number | null;
  cup?: string | null;
  age?: number | null;
  trait?: string | [string, number];
  dtrait?: string | [string, number];
  birthday?: [number, number] | null;
  seiyuu?: any;
  vn?: any;
  // Update fields to support both string and string array
  fields?: string | string[];
  sort?: string;
  reverse?: boolean;
  results?: number;
  page?: number;
  count?: boolean;
  
  // Support direct filters
  filters?: any;
}
