import { execSync } from "child_process";
import * as vscode from "vscode";
import { TodoList } from "../todoListProvider";

export function gitSetupAndCreateTodoList(wsPath: string): TodoList {
	// git config
	execSync(`cd ${wsPath} && git init`);
	const author = execSync(`cd ${wsPath} && git config user.name`)
		.toString()
		.trim();

	// git init and commit test.md
	const commitFileContent = `<!-- TODO: todo -->
<!-- HACK: hack -->
<!-- FIXME: fixme -->
<!-- NOTE: note -->`;
	const commitFileName = "test.md";
	execSync(
		`cd ${wsPath} && \
			 touch ${commitFileName} && \
			 echo "${commitFileContent}" > ${commitFileName} && \
			 git add . && \
			 git commit -m "init"`,
	).toString();
	const commitHash = execSync(`cd ${wsPath} && git rev-parse --short=8 HEAD`)
		.toString()
		.trim();

	// create expected todo list
	const todoList: TodoList = [
		{
			prefix: "TODO",
			fileAbsPath: `${wsPath}/test.md`,
			line: 1,
			character: 5,
			preview: "TODO: todo -->",
			isIgnored: false,
			commitHash,
			author,
		},
		{
			prefix: "HACK",
			fileAbsPath: `${wsPath}/test.md`,
			line: 2,
			character: 5,
			preview: "HACK: hack -->",
			isIgnored: false,
			commitHash,
			author,
		},
		{
			prefix: "FIXME",
			fileAbsPath: `${wsPath}/test.md`,
			line: 3,
			character: 5,
			preview: "FIXME: fixme -->",
			isIgnored: false,
			commitHash,
			author,
		},
		{
			prefix: "NOTE",
			fileAbsPath: `${wsPath}/test.md`,
			line: 4,
			character: 5,
			preview: "NOTE: note -->",
			isIgnored: false,
			commitHash,
			author,
		},
	];

	return todoList;
}

export async function getExtContext(): Promise<vscode.ExtensionContext> {
	const ext = vscode.extensions.getExtension<vscode.ExtensionContext>(
		"senken.todo-list-for-teams",
	);
	const context = await ext?.activate();
	if (!context) {
		throw new Error("context is undefined");
	}

	return context;
}

let fileCount = 0;
export function createMdFileName() {
	return `test${fileCount++}.md`;
}
export function createMdFileNameWithSpace() {
	return `test ${fileCount++}.md`;
}
