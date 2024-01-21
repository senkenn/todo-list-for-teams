import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import {
	CommandOpenFile,
	TodoListProvider,
	TodoTreeItem,
	TypedWorkspaceState,
} from "../../todoListProvider";
import { activate } from "../../extension";
import { log } from "../../logger";
import * as child_process from "child_process";

const todoList = [
	{
		prefix: "TODO",
		fileAbsPath:
			"/home/senken/personal/vsce-base/todo-list-for-teams/src/test/test-workspace/test.ts",
		line: 1,
		character: 3,
		preview: "TODO: todo",
		isIgnored: false,
		commitHash: "6320a811",
		author: "senkenn",
	},
	{
		prefix: "HACK",
		fileAbsPath:
			"/home/senken/personal/vsce-base/todo-list-for-teams/src/test/test-workspace/test.ts",
		line: 2,
		character: 3,
		preview: "HACK: hack",
		isIgnored: false,
		commitHash: "6320a811",
		author: "senkenn",
	},
	{
		prefix: "FIXME",
		fileAbsPath:
			"/home/senken/personal/vsce-base/todo-list-for-teams/src/test/test-workspace/test.ts",
		line: 3,
		character: 3,
		preview: "FIXME: fixme",
		isIgnored: false,
		commitHash: "6320a811",
		author: "senkenn",
	},
	{
		prefix: "NOTE",
		fileAbsPath:
			"/home/senken/personal/vsce-base/todo-list-for-teams/src/test/test-workspace/test.ts",
		line: 4,
		character: 3,
		preview: "NOTE: note",
		isIgnored: false,
		commitHash: "6320a811",
		author: "senkenn",
	},
];

suite("Extension Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");

	test("Created todo list with committed files", async () => {
		const ext = vscode.extensions.getExtension("senken.todo-list-for-teams");
		const context = await ext?.activate();
		const workspaceState = new TypedWorkspaceState(context?.workspaceState);

		assert.deepEqual(workspaceState.get("todoList"), todoList);
	});

	test("Created todo list with uncommitted files", async () => {
		const wsEdit = new vscode.WorkspaceEdit();
		const wsPath = (
			vscode.workspace.workspaceFolders as unknown as vscode.WorkspaceFolder[]
		)[0].uri.fsPath; // gets the path of the first workspace folder
		console.log("####", wsPath);

		const filePath = `${wsPath}/test.md`;
		const testFileContent = "<!-- TODO: test todo -->";
		child_process
			.execSync(`touch ${filePath} && echo "${testFileContent}" > ${filePath}`)
			.toString();

		// open file and save
		const document = await vscode.workspace.openTextDocument(filePath);
		const editor = await vscode.window.showTextDocument(document);
		editor.edit((editBuilder) => {
			editBuilder.insert(new vscode.Position(0, 0), "Hello World!");
		});
		await vscode.workspace.applyEdit(wsEdit);

		// get todo list
		const ext = vscode.extensions.getExtension("senken.todo-list-for-teams");
		const context = (await ext?.activate()) as vscode.ExtensionContext;
		const workspaceState = new TypedWorkspaceState(context?.workspaceState);

		const todoListWithUncommitted = [
			...todoList,
			{
				character: 5,
				fileAbsPath:
					"/home/senken/personal/vsce-base/todo-list-for-teams/src/test/test-workspace/test.md",
				isIgnored: false,
				line: 1,
				prefix: "TODO",
				preview: "TODO: test todo -->",
			},
		];
		assert.deepEqual(workspaceState.get("todoList"), todoListWithUncommitted);

		// remove test file
		child_process.execSync(`rm -f ${filePath}`).toString();
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
