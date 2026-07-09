import type { OptionsWithRemoteFileStat } from '../decision/interface';
import { BaseTask } from './interface';

export default class Download extends BaseTask<OptionsWithRemoteFileStat> {
	async exec() {
		let remoteContent: ArrayBuffer | undefined;
		let localUid: string;

		// 2 MiB
		if (this.remote.size >= 2 ** 21) {
			const stream = await this.remoteFs.readStream(this.key);
			localUid = await this.localFs.writeStream(this.key, stream);
		} else {
			remoteContent = await this.remoteFs.read(this.key);
			localUid = await this.localFs.write(this.key, remoteContent);
		}

		await this.record.set(this.key, {
			isDir: false,
			local: localUid,
			remote: this.remote.uid,
		});
	}
}
