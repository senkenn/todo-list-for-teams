import { runCLI } from "jest";

import * as path from "path";
import type { Config } from "@jest/types";

export async function run(
	testsRoot: string,
	clb: (error?: Error, failures?: number) => void,
): Promise<void> {
	// const projectRootPath = process.cwd();
	const projectRootPath = path.resolve(__dirname, "../../../");
	const config = path.join(projectRootPath, "jest.config.js");

	console.info(`Running Jest tests from ${projectRootPath}...`);

	await runCLI({ config } as Config.Argv, [projectRootPath]);
}
