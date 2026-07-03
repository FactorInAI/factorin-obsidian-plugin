import type { Ref } from 'synthkernel';

export function sleep(ms: number) {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function untilTrue(ref: Ref<boolean>, reserve = false) {
	if (ref()) return;
	return new Promise<void>((resolve) => {
		const unsub = ref.subscribe((isTrue) => {
			if (isTrue) {
				if (reserve) (ref as unknown as { value: boolean }).value = false;
				unsub();
				resolve();
			}
		});
	});
}
