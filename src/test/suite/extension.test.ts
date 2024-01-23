import * as assert from "assert";

import * as child_process from "child_process";
// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import { log } from "../../logger";
import { TodoList, TypedWorkspaceState } from "../../todoListProvider";
import { beforeEach } from "node:test";

let fileCount = 0;
function createMdFileName() {
	return `test${fileCount++}.md`;
}
function createMdFileNameWithSpace() {
	return `test ${fileCount++}.md`;
}

function gitSetupAndCreateExpectedTodoList(): TodoList {
	const wsPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
	if (!wsPath) {
		throw new Error("wsPath is undefined");
	}

	// remove .git
	child_process.execSync(`rm -rf ${wsPath}/.git`);

	// git init and commit
	child_process.execSync(
		`cd ${wsPath} && git config --global user.name senkenn && git config --global user.email "you@example.com"`,
	);
	child_process.execSync(
		`cd ${wsPath} && git init && git add . && git commit -m "init"`,
	);
	const commitHash = child_process
		.execSync(`cd ${wsPath} && git rev-parse --short=8 HEAD`)
		.toString()
		.trim();

	const todoList: TodoList = [
		{
			prefix: "TODO",
			fileAbsPath: `${wsPath}/test.ts`,
			line: 1,
			character: 3,
			preview: "TODO: todo",
			isIgnored: false,
			commitHash,
			author: "senkenn",
		},
		{
			prefix: "HACK",
			fileAbsPath: `${wsPath}/test.ts`,
			line: 2,
			character: 3,
			preview: "HACK: hack",
			isIgnored: false,
			commitHash,
			author: "senkenn",
		},
		{
			prefix: "FIXME",
			fileAbsPath: `${wsPath}/test.ts`,
			line: 3,
			character: 3,
			preview: "FIXME: fixme",
			isIgnored: false,
			commitHash,
			author: "senkenn",
		},
		{
			prefix: "NOTE",
			fileAbsPath: `${wsPath}/test.ts`,
			line: 4,
			character: 3,
			preview: "NOTE: note",
			isIgnored: false,
			commitHash,
			author: "senkenn",
		},
	];

	return todoList;
}

suite("Extension Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");

	beforeEach(() => {
		child_process.execSync(
			`rm -rf ${vscode.workspace.workspaceFolders?.[0].uri.fsPath}/.git`,
		);
	});

	test("Should be create todo list with committed files", async () => {
		child_process.execSync(
			`rm -rf ${vscode.workspace.workspaceFolders?.[0].uri.fsPath}/.git`,
		);
		const expectedTodoList = gitSetupAndCreateExpectedTodoList();

		const ext = vscode.extensions.getExtension<vscode.ExtensionContext>(
			"senken.todo-list-for-teams",
		);
		const context = await ext?.activate();
		if (!context) {
			throw new Error("context is undefined");
		}
		const workspaceState = new TypedWorkspaceState(context.workspaceState);

		assert.deepEqual(workspaceState.get("todoList"), expectedTodoList);
	});

	test("Created todo list with uncommitted files", async () => {
		const expectedTodoList = gitSetupAndCreateExpectedTodoList();

		// create file
		const wsPath = (
			vscode.workspace.workspaceFolders as unknown as vscode.WorkspaceFolder[]
		)[0].uri.fsPath; // gets the path of the first workspace folder
		const fileAbsPath = `${wsPath}/${createMdFileName()}`;
		child_process.execSync(`touch ${fileAbsPath}`);

		// open file and save
		const document = await vscode.workspace.openTextDocument(fileAbsPath);
		const editor = await vscode.window.showTextDocument(document);
		await editor.edit((editBuilder) => {
			editBuilder.insert(new vscode.Position(0, 0), "<!-- TODO: test todo -->");
		});
		await document.save();

		// get todo list
		const ext = vscode.extensions.getExtension("senken.todo-list-for-teams");
		const context = (await ext?.activate()) as vscode.ExtensionContext;
		const workspaceState = new TypedWorkspaceState(context?.workspaceState);

		const todoListWithUncommitted = [
			...expectedTodoList,
			{
				character: 5,
				fileAbsPath,
				isIgnored: false,
				line: 1,
				prefix: "TODO",
				preview: "TODO: test todo -->",
			},
		];

		// remove test file
		child_process.execSync(`rm ${fileAbsPath}`).toString();

		// check todo list
		assert.deepEqual(workspaceState.get("todoList"), todoListWithUncommitted);
	});

	test("Created todo list with uncommitted files and space in file name", async () => {
		const expectedTodoList = gitSetupAndCreateExpectedTodoList();

		// create file
		const wsPath = (
			vscode.workspace.workspaceFolders as unknown as vscode.WorkspaceFolder[]
		)[0].uri.fsPath; // gets the path of the first workspace folder
		const fileAbsPath = `${wsPath}/${createMdFileNameWithSpace()}`;
		child_process.execSync(`touch "${fileAbsPath}"`);

		// open file and save
		const document = await vscode.workspace.openTextDocument(fileAbsPath);
		const editor = await vscode.window.showTextDocument(document);
		await editor.edit((editBuilder) => {
			editBuilder.insert(new vscode.Position(0, 0), "<!-- TODO: test todo -->");
		});
		await document.save();

		// get todo list
		const ext = vscode.extensions.getExtension("senken.todo-list-for-teams");
		const context = (await ext?.activate()) as vscode.ExtensionContext;
		const workspaceState = new TypedWorkspaceState(context?.workspaceState);

		const todoListWithUncommitted = [
			...expectedTodoList,
			{
				character: 5,
				fileAbsPath,
				isIgnored: false,
				line: 1,
				prefix: "TODO",
				preview: "TODO: test todo -->",
			},
		];

		// remove test file
		child_process.execSync(`rm -f "${fileAbsPath}"`).toString();

		// check todo list
		assert.deepEqual(workspaceState.get("todoList"), todoListWithUncommitted);
	});

	test("Created todo list with uncommitted files and multiple files", async () => {
		const expectedTodoList = gitSetupAndCreateExpectedTodoList();

		// create file
		const wsPath = (
			vscode.workspace.workspaceFolders as unknown as vscode.WorkspaceFolder[]
		)[0].uri.fsPath; // gets the path of the first workspace folder
		const fileAbsPath = `${wsPath}/${createMdFileName()}`;
		const fileAbsPath2 = `${wsPath}/${createMdFileNameWithSpace()}`;
		child_process.execSync(`touch "${fileAbsPath}" "${fileAbsPath2}"`);

		// open file and save
		const document = await vscode.workspace.openTextDocument(fileAbsPath);
		const editor = await vscode.window.showTextDocument(document);
		await editor.edit((editBuilder) => {
			editBuilder.insert(new vscode.Position(0, 0), "<!-- TODO: test todo -->");
		});
		await document.save();

		// close file
		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

		const document2 = await vscode.workspace.openTextDocument(fileAbsPath2);
		const editor2 = await vscode.window.showTextDocument(document2);
		await editor2.edit((editBuilder) => {
			editBuilder.insert(
				new vscode.Position(0, 0),
				" <!-- HACK: test hack -->",
			);
		});
		await document2.save();

		// get todo list
		const ext = vscode.extensions.getExtension("senken.todo-list-for-teams");
		const context = (await ext?.activate()) as vscode.ExtensionContext;
		const workspaceState = new TypedWorkspaceState(context?.workspaceState);

		const todoListWithUncommitted = [
			...expectedTodoList,
			{
				character: 6,
				fileAbsPath: fileAbsPath2,
				isIgnored: false,
				line: 1,
				prefix: "HACK",
				preview: "HACK: test hack -->",
			},
			{
				character: 5,
				fileAbsPath,
				isIgnored: false,
				line: 1,
				prefix: "TODO",
				preview: "TODO: test todo -->",
			},
		];

		// remove test file
		child_process.execSync(`rm -f "${fileAbsPath}"`).toString();
		child_process.execSync(`rm -f "${fileAbsPath2}"`).toString();

		// check todo list
		assert.deepEqual(workspaceState.get("todoList"), todoListWithUncommitted);
	});

	// test("Refresh command", () => {
	// 	const todoListProvider = new TodoListProvider();

	// 	// Mock the refresh method
	// 	sinon.stub(todoListProvider, "refresh");

	// 	vscode.commands.executeCommand("todo-list-for-teams.refresh");

	// 	// Check if the refresh method has been called
	// 	assert.ok(todoListProvider.refresh.calledOnce);
	// });

	// test("Reset command", () => {
	// 	const todoListProvider = new TodoListProvider();

	// 	// Mock the generateTodoList and refresh methods
	// 	sinon.stub(todoListProvider, "generateTodoList");
	// 	sinon.stub(todoListProvider, "refresh");

	// 	vscode.commands.executeCommand("todo-list-for-teams.reset");

	// 	// Check if the generateTodoList and refresh methods have been called
	// 	assert.ok(todoListProvider.generateTodoList.calledOnce);
	// 	assert.ok(todoListProvider.refresh.calledOnce);
	// });

	// test("OpenFile command", () => {
	// 	const commandOpenFile: CommandOpenFile = {
	// 		// Mock the CommandOpenFile
	// 	};

	// 	vscode.commands.executeCommand(
	// 		"todo-list-for-teams.openFile",
	// 		commandOpenFile,
	// 	);

	// 	// Check if the showTextDocument method has been called
	// 	assert.ok(vscode.window.showTextDocument.calledOnce);
	// });

	// test("AddToIgnoreList command", () => {
	// 	const todoItem: TodoTreeItem = {
	// 		// Mock the TodoTreeItem
	// 	};

	// 	vscode.commands.executeCommand(
	// 		"todo-list-for-teams.addToIgnoreList",
	// 		todoItem,
	// 	);

	// 	// Check if the refresh method has been called
	// 	assert.ok(todoListProvider.refresh.calledOnce);
	// });

	// test("RestoreItem command", () => {
	// 	const todoItem: TodoTreeItem = {
	// 		// Mock the TodoTreeItem
	// 	};

	// 	vscode.commands.executeCommand("todo-list-for-teams.restoreItem", todoItem);

	// 	// Check if the refresh method has been called
	// 	assert.ok(todoListProvider.refresh.calledOnce);
	// });
});
