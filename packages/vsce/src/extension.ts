import * as child_process from "child_process";
import * as vscode from "vscode";

const log = <T>(value: T) => console.log(JSON.stringify(value, null, 2));

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand(
		"todo-list-for-teams.helloWorld", // TODO: コマンド
		async () => {
			const repoAbsPath = "~/personal/vsce-base/todo-list-for-teams";
			const searchWord = /TODO:\|HACK:/;
			const gitGrepWorkingTree = `git -c grep.lineNumber=true grep -E ${searchWord.source}`;
			const cmd1 = `cd ${repoAbsPath} && ${gitGrepWorkingTree}`;
			const gitGrepBranches = `git -c grep.lineNumber=true grep -E ${searchWord.source} $(git branch --format='%(objectname) %(refname:short)' | sort | uniq -w 40 | cut -c 42-)`;
			const output1 = child_process.execSync(cmd1).toString();
			const cmd = `cd ${repoAbsPath} && ${gitGrepBranches}`;
			const output = child_process.execSync(cmd).toString();
			const todoList = [
				...getInfoOutput(repoAbsPath, output1, true),
				...getInfoOutput(repoAbsPath, output),
			];
			log(todoList);
		},
	);

	context.subscriptions.push(disposable);
}

function getInfoOutput(
	repoAbsPath: string,
	output: string,
	isWorkingTree?: boolean,
): {
	prefix: string;
	branch: string;
	sourcePath: string;
	line: number;
	preview: string;
	commitHash?: string;
	author?: string;
}[] {
	// TODO: HACK: refactor
	// cut last "\n" and split by "\n"
	const outputArray = output.slice(0, -1).split("\n");

	const searchWord = /TODO:|HACK:/;
	const result = outputArray.map((output) => {
		if (isWorkingTree) {
			const firstIndex = output.indexOf(":");
			const secondIndex = output.indexOf(":", firstIndex + 1);
			const fullLine = output.slice(secondIndex + 1);
			const matchedWord = fullLine.match(searchWord);
			if (!matchedWord) {
				throw new Error("Contain searchWord in output, but not match");
			}
			return {
				prefix: matchedWord[0].slice(0, -1),
				branch: "working-tree",
				sourcePath: output.slice(0, firstIndex),
				line: Number(output.slice(firstIndex + 1, secondIndex)),
				// get string after searchWord
				preview: fullLine.slice(fullLine.match(searchWord)?.index) ?? "",
			};
		}

		// tracked file
		const firstIndex = output.indexOf(":");
		const secondIndex = output.indexOf(":", firstIndex + 1);
		const thirdIndex = output.indexOf(":", secondIndex + 1);
		const fullLine = output.slice(thirdIndex + 1);
		const matchedWord = fullLine.match(searchWord);
		if (!matchedWord) {
			throw new Error("Contain searchWord in output, but not match");
		}
		const prefix = matchedWord[0].slice(0, -1);
		const branch = output.slice(0, firstIndex);
		const sourcePath = output.slice(firstIndex + 1, secondIndex);
		const line = Number(output.slice(secondIndex + 1, thirdIndex));
		const preview = fullLine.slice(matchedWord.index);

		const cmd = `cd ${repoAbsPath} && git blame ${branch} -L ${line},${line} ${sourcePath}`;
		const blameOutput = child_process.execSync(cmd).toString();
		// get commit hash, author
		console.log(blameOutput);
		const commitHash = blameOutput.slice(0, 8);
		const author = blameOutput.split(" ")[1].slice(1);

		// const commitHash = blameOutput.slice(0, 40);
		return { prefix, branch, sourcePath, line, preview, commitHash, author };
	});
	return result;
}

export function deactivate() {}
