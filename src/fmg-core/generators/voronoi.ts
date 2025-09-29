/**
 * Voronoi 图生成器
 * 
 * 基于 Delaunator 库实现的 Voronoi 图生成，支持确定性生成。
 * 这是地图生成的基础模块，用于创建不规则的多边形网格。
 * 
 * 算法说明：
 * 1. 使用 Delaunator 进行 Delaunay 三角剖分
 * 2. 基于三角剖分结果构建 Voronoi 图的对偶关系
 * 3. 计算每个 Voronoi 单元格的顶点和邻接关系
 */

import Delaunator from 'delaunator';
import { Coordinate, Grid, Cells, Vertices } from '../types/core';
import { DeterministicRNG } from '../utils/rng';

/**
 * Voronoi 图生成器类
 * 
 * 从给定的 Delaunator 实例、点集和点数创建 Voronoi 图。
 * 使用半边（half-edge）数据结构表示点和三角形之间的关系。
 */
export class VoronoiGenerator {
  private delaunay: Delaunator<Coordinate>;
  private points: Coordinate[];
  private pointsN: number;
  private cells: { v: number[][]; c: number[][]; b: number[] };
  private vertices: { p: Coordinate[]; v: number[][]; c: number[][] };

  /**
   * 构造函数
   * @param delaunay Delaunator 实例，包含三角剖分结果
   * @param points 点坐标数组
   * @param pointsN 点的数量
   */
  constructor(delaunay: Delaunator<Coordinate>, points: Coordinate[], pointsN: number) {
    this.delaunay = delaunay;
    this.points = points;
    this.pointsN = pointsN;
    this.cells = { v: [], c: [], b: [] }; // voronoi cells: v = cell vertices, c = adjacent cells, b = near-border cell
    this.vertices = { p: [], v: [], c: [] }; // cells vertices: p = vertex coordinates, v = neighboring vertices, c = adjacent cells

    this.buildVoronoi();
  }

  /**
   * 构建 Voronoi 图
   * 
   * 遍历所有半边，计算每个单元格的顶点和邻接关系。
   * 半边是 Delaunator 输出的索引：
   * - delaunay.triangles[e] 给出半边起始点的 ID
   * - delaunay.halfedges[e] 返回相邻三角形中的对应半边，如果没有相邻三角形则返回 -1
   */
  private buildVoronoi(): void {
    for (let e = 0; e < this.delaunay.triangles.length; e++) {
      const p = this.delaunay.triangles[this.nextHalfedge(e)];
      
      if (p < this.pointsN && !this.cells.c[p]) {
        const edges = this.edgesAroundPoint(e);
        this.cells.v[p] = edges.map(e => this.triangleOfEdge(e)); // cell: adjacent vertex
        this.cells.c[p] = edges.map(e => this.delaunay.triangles[e]).filter(c => c < this.pointsN); // cell: adjacent valid cells
        this.cells.b[p] = edges.length > this.cells.c[p].length ? 1 : 0; // cell: is border
      }

      const t = this.triangleOfEdge(e);
      if (!this.vertices.p[t]) {
        this.vertices.p[t] = this.triangleCenter(t); // vertex: coordinates
        this.vertices.c[t] = this.pointsOfTriangle(e).filter(p => p < this.pointsN); // vertex: adjacent valid cells
      }
    }

    // 计算顶点的邻接关系
    for (let e = 0; e < this.delaunay.triangles.length; e++) {
      const t = this.triangleOfEdge(e);
      const adj = this.triangleAdjacent(t);
      this.vertices.v[t] = adj.filter(a => this.vertices.p[a] !== undefined); // vertex: adjacent vertices
    }
  }

  /**
   * 获取下一个半边
   * @param e 当前半边索引
   * @returns 下一个半边索引
   */
  private nextHalfedge(e: number): number {
    return (e % 3 === 2) ? e - 2 : e + 1;
  }

  /**
   * 获取前一个半边
   * @param e 当前半边索引  
   * @returns 前一个半边索引
   */
  private prevHalfedge(e: number): number {
    return (e % 3 === 0) ? e + 2 : e - 1;
  }

  /**
   * 获取围绕指定点的所有边
   * @param start 起始半边索引
   * @returns 围绕该点的边数组
   */
  private edgesAroundPoint(start: number): number[] {
    const result: number[] = [];
    let incoming = start;
    
    do {
      result.push(incoming);
      const outgoing = this.nextHalfedge(incoming);
      incoming = this.delaunay.halfedges[outgoing];
    } while (incoming !== -1 && incoming !== start);
    
    return result;
  }

  /**
   * 获取边所属的三角形
   * @param e 半边索引
   * @returns 三角形索引
   */
  private triangleOfEdge(e: number): number {
    return Math.floor(e / 3);
  }

  /**
   * 获取三角形的三个顶点
   * @param e 三角形内的任一半边
   * @returns 三个顶点的索引数组
   */
  private pointsOfTriangle(e: number): number[] {
    const t = this.triangleOfEdge(e);
    return [
      this.delaunay.triangles[3 * t],
      this.delaunay.triangles[3 * t + 1], 
      this.delaunay.triangles[3 * t + 2]
    ];
  }

  /**
   * 计算三角形的外心（circumcenter）
   * @param t 三角形索引
   * @returns 外心坐标
   */
  private triangleCenter(t: number): Coordinate {
    const vertices = this.pointsOfTriangle(3 * t);
    const ax = this.points[vertices[0]][0];
    const ay = this.points[vertices[0]][1];
    const bx = this.points[vertices[1]][0];
    const by = this.points[vertices[1]][1];
    const cx = this.points[vertices[2]][0];
    const cy = this.points[vertices[2]][1];

    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const x = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const y = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;

    return [x, y];
  }

  /**
   * 获取三角形的相邻三角形
   * @param t 三角形索引
   * @returns 相邻三角形索引数组
   */
  private triangleAdjacent(t: number): number[] {
    const adjacents: number[] = [];
    for (let e = 3 * t; e < 3 * t + 3; e++) {
      const opposite = this.delaunay.halfedges[e];
      if (opposite >= 0) {
        adjacents.push(this.triangleOfEdge(opposite));
      }
    }
    return adjacents;
  }

  /**
   * 获取生成的单元格数据
   */
  getCells(): { v: number[][]; c: number[][]; b: number[] } {
    return this.cells;
  }

  /**
   * 获取生成的顶点数据
   */
  getVertices(): { p: Coordinate[]; v: number[][]; c: number[][] } {
    return this.vertices;
  }
}

/**
 * 生成随机种子点
 * @param pointsN 点的数量
 * @param width 宽度
 * @param height 高度
 * @param rng 随机数生成器
 * @returns 随机点坐标数组
 */
export function generateRandomPoints(
  pointsN: number, 
  width: number, 
  height: number, 
  rng: DeterministicRNG
): Coordinate[] {
  const points: Coordinate[] = [];
  
  for (let i = 0; i < pointsN; i++) {
    const x = rng.nextFloat(0, width);
    const y = rng.nextFloat(0, height);
    points.push([x, y]);
  }
  
  return points;
}

/**
 * 生成网格化种子点（可选：添加噪声）
 * @param pointsN 点的数量
 * @param width 宽度  
 * @param height 高度
 * @param rng 随机数生成器
 * @param jitter 噪声强度 (0-1)
 * @returns 网格点坐标数组
 */
export function generateGridPoints(
  pointsN: number,
  width: number, 
  height: number,
  rng: DeterministicRNG,
  jitter: number = 0.5
): Coordinate[] {
  const points: Coordinate[] = [];
  const cols = Math.ceil(Math.sqrt(pointsN * width / height));
  const rows = Math.ceil(pointsN / cols);
  
  const cellWidth = width / cols;
  const cellHeight = height / rows;
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols && points.length < pointsN; col++) {
      let x = (col + 0.5) * cellWidth;
      let y = (row + 0.5) * cellHeight;
      
      if (jitter > 0) {
        x += (rng.next() - 0.5) * cellWidth * jitter;
        y += (rng.next() - 0.5) * cellHeight * jitter;
        
        // 确保点在边界内
        x = Math.max(0, Math.min(width, x));
        y = Math.max(0, Math.min(height, y));
      }
      
      points.push([x, y]);
    }
  }
  
  return points;
}

/**
 * 主要的网格生成函数
 * @param pointsN 目标点数量
 * @param width 宽度
 * @param height 高度  
 * @param rng 随机数生成器
 * @param useGrid 是否使用网格化布局
 * @returns 完整的网格对象
 */
export function generateGrid(
  pointsN: number,
  width: number,
  height: number,
  rng: DeterministicRNG,
  useGrid: boolean = true
): Grid {
  console.time('generateGrid');
  
  // 生成种子点
  const points = useGrid 
    ? generateGridPoints(pointsN, width, height, rng, 0.5)
    : generateRandomPoints(pointsN, width, height, rng);
    
  console.log(`Generated ${points.length} seed points`);
  
  // 执行 Delaunay 三角剖分
  console.time('delaunator');
  const delaunay = Delaunator.from(points);
  console.timeEnd('delaunator');
  
  // 构建 Voronoi 图
  console.time('voronoi');
  const voronoi = new VoronoiGenerator(delaunay as any, points, points.length);
  const voronoiCells = voronoi.getCells();
  const voronoiVertices = voronoi.getVertices();
  console.timeEnd('voronoi');
  
  // 创建单元格数据结构
  const cells: Cells = {
    i: Array.from({ length: points.length }, (_, i) => i),
    p: points,
    v: voronoiCells.v,
    c: voronoiCells.c,
    b: new Uint8Array(voronoiCells.b),
    h: new Uint8Array(points.length),
    t: new Int8Array(points.length)
  };
  
  // 创建顶点数据结构
  const vertices: Vertices = {
    p: voronoiVertices.p,
    v: voronoiVertices.v,
    c: voronoiVertices.c
  };
  
  const grid: Grid = {
    cellsDesired: pointsN,
    cellsX: Math.ceil(Math.sqrt(pointsN * width / height)),
    cellsY: Math.ceil(pointsN / Math.ceil(Math.sqrt(pointsN * width / height))),
    points,
    cells,
    vertices,
    boundary: {
      x: 0,
      y: 0,
      width,
      height
    }
  };
  
  console.timeEnd('generateGrid');
  console.log(`Grid generation complete: ${points.length} cells, ${voronoiVertices.p.length} vertices`);
  
  return grid;
}

