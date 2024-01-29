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

	await runCLI({ config } as Config.Argv, [projectRootPath])
		.then((jestCliCallResult) => {
			// biome-ignore lint/complexity/noForEach: <explanation>
			jestCliCallResult.results.testResults.forEach((testResult) => {
				// biome-ignore lint/complexity/noForEach: <explanation>
				testResult.testResults
					.filter((assertionResult) => assertionResult.status === "passed")
					.forEach(({ ancestorTitles, title, status }) => {
						console.info(`  ● ${ancestorTitles} > ${title} (${status})`);
					});
			});

			// biome-ignore lint/complexity/noForEach: <explanation>
			jestCliCallResult.results.testResults.forEach((testResult) => {
				if (testResult.failureMessage) {
					console.error(testResult.failureMessage);
				}
			});

			reportTestResults(undefined, jestCliCallResult.results.numFailedTests);
		})
		.catch((errorCaughtByJestRunner) => {
			reportTestResults(errorCaughtByJestRunner, 0);
		});
}
