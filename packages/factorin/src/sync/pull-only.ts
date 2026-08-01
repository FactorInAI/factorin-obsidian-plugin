/**
 * The pull-only decider — how the plugin honors `drive: 'read'` (Overview
 * document §6.2).
 *
 * A token minted with read-only Drive access can list and download but every
 * write is rejected server-side, so running the bidirectional decider as-is
 * would fill each sync with tasks doomed to 403. Instead the connect flow
 * selects this decider, which delegates to the kernel's `bidirectional` entry
 * and drops every task that would mutate the remote. Local-only files simply
 * stay local, and conflicted files keep the local version untouched until the
 * user connects with write access — the safe reading of "pull-only".
 *
 * Types here follow the package's structural-declaration rule (Overview §4.1):
 * the kernel's `DeciderInput` / `BaseTask` are never named. The two `as` casts
 * below are the entire cost of that rule — each is justified where it occurs.
 */

/** The id the decider registers under; `settings.decider` selects it by this string. */
export const FACTORIN_PULL_ONLY_DECIDER = 'factorinPullOnly';

/** The kernel decider this one delegates to, registered by upstream's `Bootstrap`. */
const BIDIRECTIONAL_DECIDER = 'bidirectional';

/**
 * The slice of the kernel's `DeciderInput` this file touches. Declared as a
 * *supertype* on purpose: the real input flows through to the wrapped decider
 * untouched, so the fewer members named here, the less there is to drift.
 */
export type FactorinDeciderInput = { logger: (log: string) => void };

/**
 * The one property of the kernel's `BaseTask` the filter reads. Task names are
 * the `TaskNames` union in `packages/plugin/src/sync/tasks/interface.ts` —
 * re-check {@link REMOTE_MUTATING_TASKS} against it on every upstream merge.
 */
export type FactorinTask = { name: string };

/**
 * The kernel's `DeciderEntry`, narrowed structurally. `decider` is `unknown`
 * rather than a function type because the registry is read *covariantly* here
 * — naming a parameter type would flip the variance and stop the real registry
 * from satisfying this shape. The call site casts it back.
 */
export type FactorinDeciderEntry = { decider: unknown; prettyName: string };

export type FactorinPullOnlyContext = {
	deciderRegistry: ReadonlyMap<string, FactorinDeciderEntry>;
	registerDecider: (
		id: string,
		/*
		 * `Array<never>` — not `Array<FactorinTask>` — because returns are checked
		 * covariantly: this entry must be assignable to the kernel's, and a task
		 * this package could describe structurally is not a `BaseTask`. The tasks
		 * actually returned are the wrapped decider's own, so the type is honest at
		 * runtime; the cast lives at the single `return` below.
		 */
		entry: { decider: (input: FactorinDeciderInput) => Array<never>; prettyName: string },
	) => () => void;
};

/**
 * Tasks that write to the remote. Everything else — downloads, local
 * creates/removes/moves, record bookkeeping — is the pull direction and passes
 * through. `resolveConflict` is in the set because every shipped resolver
 * except `keepRemote` may write remotely; dropping it leaves the local version
 * in place, which is the only side a read token is allowed to change.
 */
const REMOTE_MUTATING_TASKS = new Set([
	'createRemoteDir',
	'moveRemote',
	'removeRemote',
	'resolveConflict',
	'upload',
]);

/**
 * Register the `factorinPullOnly` decider. Registered unconditionally at
 * `start()` — like every backend the module ships — so a persisted
 * `settings.decider` pointing at it resolves on the next launch, not only in
 * the session that connected. Returns the unregister callback for the module's
 * `dispose()` queue.
 */
export function registerPullOnlyDecider(ctx: FactorinPullOnlyContext, prettyName: string) {
	const { deciderRegistry, registerDecider } = ctx;
	return registerDecider(FACTORIN_PULL_ONLY_DECIDER, {
		decider: (input) => {
			/*
			 * Looked up lazily, per sync, so this holds no reference to another
			 * module's registration across reloads.
			 */
			const wrapped = deciderRegistry.get(BIDIRECTIONAL_DECIDER);
			if (!wrapped)
				throw new Error(`Decider "${BIDIRECTIONAL_DECIDER}" is not installed!`);
			/*
			 * The registry types `decider` as `unknown` (see FactorinDeciderEntry);
			 * this cast restores the callable shape. Sound because the registry only
			 * ever holds kernel `Decider`s, whose input is a subtype of ours and
			 * whose tasks all carry `name`.
			 */
			const decide = wrapped.decider as (
				input: FactorinDeciderInput,
			) => ReadonlyArray<FactorinTask>;
			const tasks = decide(input);
			const kept = tasks.filter((task) => !REMOTE_MUTATING_TASKS.has(task.name));
			if (kept.length !== tasks.length)
				input.logger(
					`Factor.In pull-only: dropped ${tasks.length - kept.length} remote-mutating task(s) — the token's drive access is read-only.`,
				);
			// See the `Array<never>` note on FactorinPullOnlyContext.
			return kept as Array<never>;
		},
		prettyName,
	});
}
