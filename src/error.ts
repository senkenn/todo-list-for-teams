export class ShouldHaveBeenIncludedSearchWordError extends Error {
	constructor(message: string) {
		super(`ShouldHaveBeenIncludedSearchWordError: ${message}`);
	}
}
