import { describe, it, expect } from 'vitest';
import { findPaths } from '@/core/utils/pathfinder';
import { IMap } from '@/types';

describe('Pathfinder', () => {
  describe('Dijkstra Algorithm Robustness', () => {
    it('should find a simple linear path', () => {
      const map: IMap = {
        regions: {
          A: { region_id: 'A', name: 'Start', description: '', status: 'visited', tags: [], properties: { reward_potential: 0 }, risk_level: 0 },
          B: { region_id: 'B', name: 'Middle', description: '', status: 'visited', tags: [], properties: { reward_potential: 0 }, risk_level: 0 },
          C: { region_id: 'C', name: 'End', description: '', status: 'visited', tags: [], properties: { reward_potential: 0 }, risk_level: 0 },
        },
        connections: [
          { from_region: 'A', to_region: 'B', description: '', direction: '', is_visible: true, conditions: [], travel_time: 1, risk_level: 0 },
          { from_region: 'B', to_region: 'C', description: '', direction: '', is_visible: true, conditions: [], travel_time: 1, risk_level: 0 },
        ],
        currentPlayerLocation: 'A',
      };
      const { shortestPath } = findPaths(map, 'A', 'C');
      expect(shortestPath).toEqual(['A', 'B', 'C']);
    });

    it('should choose the correct path with branches', () => {
      const map: IMap = {
        regions: {
          A: { region_id: 'A', name: 'Start', description: '', status: 'visited', tags: [], properties: { reward_potential: 0 }, risk_level: 0 },
          B: { region_id: 'B', name: 'Short Way', description: '', status: 'visited', tags: [], properties: { reward_potential: 0 }, risk_level: 0 },
          C: { region_id: 'C', name: 'Long Way', description: '', status: 'visited', tags: [], properties: { reward_potential: 0 }, risk_level: 0 },
          D: { region_id: 'D', name: 'End', description: '', status: 'visited', tags: [], properties: { reward_potential: 0 }, risk_level: 0 },
        },
        connections: [
          { from_region: 'A', to_region: 'B', description: '', direction: '', is_visible: true, conditions: [], travel_time: 1, risk_level: 0 },
          { from_region: 'B', to_region: 'D', description: '', direction: '', is_visible: true, conditions: [], travel_time: 1, risk_level: 0 },
          { from_region: 'A', to_region: 'C', description: '', direction: '', is_visible: true, conditions: [], travel_time: 10, risk_level: 0 },
          { from_region: 'C', to_region: 'D', description: '', direction: '', is_visible: true, conditions: [], travel_time: 10, risk_level: 0 },
        ],
        currentPlayerLocation: 'A',
      };
      const { shortestPath } = findPaths(map, 'A', 'D');
      expect(shortestPath).toEqual(['A', 'B', 'D']);
    });

    it('should return null for disconnected start and end points', () => {
      const map: IMap = {
        regions: {
          A: { region_id: 'A', name: 'Start', description: '', status: 'visited', tags: [], properties: { reward_potential: 0 }, risk_level: 0 },
          B: { region_id: 'B', name: 'End', description: '', status: 'visited', tags: [], properties: { reward_potential: 0 }, risk_level: 0 },
          C: { region_id: 'C', name: 'Unrelated', description: '', status: 'visited', tags: [], properties: { reward_potential: 0 }, risk_level: 0 },
        },
        connections: [
            { from_region: 'A', to_region: 'A', description: '', direction: '', is_visible: true, conditions: [], travel_time: 1, risk_level: 0 },
        ],
        currentPlayerLocation: 'A',
      };
      const { shortestPath } = findPaths(map, 'A', 'B');
      expect(shortestPath).toBeNull();
    });

    it('should handle maps with cycles correctly', () => {
      const map: IMap = {
        regions: {
          A: { region_id: 'A', name: 'Start', description: '', status: 'visited', tags: [], properties: { reward_potential: 0 }, risk_level: 0 },
          B: { region_id: 'B', name: 'Cycle Node 1', description: '', status: 'visited', tags: [], properties: { reward_potential: 0 }, risk_level: 0 },
          C: { region_id: 'C', name: 'Cycle Node 2', description: '', status: 'visited', tags: [], properties: { reward_potential: 0 }, risk_level: 0 },
          D: { region_id: 'D', name: 'End', description: '', status: 'visited', tags: [], properties: { reward_potential: 0 }, risk_level: 0 },
        },
        connections: [
          { from_region: 'A', to_region: 'B', description: '', direction: '', is_visible: true, conditions: [], travel_time: 1, risk_level: 0 },
          { from_region: 'B', to_region: 'C', description: '', direction: '', is_visible: true, conditions: [], travel_time: 1, risk_level: 0 },
          { from_region: 'C', to_region: 'B', description: '', direction: '', is_visible: true, conditions: [], travel_time: 1, risk_level: 0 }, // Cycle
          { from_region: 'C', to_region: 'D', description: '', direction: '', is_visible: true, conditions: [], travel_time: 1, risk_level: 0 },
        ],
        currentPlayerLocation: 'A',
      };
      const { shortestPath } = findPaths(map, 'A', 'D');
      expect(shortestPath).toEqual(['A', 'B', 'C', 'D']);
    });

    it('should return a single-node path if start is end', () => {
      const map: IMap = {
        regions: {
          A: { region_id: 'A', name: 'Start/End', description: '', status: 'visited', tags: [], properties: { reward_potential: 0 }, risk_level: 0 },
        },
        connections: [],
        currentPlayerLocation: 'A',
      };
      const { shortestPath } = findPaths(map, 'A', 'A');
      expect(shortestPath).toEqual(['A']);
    });
  });

  describe('findPaths Function Integration', () => {
    const complexMap: IMap = {
      regions: {
        Home: { region_id: 'Home', name: 'Home', description: '', status: 'visited', tags: [], properties: { reward_potential: 1 }, risk_level: 0 },
        Forest: { region_id: 'Forest', name: 'Forest', description: '', status: 'visited', tags: [], properties: { reward_potential: 10 }, risk_level: 5 },
        Mountain: { region_id: 'Mountain', name: 'Mountain', description: '', status: 'visited', tags: [], properties: { reward_potential: 20 }, risk_level: 10 },
        Cave: { region_id: 'Cave', name: 'Cave', description: '', status: 'visited', tags: [], properties: { reward_potential: 50 }, risk_level: 8 },
        City: { region_id: 'City', name: 'City', description: '', status: 'visited', tags: [], properties: { reward_potential: 5 }, risk_level: 1 },
      },
      connections: [
        // Home connections
        { from_region: 'Home', to_region: 'Forest', description: '', direction: '', is_visible: true, conditions: [], travel_time: 2, risk_level: 3 },
        { from_region: 'Home', to_region: 'City', description: '', direction: '', is_visible: true, conditions: [], travel_time: 1, risk_level: 1 },
        // Forest connections
        { from_region: 'Forest', to_region: 'Mountain', description: '', direction: '', is_visible: true, conditions: [], travel_time: 5, risk_level: 8 },
        { from_region: 'Forest', to_region: 'Cave', description: '', direction: '', is_visible: true, conditions: [], travel_time: 3, risk_level: 6 },
        // City connections
        { from_region: 'City', to_region: 'Mountain', description: '', direction: '', is_visible: true, conditions: [], travel_time: 8, risk_level: 4 },
      ],
      currentPlayerLocation: 'Home',
    };

    it('should calculate the shortest path correctly', () => {
      const { shortestPath } = findPaths(complexMap, 'Home', 'Mountain');
      // Home -> Forest -> Mountain (2 + 5 = 7) vs Home -> City -> Mountain (1 + 8 = 9)
      expect(shortestPath).toEqual(['Home', 'Forest', 'Mountain']);
    });

    it('should calculate the safest path correctly', () => {
      const { safestPath } = findPaths(complexMap, 'Home', 'Mountain');
      // Home -> Forest -> Mountain: (3+5) + (8+10) = 26
      // Home -> City -> Mountain: (1+1) + (4+10) = 16
      expect(safestPath).toEqual(['Home', 'City', 'Mountain']);
    });

    it('should calculate the most adventurous path correctly', () => {
      const { adventurousPath } = findPaths(complexMap, 'Home', 'Mountain');
      // Path via Forest: Risk(3+5)/(Rew 10+1) + Risk(8+10)/(Rew 20+1) = 8/11 + 18/21 = 0.72 + 0.85 = 1.57
      // Path via City: Risk(1+1)/(Rew 5+1) + Risk(4+10)/(Rew 20+1) = 2/6 + 14/21 = 0.33 + 0.66 = 0.99
      // Lower score is better for adventurous path in this weighting
      expect(adventurousPath).toEqual(['Home', 'City', 'Mountain']);
    });

    it('should produce different paths for a well-defined map', () => {
        const map: IMap = {
            regions: {
              A: { region_id: 'A', name: 'A', description: '', status: 'visited', tags: [], properties: { reward_potential: 1 }, risk_level: 1 },
              B: { region_id: 'B', name: 'B', description: '', status: 'visited', tags: [], properties: { reward_potential: 10 }, risk_level: 10 }, // Risky but rewarding
              C: { region_id: 'C', name: 'C', description: '', status: 'visited', tags: [], properties: { reward_potential: 1 }, risk_level: 1 }, // Safe but boring
              D: { region_id: 'D', name: 'D', description: '', status: 'visited', tags: [], properties: { reward_potential: 5 }, risk_level: 5 },
            },
            connections: [
              { from_region: 'A', to_region: 'B', description: '', direction: '', is_visible: true, conditions: [], travel_time: 10, risk_level: 10 }, // Long, risky
              { from_region: 'A', to_region: 'C', description: '', direction: '', is_visible: true, conditions: [], travel_time: 1, risk_level: 1 },   // Short, safe
              { from_region: 'B', to_region: 'D', description: '', direction: '', is_visible: true, conditions: [], travel_time: 1, risk_level: 1 },
              { from_region: 'C', to_region: 'D', description: '', direction: '', is_visible: true, conditions: [], travel_time: 10, risk_level: 10 },
            ],
            currentPlayerLocation: 'A',
          };
      const { shortestPath, safestPath, adventurousPath } = findPaths(map, 'A', 'D');
      expect(shortestPath).toEqual(['A', 'C', 'D']);
      expect(safestPath).toEqual(['A', 'C', 'D']);
      expect(adventurousPath).toEqual(['A', 'B', 'D']);
      expect(shortestPath).not.toEqual(adventurousPath);
    });
  });
});