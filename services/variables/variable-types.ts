export type VariableType = 'string' | 'number' | 'boolean' | 'object' | 'array';

// 条件分支定义
export interface ConditionBranch {
  condition?: string; // 条件表达式，if/elseif分支必须有，else分支不需要
  value: any; // 该分支的值
}

export interface Variable {
  type: VariableType;
  value: any;
  // 条件变量支持
  isConditional?: boolean; // 是否为条件变量
  branches?: ConditionBranch[]; // 条件分支列表 [if, elseif1, elseif2, ..., else]
}

export interface TableColumn {
  name: string;
  type: VariableType;
  required?: boolean;
}

export interface Table {
  name: string;
  columns: TableColumn[];
  rows: Record<string, any>[];
}

export interface HiddenVariable {
  condition: string; // 条件表达式
  value: any;
  // 期限支持
  hasExpiration?: boolean; // 是否有期限，默认false（无期限）
  isExpired?: boolean; // 是否已过期（被使用过），默认false
}

export interface VariableSystemConfig {
  variables?: Record<string, Variable>;
  tables?: Record<string, Table>;
  hiddenVariables?: Record<string, HiddenVariable>;
}

export interface XMLTagConfig {
  setVar: string;
  registerVar: string;
  registerVars: string;
  unregisterVar: string;
  unregisterVars: string;
  registerTable: string;
  unregisterTable: string;
  registerHiddenVar: string;
  unregisterHiddenVar: string;
  setTable: string;
  addTableRow: string;
  removeTableRow: string;
  setHiddenVar: string;
}

export interface VariableSystem {
  variables: Record<string, Variable>;
  tables: Record<string, Table>;
  hiddenVariables: Record<string, HiddenVariable>;
}