import type { OptimizerInput, OptimizerOutput } from '@hesprs/sync-engine-sdk';
import { digOriginal } from '@hesprs/sync-engine-sdk';
import S3Fs, { BATCH_DELETE_MAX_KEYS } from './s3/fs';

/**
 * S3 batch delete optimizer.
 *
 * Replaces the default hierarchical optimizer for S3 backends.
 * Converts all delete atoms into batch DeleteObjects calls (up to 1000 keys per request).
 * Non-delete atoms pass through unchanged.
 *
 * Registered at priority 500 — before the hierarchical optimizer (now at priority 10000).
 * When S3 is not the active backend, this optimizer declines (returns undefined) and
 * the hierarchical optimizer handles dispatch.
 */
export default function s3BatchDeleteOptimizer({
	atoms,
	fs,
}: OptimizerInput): OptimizerOutput | undefined {
	const original = digOriginal(fs);
	if (!(original instanceof S3Fs)) return undefined;

	const s3Fs = original;
	type DeleteAtom = Extract<(typeof atoms)[number], { type: 'delete' }>;
	const deleteAtoms = atoms.filter((a): a is DeleteAtom => a.type === 'delete');
	const otherAtoms = atoms.filter((a) => a.type !== 'delete');

	if (deleteAtoms.length === 0) return atoms;

	const batchGroups: Array<Array<DeleteAtom>> = [];
	for (let i = 0; i < deleteAtoms.length; i += BATCH_DELETE_MAX_KEYS)
		batchGroups.push(deleteAtoms.slice(i, i + BATCH_DELETE_MAX_KEYS));

	const batchAtoms = batchGroups.map(
		(batch) =>
			({
				execute: async () => {
					const keys = batch.map((a) => a.key);
					await s3Fs.batchDelete(keys);
					batch.forEach((a) => a.resolve());
				},
				type: 'custom' as const,
			}) as const,
	);

	return [...otherAtoms, ...batchAtoms];
}
