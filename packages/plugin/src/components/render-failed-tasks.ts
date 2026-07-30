import { setIcon, setTooltip } from 'obsidian';
import type { FailedTaskInfo } from '@/modules/Sync';
import { getTaskIcon } from '@/sync';

function renderFailedTaskRow(
	itemEl: HTMLDivElement,
	{ name, key, error, prettyName, isDir }: FailedTaskInfo,
) {
	const row = itemEl.createDiv();
	const main = row.createDiv('break-words flex items-center gap-2');
	const icon = main.createSpan('w-4 h-4 color-[--color-red]');
	setIcon(icon, getTaskIcon(name, isDir));
	setTooltip(icon, prettyName);

	main.createSpan({ cls: 'text-[--text-muted] whitespace-nowrap', text: prettyName });
	main.createSpan({ cls: 'font-semibold truncate', text: key });
	row.createDiv({ cls: 'text-[--text-muted] break-words mt-1', text: error });
}

export default function renderFailedTasks(
	detailContainer: HTMLDivElement,
	failedTasks: Array<FailedTaskInfo>,
): void {
	detailContainer.empty();
	const tasksContainer = detailContainer.createDiv('w-100% flex flex-col gap-3 p-1.5');
	detailContainer.removeClass('hidden');
	failedTasks.forEach((task) => renderFailedTaskRow(tasksContainer, task));
}
