import type { SearchResult } from 'obsidian';
import { prepareFuzzySearch } from 'obsidian';
import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import type { ModuleMeta } from '@/modules/Extensibility';
import type { DisplayModule, ModuleManagementContext, PendingAction } from './index';
import Card from './Card';

export default function App(props: { ctx: ModuleManagementContext; isUnmounted: () => boolean }) {
	const t = props.ctx.translate;
	const [sourceModules, setSourceModules] = createSignal<Array<ModuleMeta>>([]);
	const [installedVersions, setInstalledVersions] = createSignal<Record<string, string>>({});
	const [loadedNames, setLoadedNames] = createSignal<Set<string>>(new Set());
	const [query, setQuerySignal] = createSignal('');
	const [showInstalledOnly, setShowInstalledOnlySignal] = createSignal(false);
	const [hasLoaded, setHasLoaded] = createSignal(false);
	const [isLoading, setIsLoading] = createSignal(false);
	const [pendingByName, setPendingByName] = createSignal<
		Record<string, PendingAction | undefined>
	>({});

	const syncSnapshots = () => {
		if (props.isUnmounted()) return;
		setInstalledVersions(Object.fromEntries(props.ctx.discoveredModules));
		setLoadedNames(new Set(props.ctx.loadedModules.keys()));
	};

	const refreshSources = async () => {
		if (props.isUnmounted()) return;
		setIsLoading(true);
		try {
			const modules = await props.ctx.fetchSources();
			if (props.isUnmounted()) return;
			setSourceModules(modules);
			syncSnapshots();
			setHasLoaded(true);
		} finally {
			if (!props.isUnmounted()) setIsLoading(false);
		}
	};

	const mergedModules = createMemo<Array<DisplayModule>>(() =>
		mergeModules(sourceModules(), installedVersions()),
	);

	const visibleModules = createMemo<Array<DisplayModule>>(() => {
		const installedByName = installedVersions();
		const normalizedQuery = query().trim();
		const filtered = mergedModules().filter((module) => {
			if (!showInstalledOnly()) return true;
			return installedByName[module.name] !== undefined;
		});

		if (!normalizedQuery) return [...filtered].sort(sortModulesAlphabetically);

		const match = prepareFuzzySearch(normalizedQuery);
		return filtered
			.map((module) => ({ module, score: getModuleScore(match, module) }))
			.filter(
				(entry): entry is { module: DisplayModule; score: number } => entry.score !== null,
			)
			.sort((a, b) => b.score - a.score || sortModulesAlphabetically(a.module, b.module))
			.map(({ module }) => module);
	});

	const runAction = async (name: string, action: PendingAction, op: () => Promise<void>) => {
		if (props.isUnmounted()) return;
		setPendingByName((current) => ({ ...current, [name]: action }));
		try {
			await op();
			syncSnapshots();
		} finally {
			if (!props.isUnmounted())
				setPendingByName((current) => ({ ...current, [name]: undefined }));
		}
	};

	const unsubscribeQuery = props.ctx.onQuery.subscribe((nextQuery) => setQuerySignal(nextQuery));
	const unsubscribeShowInstalledOnly = props.ctx.onShowInstalledOnlyChange.subscribe((enabled) =>
		setShowInstalledOnlySignal(enabled),
	);
	const unsubscribeSourcesChange = props.ctx.onSourcesChange.subscribe(() => {
		void refreshSources();
	});

	onCleanup(() => {
		unsubscribeQuery();
		unsubscribeShowInstalledOnly();
		unsubscribeSourcesChange();
	});

	onMount(() => {
		syncSnapshots();
		void refreshSources();
	});

	return (
		<div class="flex flex-col gap-3 pb-1">
			<Show
				when={visibleModules().length > 0}
				fallback={
					<div class="flex min-h-36 items-center justify-center rounded-md border border-[var(--background-modifier-border)] px-4 py-6 text-center text-[var(--text-muted)]">
						{getEmptyStateText({
							hasLoaded: hasLoaded(),
							isLoading: isLoading(),
							query: query(),
							showInstalledOnly: showInstalledOnly(),
							translate: t,
						})}
					</div>
				}
			>
				<div
					class="grid gap-3"
					style={{
						'grid-template-columns': 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))',
					}}
				>
					<For each={visibleModules()}>
						{(module) => (
							<Card
								ctx={props.ctx}
								installedVersion={installedVersions()[module.name]}
								isLoaded={loadedNames().has(module.name)}
								module={module}
								pendingAction={pendingByName()[module.name]}
								runAction={(action, op) => {
									void runAction(module.name, action, op);
								}}
							/>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
}

function getEmptyStateText(ctx: {
	hasLoaded: boolean;
	isLoading: boolean;
	query: string;
	showInstalledOnly: boolean;
	translate: ModuleManagementContext['translate'];
}) {
	if (ctx.isLoading && !ctx.hasLoaded) return ctx.translate('loadingModules');
	if (ctx.query.trim()) return ctx.translate('noMatchingModulesFound');
	if (ctx.showInstalledOnly) return ctx.translate('noInstalledModulesFound');
	return ctx.translate('noModulesAvailable');
}

function getModuleScore(match: (text: string) => SearchResult | null, module: ModuleMeta) {
	const nameScore = match(module.name)?.score ?? undefined;
	const descriptionScore = module.description
		? (match(module.description)?.score ?? undefined)
		: undefined;
	if (nameScore === undefined && descriptionScore === undefined) return;
	return (nameScore ?? 0) + (descriptionScore ?? 0);
}

function mergeModules(
	sourceModules: Array<ModuleMeta>,
	installedVersions: Record<string, string>,
): Array<DisplayModule> {
	const modules = new Map<string, DisplayModule>();
	for (const module of sourceModules) modules.set(module.name, { ...module, fromSource: true });
	for (const [name, version] of Object.entries(installedVersions)) {
		if (modules.has(name)) continue;
		modules.set(name, {
			description: '',
			fromSource: false,
			main: '',
			name,
			version,
		});
	}
	return [...modules.values()];
}

function sortModulesAlphabetically(a: ModuleMeta, b: ModuleMeta) {
	return a.name.localeCompare(b.name);
}
