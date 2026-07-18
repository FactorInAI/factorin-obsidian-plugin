import testKit from '$/test-kit';
import { expect, test } from 'bun:test';
import { customHeadersMiddleware } from '@/fs';

const { bytes, request } = testKit;

const response = {
	bytes: () => bytes('ok'),
	headers: {},
	json: () => {},
	status: 200,
	text: () => 'ok',
};

test('custom headers middleware normalizes string input to request params', async () => {
	const harness = request(async () => response);
	const wrapped = customHeadersMiddleware(harness.request, { 'x-added': 'value' });

	expect(wrapped('note.md')).resolves.toStrictEqual(response);
	expect(harness.calls).toStrictEqual([{ headers: { 'x-added': 'value' }, url: 'note.md' }]);
});

test('custom headers middleware merges supplied headers and overrides duplicates', async () => {
	const harness = request(async () => response);
	const wrapped = customHeadersMiddleware(harness.request, {
		'x-added': 'value',
		'x-override': 'new',
	});

	expect(
		wrapped({
			headers: {
				'x-keep': 'keep',
				'x-override': 'old',
			},
			url: 'note.md',
		}),
	).resolves.toStrictEqual(response);
	expect(harness.calls).toStrictEqual([
		{
			headers: {
				'x-added': 'value',
				'x-keep': 'keep',
				'x-override': 'new',
			},
			url: 'note.md',
		},
	]);
});
