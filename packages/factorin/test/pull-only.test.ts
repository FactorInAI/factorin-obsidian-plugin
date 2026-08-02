import { describe, expect, test } from 'bun:test';
import type { FactorinDeciderInput, FactorinTask } from '@/sync/pull-only';
import { FACTORIN_PULL_ONLY_DECIDER, registerPullOnlyDecider } from '@/sync/pull-only';
import { createModuleContext } from './module-context';

/** Register the decider, seed a fake `bidirectional`, and return a way to run it. */
function createHarness(tasks: Array<FactorinTask>) {
	const ctx = createModuleContext();
	const unregister = registerPullOnlyDecider(ctx, () => 'Factor.In (pull only)');
	ctx.deciderRegistry.set('bidirectional', {
		decider: () => tasks,
		prettyName: () => 'Bidirectional',
	});
	const logs: Array<string> = [];
	const run = () => {
		const entry = ctx.deciderRegistry.get(FACTORIN_PULL_ONLY_DECIDER);
		if (!entry) throw new Error('pull-only decider is not registered');
		const decide = entry.decider as (input: FactorinDeciderInput) => Array<FactorinTask>;
		return decide({ logger: (log) => logs.push(log) });
	};
	return { ctx, logs, run, unregister };
}

describe('the pull-only decider', () => {
	test('registers under its id and unregisters via the returned callback', () => {
		const { ctx, unregister } = createHarness([]);
		expect(ctx.deciderRegistry.get(FACTORIN_PULL_ONLY_DECIDER)?.prettyName()).toBe(
			'Factor.In (pull only)',
		);
		unregister();
		expect(ctx.deciderRegistry.has(FACTORIN_PULL_ONLY_DECIDER)).toBe(false);
	});

	test('passes the pull direction through untouched', () => {
		const tasks = [
			{ name: 'download' },
			{ name: 'createLocalDir' },
			{ name: 'removeLocal' },
			{ name: 'moveLocal' },
			{ name: 'updateRecord' },
		];
		const { logs, run } = createHarness(tasks);
		expect(run()).toEqual(tasks);
		expect(logs).toEqual([]);
	});

	test('drops every remote-mutating task and says how many, once', () => {
		const { logs, run } = createHarness([
			{ name: 'upload' },
			{ name: 'download' },
			{ name: 'createRemoteDir' },
			{ name: 'removeRemote' },
			{ name: 'moveRemote' },
			/*
			 * In the set because every shipped resolver except `keepRemote` may write
			 * remotely; dropping it keeps the local version — the only side a read
			 * token may change.
			 */
			{ name: 'resolveConflict' },
		]);
		expect(run()).toEqual([{ name: 'download' }]);
		expect(logs).toEqual([
			"Factor.In pull-only: dropped 5 remote-mutating task(s) — the token's drive access is read-only.",
		]);
	});

	test('reports a missing bidirectional decider instead of syncing nothing', () => {
		const { ctx, run } = createHarness([]);
		ctx.deciderRegistry.delete('bidirectional');
		expect(() => run()).toThrow('Decider "bidirectional" is not installed!');
	});

	/*
	 * The wrapped decider is looked up per sync, not captured at registration —
	 * a reloaded Bootstrap module's fresh registration must be the one that runs.
	 */
	test('follows a re-registered bidirectional decider', () => {
		const { ctx, run } = createHarness([{ name: 'upload' }]);
		ctx.deciderRegistry.set('bidirectional', {
			decider: () => [{ name: 'download' }],
			prettyName: () => 'Bidirectional',
		});
		expect(run()).toEqual([{ name: 'download' }]);
	});
});
