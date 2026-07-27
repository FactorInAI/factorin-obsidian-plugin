export default async function sha256(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const lookup = new Uint8Array(256);
	const hex = '0123456789abcdef';
	for (let i = 0; i < 256; i++)
		lookup[i] = (hex.charCodeAt(i >> 4) << 8) | hex.charCodeAt(i & 0x0f);
	const view = new DataView(hashBuffer);
	const result = new Uint16Array(32);
	for (let i = 0; i < 32; i++) result[i] = lookup[view.getUint8(i)];
	return String.fromCharCode(...result);
}
