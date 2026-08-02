import { createStore } from 'solid-js/store';
import { render } from 'solid-js/web';
import type { BaseTask } from '@/sync';
import App from './App';
import createFileTreeSelection from './selection';
import createFileTreeData from './tree-data';

export type FileTreeTranslations = { selectAll: string };

export default function mount(el: Element, tasks: Array<BaseTask>, selectAll: string) {
	const data = createFileTreeData(tasks);
	const selection = createFileTreeSelection(data);
	const initialSelectedById = Object.fromEntries(
		data.taskNodeIds.map((taskNodeId) => [taskNodeId, true]),
	);

	const unmount = render(() => {
		const [selectedById, setSelectedById] =
			createStore<Record<string, boolean>>(initialSelectedById);

		return (
			<App
				data={data}
				isSelected={(nodeId) => selectedById[nodeId] ?? false}
				selectAll={selectAll}
				toggle={(nodeId, nextSelected) => {
					for (const changedNodeId of selection.toggle(nodeId, nextSelected))
						setSelectedById(changedNodeId, selection.isSelected(changedNodeId));
				}}
			/>
		);
	}, el);

	return {
		getState: selection.getState,
		unmount,
	};
}
