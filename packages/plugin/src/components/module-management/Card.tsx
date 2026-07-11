import { setIcon, setTooltip } from 'obsidian';
import { Show, createEffect } from 'solid-js';
import type { ModuleMeta } from '@/modules/Extensibility';
import compareVersions from '@/utils/compare-versions';
import type { ModuleManagementContext, PendingAction } from './index';

export default function Card(props: {
	ctx: Pick<
		ModuleManagementContext,
		| 'deleteModule'
		| 'downloadModule'
		| 'loadModule'
		| 'saveSettings'
		| 'settings'
		| 'translate'
		| 'unloadModule'
	>;
	installedVersion?: string;
	isLoaded: boolean;
	module: ModuleMeta;
	pendingAction?: PendingAction;
	runAction: (action: PendingAction, op: () => Promise<void>) => void;
}) {
	const isInstalled = () => props.installedVersion !== undefined;
	const hasUpdate = () =>
		props.installedVersion !== undefined &&
		compareVersions(props.module.version, props.installedVersion) === 1;
	const busy = () => props.pendingAction !== undefined;
	const versionLabel = () => {
		const currentVersion = props.installedVersion;
		if (
			currentVersion !== undefined &&
			compareVersions(props.module.version, currentVersion) === 1
		)
			return `v${currentVersion} -> v${props.module.version}`;
		return `v${currentVersion ?? props.module.version}`;
	};

	return (
		<div class="flex min-h-40 flex-col gap-3 rounded-md border border-[--background-modifier-border] px-4 py-3 bg-[--background-primary-alt]">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0 text-base font-semibold text-[--text-normal] break-words">
					{props.module.name}
				</div>
				<div class="flex-shrink-0 text-xs text-[--text-muted]">{versionLabel()}</div>
			</div>

			<div class="flex flex-1 flex-col gap-2">
				<div class="flex flex-wrap gap-2 text-xs text-[--text-muted]">
					<span>
						{isInstalled()
							? props.ctx.translate('installed')
							: props.ctx.translate('notInstalled')}
					</span>
					<Show when={isInstalled()}>
						<span>
							{props.isLoaded
								? props.ctx.translate('enabled')
								: props.ctx.translate('disabled')}
						</span>
					</Show>
					<Show when={hasUpdate()}>
						<span>{props.ctx.translate('updateAvailable')}</span>
					</Show>
				</div>
				<div class="flex-1 text-sm text-[--text-muted] break-words">
					{props.module.description}
				</div>
			</div>

			<div class="flex items-center justify-end gap-2">
				<Show when={props.module.main && (!isInstalled() || hasUpdate())}>
					<ActionButton
						disabled={busy()}
						icon="download"
						pending={props.pendingAction === 'download'}
						tooltip={
							hasUpdate()
								? props.ctx.translate('updateModule')
								: props.ctx.translate('downloadModule')
						}
						onClick={() => {
							props.runAction('download', async () => {
								await props.ctx.downloadModule(
									props.module.name,
									props.module.version,
									props.module.main,
								);
							});
						}}
					/>
				</Show>
				<Show when={isInstalled()}>
					<ActionButton
						disabled={busy()}
						icon="trash-2"
						pending={props.pendingAction === 'delete'}
						tooltip={props.ctx.translate('deleteModule')}
						onClick={() => {
							props.runAction('delete', async () => {
								await props.ctx.deleteModule(props.module.name);
								void props.ctx.saveSettings();
							});
						}}
					/>
					<Show
						when={props.isLoaded}
						fallback={
							<ActionButton
								disabled={busy()}
								icon="play"
								pending={props.pendingAction === 'enable'}
								tooltip={props.ctx.translate('enableModule')}
								onClick={() => {
									props.runAction('enable', async () => {
										props.ctx.settings.modules[props.module.name] = true;
										void props.ctx.saveSettings();
										await props.ctx.loadModule(props.module.name, true);
									});
								}}
							/>
						}
					>
						<ActionButton
							disabled={busy()}
							icon="power-off"
							pending={props.pendingAction === 'disable'}
							tooltip={props.ctx.translate('disableModule')}
							onClick={() => {
								props.runAction('disable', async () => {
									props.ctx.settings.modules[props.module.name] = false;
									void props.ctx.saveSettings();
									props.ctx.unloadModule(props.module.name);
								});
							}}
						/>
					</Show>
				</Show>
			</div>
		</div>
	);
}

function ActionButton(props: {
	disabled: boolean;
	icon: string;
	onClick: () => void;
	pending: boolean;
	tooltip: string;
}) {
	// oxlint-disable-next-line no-unassigned-vars
	let button!: HTMLButtonElement;

	createEffect(() => {
		setIcon(button, props.pending ? 'loader-circle' : props.icon);
		button.ariaLabel = props.tooltip;
		setTooltip(button, props.tooltip);
		const iconSvg = button.firstElementChild;
		if (iconSvg) iconSvg.classList.toggle('animate-spin', props.pending);
	});

	return (
		<button
			class="clickable-icon rounded-md p-1"
			disabled={props.disabled}
			onClick={() => props.onClick()}
			ref={button}
			style={{ opacity: props.disabled ? '0.45' : '1' }}
			type="button"
		/>
	);
}
