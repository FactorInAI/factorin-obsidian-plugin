import type { OptionsWithLocalFileStat } from '../decision/interface';
import { BaseTask } from './interface';

export default class Upload extends BaseTask<OptionsWithLocalFileStat> {
	async exec() {
		let localContent: ArrayBuffer;
		try {
			localContent = await this.localFs.read(this.key);
		} catch {
			// Ignore if local not found (which indicates that it has been deleted or renamed, common in case of a fast local change)
			return;
		}
		const remoteUid = await this.remoteFs.write(this.key, localContent);

		await this.record.set(this.key, {
			isDir: false,
			local: this.local.uid,
			remote: remoteUid,
		});
	}
}
