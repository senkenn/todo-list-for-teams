import * as path from "path";
import Mocha from "mocha";
import { glob } from "glob";

export async function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: "tdd",
		color: true,
	});

	const testsRoot = path.resolve(__dirname, "..");
	const files = await glob("**/**.test.js", { cwd: testsRoot });

	// Add files to the test suite
	for (const file of files) {
		mocha.addFile(path.resolve(testsRoot, file));
	}

	try {
		return new Promise<void>((c, e) => {
			// Run the mocha test
			mocha.run((failures) => {
				if (failures > 0) {
					e(new Error(`${failures} tests faild.`));
				} else {
					c();
				}
			});
		});
	} catch (err) {
		console.error(err);
	}
}
