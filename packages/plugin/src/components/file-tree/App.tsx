import type { JSX } from 'solid-js';
import { setIcon, setTooltip } from 'obsidian';
import { For } from 'solid-js';
import { getTaskColor, getTaskIcon } from '@/sync';
import type { FileTreeData } from './types';

export default function App(props: {
	data: FileTreeData;
	isSelected: (nodeId: string) => boolean;
	toggle: (nodeId: string, nextSelected: boolean) => void;
}): JSX.Element {
	return (
		<div class="flex flex-col gap-1">
			<For each={props.data.orderedNodeIds}>
				{(nodeId) => {
					const node = props.data.nodes[nodeId];
					const task = node.task;
					const icon = task
						? {
								color: getTaskColor(task.name),
								icon: getTaskIcon(task.name),
							}
						: { color: 'var(--text-normal)', icon: 'folder-open' };
					const isSelected = () => (task ? props.isSelected(nodeId) : false);
					return (
						<div
							class="flex min-h-7 items-center"
							style={{ 'padding-left': `${node.depth * 14}px` }}
						>
							<div
								class="flex min-w-0 items-center gap-2"
								onClick={() => task && props.toggle(nodeId, !isSelected())}
							>
								{task ? (
									<input
										checked={isSelected()}
										class="m-0 accent-[var(--interactive-accent)] cursor-pointer"
										type="checkbox"
									/>
								) : (
									<div class="m-1 h-2 w-2 flex-shrink-0 rounded-full bg-[var(--text-muted)]" />
								)}
								<div
									class="sync-engine-task__icon"
									ref={(element) => {
										setIcon(element, icon.icon);
										element.style.color = icon.color;
										if (!task) return;
										setTooltip(element, task.prettyName, { delay: 100 });
									}}
								/>
								<div
									class={
										task && !isSelected()
											? 'min-w-0 break-words text-[var(--text-muted)]'
											: 'min-w-0 break-words text-[var(--text-normal)]'
									}
								>
									{node.compressedLabel}
								</div>
							</div>
						</div>
					);
				}}
			</For>
		</div>
	);
}
