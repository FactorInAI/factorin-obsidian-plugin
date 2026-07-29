import type { StatsMap } from '@/types';

export default function postTraversal({ stats, maxSize }: { stats: StatsMap; maxSize?: number }) {
	const includedStats: StatsMap = new Map();
	if (stats.size === 0) return includedStats;
	for (const [path, stat] of stats) {
		if (!stat.isDir && maxSize && stat.size > maxSize) continue;
		includedStats.set(path, stat);
	}
	return includedStats;
}
