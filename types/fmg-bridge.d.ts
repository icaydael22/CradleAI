/**
 * Fantasy Map Generator Bridge Types
 * Fantasy Map Generator数据结构和桥接器的TypeScript类型定义
 */

// 基础数据类型
export interface FMGCell {
  i: number;
  p: [number, number]; // [x, y] coordinates
  h: number; // height
  area: number;
  c: number[]; // neighbor cells
  b: number; // biome
  f: number; // feature
  t: number; // temperature
  prec: number; // precipitation
}

export interface FMGCulture {
  i: number;
  name: string;
  base: number;
  color: string;
  expansionism: number;
  type: string;
  shield: string;
  code: string;
}

export interface FMGReligion {
  i: number;
  name: string;
  color: string;
  culture: number;
  type: string;
  form: string;
  deity: string;
  expansion: string;
  origin: number;
}

export interface FMGState {
  i: number;
  name: string;
  fullName: string;
  color: string;
  culture: number;
  form: string;
  capital: number;
  center: number;
  cells: number;
  burgs: number;
  area: number;
  rural: number;
  urban: number;
  diplomacy: string[];
}

export interface FMGProvince {
  i: number;
  state: number;
  center: number;
  burg: number;
  name: string;
  fullName: string;
  color: string;
  cells: number;
  burgs: number;
  area: number;
  rural: number;
  urban: number;
}

export interface FMGBurg {
  i: number;
  cell: number;
  x: number;
  y: number;
  state: number;
  name: string;
  population: number;
  type: string;
  capital: number;
  feature: number;
  port: number;
}

export interface FMGMarker {
  i: number;
  cell: number;
  x: number;
  y: number;
  type: string;
  size: number;
  dx: number;
  dy: number;
  icon?: string;
  fill?: string;
  stroke?: string;
}

export interface FMGNote {
  id: string;
  name: string;
  legend: string;
}

export interface FMGRiver {
  i: number;
  source: number;
  mouth: number;
  cells: number[];
  basin: number;
  name: string;
  type: string;
  discharge: number;
  length: number;
  width: number;
  widthFactor: number;
  sourceWidth: number;
}

export interface FMGRoute {
  i: number;
  cells: number[];
  feature: number;
  group: string;
  length: number;
}

export interface FMGFeature {
  i: number;
  land: boolean;
  border: boolean;
  type: string;
  cells: number;
  firstCell: number;
  group: string;
}

// 地图数据结构
export interface FMGMapData {
  seed: string;
  mapId: string;
  stats: {
    cells: number;
    states: number;
    provinces: number;
    burgs: number;
    religions: number;
    cultures: number;
    rivers: number;
    routes: number;
    markers: number;
    notes: number;
  };
  cultures: FMGCulture[];
  religions: FMGReligion[];
  states: FMGState[];
  markers: FMGMarker[];
  notes: FMGNote[];
}

export interface FMGFullData {
  seed: string;
  mapId: string;
  pack: {
    cultures: FMGCulture[];
    religions: FMGReligion[];
    states: FMGState[];
    burgs: FMGBurg[];
    provinces: FMGProvince[];
    markers: FMGMarker[];
    rivers: FMGRiver[];
    routes: FMGRoute[];
    features: FMGFeature[];
    cells: {
      i: number[];
      p: [number, number][];
      h: number[];
      area: number[];
    };
  };
  grid: {
    spacing: number;
    cellsX: number;
    cellsY: number;
  };
  notes: FMGNote[];
  options: any;
}

// 桥接器消息类型
export type FMGMessageType = 
  | 'GET_MAP_DATA'
  | 'UPDATE_MAP_DATA'
  | 'ADD_MARKER'
  | 'UPDATE_CULTURE'
  | 'UPDATE_RELIGION'
  | 'UPDATE_STATE'
  | 'ADD_NOTE'
  | 'SAVE_MAP'
  | 'REDRAW_MAP'
  | 'MAP_DATA'
  | 'UPDATE_SUCCESS'
  | 'UPDATE_ERROR'
  | 'MARKER_ADDED'
  | 'NOTE_ADDED'
  | 'MAP_SAVED'
  | 'SAVE_ERROR'
  | 'MAP_REDRAWN'
  | 'REDRAW_ERROR'
  | 'MAP_DATA_EXPORTED'
  | 'BRIDGE_READY'
  | 'CONSOLE_LOG'
  | 'ERROR';

export interface FMGMessage {
  type: FMGMessageType;
  requestId?: string;
  payload?: any;
  data?: any;
  error?: string;
  dataType?: string;
  level?: 'log' | 'warn' | 'error'; // For CONSOLE_LOG messages
  message?: string; // For CONSOLE_LOG messages
}

// 更新操作类型
export interface FMGUpdateData {
  dataType: 'cultures' | 'religions' | 'states' | 'burgs' | 'provinces' | 'markers' | 'notes';
  updates: Array<any>;
}

// Optional extended update payloads for advanced handlers
export type FMGBurgUpdate = (
  | { action: 'create'; i?: number; cell?: number; x?: number; y?: number; name?: string; population?: number; type?: string; capital?: boolean; feature?: number; port?: number }
  | { action: 'move'; i: number; cell?: number; x?: number; y?: number }
  | { action: 'remove'; i: number }
  | { action: 'setCapital'; i: number }
  | { action: 'setPort'; i: number; port?: number | boolean }
  | ({ i: number } & Partial<FMGBurg>)
);

export type FMGProvinceUpdate = (
  | { action: 'setCells'; i: number; cells: number[] }
  | { action: 'remove'; i: number }
  | { action: 'setCapital'; i: number; burg: number }
  | ({ i: number } & Partial<FMGProvince>)
);

export interface FMGCultureUpdate extends Partial<FMGCulture> {
  i: number; // 必须指定要更新的文化ID
}

export interface FMGReligionUpdate extends Partial<FMGReligion> {
  i: number; // 必须指定要更新的宗教ID
}

export interface FMGStateUpdate extends Partial<FMGState> {
  i: number; // 必须指定要更新的国家ID
}

export interface FMGMarkerUpdate extends Partial<FMGMarker> {
  i?: number; // 如果指定则更新现有标记，否则创建新标记
}

export interface FMGNoteUpdate extends Partial<FMGNote> {
  id?: string; // 如果指定则更新现有注释，否则创建新注释
}

// 标记类型枚举
export enum FMGMarkerType {
  STAR = 'star',
  CASTLE = 'castle',
  TOWN = 'town',
  CITY = 'city',
  CAPITAL = 'capital',
  RUIN = 'ruin',
  TEMPLE = 'temple',
  MINE = 'mine',
  TOWER = 'tower',
  VOLCANO = 'volcano',
  LAKE = 'lake',
  MOUNTAIN = 'mountain',
  FOREST = 'forest',
  DESERT = 'desert',
  SWAMP = 'swamp',
  CAVE = 'cave',
  BRIDGE = 'bridge',
  LIGHTHOUSE = 'lighthouse',
  MONUMENT = 'monument'
}

// 宗教类型枚举
export enum FMGReligionType {
  FOLKLORE = 'Folklore',
  SHAMANISM = 'Shamanism',
  ANIMISM = 'Animism',
  ANCESTOR_WORSHIP = 'Ancestor worship',
  POLYTHEISM = 'Polytheism',
  DUALISM = 'Dualism',
  MONOTHEISM = 'Monotheism',
  NON_THEISM = 'Non-theism',
  CULT = 'Cult',
  HERESY = 'Heresy'
}

// 国家政体类型枚举
export enum FMGStateForm {
  TRIBAL = 'Tribal',
  CHIEFDOM = 'Chiefdom',
  DUCHY = 'Duchy',
  PRINCIPALITY = 'Principality',
  KINGDOM = 'Kingdom',
  EMPIRE = 'Empire',
  FEDERATION = 'Federation',
  REPUBLIC = 'Republic',
  UNION = 'Union',
  CONFEDERATION = 'Confederation',
  LEAGUE = 'League',
  HORDE = 'Horde',
  CALIPHATE = 'Caliphate',
  SULTANATE = 'Sultanate',
  KHANATE = 'Khanate',
  DESPOTATE = 'Despotate',
  OLIGARCHY = 'Oligarchy',
  THEOCRACY = 'Theocracy'
}

// 桥接器类型
export interface FMGBridge {
  isInitialized: boolean;
  init(): void;
  getMapData(requestId?: string): void;
  updateMapData(data: FMGUpdateData): void;
  addMarker(markerData: Partial<FMGMarker>): void;
  addNote(noteData: Partial<FMGNote>): void;
  saveMap(): void;
  redrawMap(): void;
  getData(dataType: string): any;
  exportMapData(): FMGFullData;
  addEventListener(eventType: string, callback: (data: any) => void): void;
  dispatchEvent(eventType: string, data: any): void;
}

// 工具函数类型
export interface FMGUtils {
  findNearestCell(x: number, y: number): number;
  generateCultureName(base?: string): string;
  generateReligionName(type?: FMGReligionType): string;
  generateStateName(culture?: number): string;
  validateCoordinates(x: number, y: number): boolean;
  convertWorldToScreen(x: number, y: number): [number, number];
  convertScreenToWorld(x: number, y: number): [number, number];
}

// React Native WebView消息处理器类型
export interface WebViewMessageHandler {
  onMessage: (event: { nativeEvent: { data: string } }) => void;
  postMessage: (message: FMGMessage) => void;
}

// 声明全局变量类型（用于WebView环境）
declare global {
  interface Window {
    FMGBridge?: FMGBridge;
    pack?: {
      cultures: FMGCulture[];
      religions: FMGReligion[];
      states: FMGState[];
      burgs: FMGBurg[];
      provinces: FMGProvince[];
      markers?: FMGMarker[];
      rivers?: FMGRiver[];
      routes?: FMGRoute[];
      features: FMGFeature[];
      cells: {
        i: number[];
        p: [number, number][];
        h: number[];
        area: number[];
        q?: any; // quadtree
      };
    };
    grid?: {
      spacing: number;
      cellsX: number;
      cellsY: number;
      cells: any;
      features: any;
    };
    notes?: FMGNote[];
    seed?: string;
    mapId?: string;
    options?: any;
    drawLayers?: () => void;
    refreshAllEditors?: () => void;
    save?: () => void;
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
  }
}
