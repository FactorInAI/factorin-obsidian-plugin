export default function toErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
