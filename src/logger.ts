export const log = function <T>(this: { [key: string]: T }) {
	const keys = Object.keys(this);
	for (const key of keys) {
		const value = this[key];
		console.log(`${key}: ${JSON.stringify(value, null, 2)}`);
	}
};
