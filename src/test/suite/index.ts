import { runCLI } from "jest";

import * as path from "path";
import type { Config } from "@jest/types";

export async function run(
	testsRoot: string,
	reportTestResults: (error?: Error, failures?: number) => void,
): Promise<void> {
	const projectRootPath = path.resolve(__dirname, "../../../");
	const config = path.join(projectRootPath, "jest.config.js");

	console.info(`Running Jest tests from ${projectRootPath}...`);

	const test = await runCLI({ config } as Config.Argv, [projectRootPath]);
	if (test.results.numFailedTestSuites > 0) {
		process.exit(1);
	}
}
