import { IMap, IRegion, IConnection } from '../../types';

// A simple Priority Queue implementation for Dijkstra's algorithm
class PriorityQueue<T> {
    private elements: { item: T; priority: number }[] = [];

    enqueue(item: T, priority: number) {
        this.elements.push({ item, priority });
        this.elements.sort((a, b) => a.priority - b.priority);
    }

    dequeue(): T | undefined {
        return this.elements.shift()?.item;
    }

    isEmpty(): boolean {
        return this.elements.length === 0;
    }
}

type WeightFunction = (connection: IConnection, destinationRegion: IRegion) => number;

/**
 * Dijkstra's algorithm implementation to find the shortest path between two regions.
 * @param map - The full map data.
 * @param startRegionId - The ID of the starting region.
 * @param endRegionId - The ID of the destination region.
 * @param getWeight - A function to calculate the weight of a connection.
 * @returns An array of region IDs representing the path, or null if no path is found.
 */
function dijkstra(map: IMap, startRegionId: string, endRegionId: string, getWeight: WeightFunction): string[] | null {
    const distances: { [key: string]: number } = {};
    const previous: { [key: string]: string | null } = {};
    const pq = new PriorityQueue<string>();

    for (const regionId in map.regions) {
        distances[regionId] = Infinity;
        previous[regionId] = null;
    }

    distances[startRegionId] = 0;
    pq.enqueue(startRegionId, 0);

    while (!pq.isEmpty()) {
        const currentRegionId = pq.dequeue();

        if (currentRegionId === undefined) break;
        if (currentRegionId === endRegionId) {
            const path: string[] = [];
            let current = endRegionId;
            while (current) {
                path.unshift(current);
                current = previous[current]!;
            }
            return path;
        }

        const neighbors = map.connections.filter(c => c.from_region === currentRegionId);
        for (const connection of neighbors) {
            const neighborId = connection.to_region;
            const destinationRegion = map.regions[neighborId];
            if (!destinationRegion) continue;

            const weight = getWeight(connection, destinationRegion);
            const distance = distances[currentRegionId] + weight;

            if (distance < distances[neighborId]) {
                distances[neighborId] = distance;
                previous[neighborId] = currentRegionId;
                pq.enqueue(neighborId, distance);
            }
        }
    }

    return null; // No path found
}

/**
 * Calculates the shortest path based on travel time.
 */
const getShortestPathWeight: WeightFunction = (connection) => connection.travel_time;

/**
 * Calculates the safest path based on risk level.
 */
const getSafestPathWeight: WeightFunction = (connection, destinationRegion) => connection.risk_level + destinationRegion.risk_level;

/**
 * Calculates the most adventurous path based on risk and reward.
 */
const getAdventurousPathWeight: WeightFunction = (connection, destinationRegion) => {
    const totalRisk = connection.risk_level + destinationRegion.risk_level;
    const reward = destinationRegion.properties.reward_potential;
    // Avoid division by zero and prioritize high reward
    return totalRisk / (reward + 1);
};

/**
 * Finds different types of paths from a start to an end region.
 * @param map - The map data.
 * @param startRegionId - The starting region ID.
 * @param endRegionId - The destination region ID.
 * @returns An object containing the shortest, safest, and most adventurous paths.
 */
export function findPaths(map: IMap, startRegionId: string, endRegionId: string) {
    const shortestPath = dijkstra(map, startRegionId, endRegionId, getShortestPathWeight);
    const safestPath = dijkstra(map, startRegionId, endRegionId, getSafestPathWeight);
    const adventurousPath = dijkstra(map, startRegionId, endRegionId, getAdventurousPathWeight);

    return {
        shortestPath,
        safestPath,
        adventurousPath,
    };
}
