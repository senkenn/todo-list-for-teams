import { execSync } from "child_process";
import { appendFileSync } from "fs";
import * as vscode from "vscode";
import { log } from "../../logger";
import {
	TodoListProvider,
	TodoTreeItem,
	TypedWorkspaceState,
} from "../../todoListProvider";

afterEach(async () => {
	// reset workspace files
	execSync(`rm -rf ${wsPath}/.git ${wsPath}/test*.md`);

	// reset workspace state
	const ext = vscode.extensions.getExtension<vscode.ExtensionContext>(
		"senken.todo-list-for-teams",
	);
	const context = await ext?.activate();
	if (!context) {
		throw new Error("context is undefined");
	}
	const workspaceState = new TypedWorkspaceState(context.workspaceState);
	workspaceState.update("todoList", []);
});

describe("Git tests", () => {
	test("Should be create todo list with no file", async () => {
		// git config
		execSync(`cd ${wsPath} && git init`);
		const author = execSync(`cd ${wsPath} && git config user.name`)
			.toString()
			.trim();

		// To update data, needs to operate any file on VSCode at least once.
		await vscode.commands.executeCommand("todo-list-for-teams.refresh");

		const receivedTodoItems = await getTodoItems();
		expect(receivedTodoItems).toEqual(INITIAL_TODO_ITEMS);
	});

	test("Should be create todo list with committed files and no todo comments", async () => {
		// git config
		execSync(`cd ${wsPath} && git init`);
		const author = execSync(`cd ${wsPath} && git config user.name`)
			.toString()
			.trim();

		// git init and commit test.md
		const commitFileContent = "";
		const commitFileName = "test.md";
		execSync(
			`cd ${wsPath} && \
				 touch ${commitFileName} && \
				 echo "${commitFileContent}" > ${commitFileName} && \
				 git add . && \
				 git commit -m "init"`,
		).toString();

		// To update data, needs to operate any file on VSCode at least once.
		await vscode.commands.executeCommand("todo-list-for-teams.refresh");

		const receivedTodoItems = await getTodoItems();
		expect(receivedTodoItems).toEqual(INITIAL_TODO_ITEMS);
	});

	test("Should be create todo list with committed files", async () => {
		const todoItems = gitSetupAndCreateTodoItems(wsPath);

		// To update data, needs to operate any file on VSCode at least once.
		await vscode.commands.executeCommand("todo-list-for-teams.refresh");

		const receivedTodoItems = await getTodoItems();
		expect(receivedTodoItems).toEqual(todoItems);
	});

	test("Created todo list with uncommitted files", async () => {
		const todoItems = gitSetupAndCreateTodoItems(wsPath);

		// create file
		const fileAbsPath = `${wsPath}/${createMdFileName()}`;
		execSync(`touch ${fileAbsPath}`);

		// open file and save
		const document = await vscode.workspace.openTextDocument(fileAbsPath);
		const editor = await vscode.window.showTextDocument(document);
		await editor.edit((editBuilder) => {
			editBuilder.insert(new vscode.Position(0, 0), "<!-- TODO: test todo -->");
		});
		await document.save();

		const receivedTodoItems = await getTodoItems();
		expect(receivedTodoItems).toEqual([
			[
				...todoItems[0],
				new TodoTreeItem(
					"TODO: test todo -->",
					vscode.TreeItemCollapsibleState.None,
					{
						prefix: "TODO",
						fileAbsPath,
						currentLine: 1,
						character: 5,
						preview: "TODO: test todo -->",
						isIgnored: false,
						author: "Not Committed Yet",
					},
				),
			],
			...todoItems.slice(1),
		]);
	});

	test("Created todo list with uncommitted files and space in file name", async () => {
		const todoItems = gitSetupAndCreateTodoItems(wsPath);

		const fileAbsPath = `${wsPath}/${createMdFileNameWithSpace()}`;
		execSync(`touch "${fileAbsPath}"`);

		// open file and save
		const document = await vscode.workspace.openTextDocument(fileAbsPath);
		const editor = await vscode.window.showTextDocument(document);
		await editor.edit((editBuilder) => {
			editBuilder.insert(new vscode.Position(0, 0), "<!-- TODO: test todo -->");
		});
		await document.save();

		const receivedTodoItems = await getTodoItems();
		expect(receivedTodoItems).toEqual([
			[
				...todoItems[0],
				new TodoTreeItem(
					"TODO: test todo -->",
					vscode.TreeItemCollapsibleState.None,
					{
						prefix: "TODO",
						fileAbsPath,
						currentLine: 1,
						character: 5,
						preview: "TODO: test todo -->",
						isIgnored: false,
						author: "Not Committed Yet",
					},
				),
			],
			...todoItems.slice(1),
		]);
	});

	test("Created todo list with uncommitted files and multiple files", async () => {
		const todoItems = gitSetupAndCreateTodoItems(wsPath);

		const fileAbsPath = `${wsPath}/${createMdFileName()}`;
		const fileAbsPath2 = `${wsPath}/${createMdFileNameWithSpace()}`;
		execSync(`touch "${fileAbsPath}" "${fileAbsPath2}"`);

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

		const receivedTodoItems = await getTodoItems();
		expect(receivedTodoItems).toEqual([
			[
				...todoItems[0],
				new TodoTreeItem(
					"TODO: test todo -->",
					vscode.TreeItemCollapsibleState.None,
					{
						prefix: "TODO",
						fileAbsPath,
						currentLine: 1,
						character: 5,
						preview: "TODO: test todo -->",
						isIgnored: false,
						author: "Not Committed Yet",
					},
				),
			],
			todoItems[1],
			[
				...todoItems[2],
				new TodoTreeItem(
					"HACK: test hack -->",
					vscode.TreeItemCollapsibleState.None,
					{
						prefix: "HACK",
						fileAbsPath: fileAbsPath2,
						currentLine: 1,
						character: 6,
						preview: "HACK: test hack -->",
						isIgnored: false,
						author: "Not Committed Yet",
					},
				),
			],
			...todoItems.slice(3),
		]);
	});
});

describe("Command tests", () => {
	test("refresh", async () => {
		const todoItems = gitSetupAndCreateTodoItems(wsPath);
		// append todo to test.md
		appendFileSync(`${wsPath}/test.md`, "<!-- TODO: add todo -->");

		// To update data, needs to operate any file on VSCode at least once.
		await vscode.commands.executeCommand("todo-list-for-teams.refresh");

		const receivedTodoItems = await getTodoItems();
		expect(receivedTodoItems).toEqual([
			[
				...todoItems[0],
				new TodoTreeItem(
					"TODO: add todo -->",
					vscode.TreeItemCollapsibleState.None,
					{
						prefix: "TODO",
						fileAbsPath: `${wsPath}/test.md`,
						currentLine: 5,
						committedLine: 5,
						character: 5,
						preview: "TODO: add todo -->",
						isIgnored: false,
						author: "Not Committed Yet",
					},
				),
			],
			...todoItems.slice(1),
		]);
	});

	test("addToIgnoreList", async () => {
		const todoItems = gitSetupAndCreateTodoItems(wsPath);
		await vscode.commands.executeCommand("todo-list-for-teams.refresh");
		if (todoItems[0][1].todoItemMetaData === undefined) {
			throw new Error("todoItemMetaData is undefined");
		}
		await vscode.commands.executeCommand(
			"todo-list-for-teams.addToIgnoreList",
			{
				todoItemMetaData: todoItems[0][1].todoItemMetaData,
			},
		);

		const receivedTodoItems = await getTodoItems();
		expect(receivedTodoItems).toEqual([
			[todoItems[0][0]],
			...todoItems.slice(1, -1),
			[
				...todoItems.slice(-1)[0],
				new TodoTreeItem(
					"TODO: todo -->",
					vscode.TreeItemCollapsibleState.None,
					{
						prefix: "TODO",
						fileAbsPath: `${wsPath}/test.md`,
						currentLine: 1,
						committedLine: 1,
						character: 5,
						preview: "TODO: todo -->",
						isIgnored: true,
						commitHash: todoItems[0][1].todoItemMetaData.commitHash,
						author: todoItems[0][1].todoItemMetaData.author,
					},
				),
			],
		]);
	});

	test("restoreItem", async () => {
		const todoItems = gitSetupAndCreateTodoItems(wsPath);
		await vscode.commands.executeCommand("todo-list-for-teams.refresh");
		if (todoItems[0][1].todoItemMetaData === undefined) {
			throw new Error("todoItemMetaData is undefined");
		}
		await vscode.commands.executeCommand(
			"todo-list-for-teams.addToIgnoreList",
			{
				todoItemMetaData: todoItems[0][1].todoItemMetaData,
			},
		);
		const receivedTodoItems = await getTodoItems();
		expect(receivedTodoItems).toEqual([
			[todoItems[0][0]],
			...todoItems.slice(1, -1),
			[
				...todoItems.slice(-1)[0],
				new TodoTreeItem(
					"TODO: todo -->",
					vscode.TreeItemCollapsibleState.None,
					{
						prefix: "TODO",
						fileAbsPath: `${wsPath}/test.md`,
						currentLine: 1,
						committedLine: 1,
						character: 5,
						preview: "TODO: todo -->",
						isIgnored: true,
						commitHash: todoItems[0][1].todoItemMetaData.commitHash,
						author: todoItems[0][1].todoItemMetaData.author,
					},
				),
			],
		]);

		// restore item
		await vscode.commands.executeCommand("todo-list-for-teams.restoreItem", {
			todoItemMetaData: {
				...todoItems[0][1].todoItemMetaData,
				isIgnored: true,
			},
		});
		const receivedTodoItemsAfterRestore = await getTodoItems();
		expect(receivedTodoItemsAfterRestore).toEqual(todoItems);
	});
});

const wsPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || "";
if (wsPath === "") {
	throw new Error("wsPath is undefined");
}

const INITIAL_TODO_ITEMS: TodoTreeItem[][] = [
	[new TodoTreeItem("TODO", vscode.TreeItemCollapsibleState.Expanded)],
	[new TodoTreeItem("FIXME", vscode.TreeItemCollapsibleState.Expanded)],
	[new TodoTreeItem("HACK", vscode.TreeItemCollapsibleState.Expanded)],
	[new TodoTreeItem("NOTE", vscode.TreeItemCollapsibleState.Expanded)],
	[new TodoTreeItem("IGNORE LIST", vscode.TreeItemCollapsibleState.Expanded)],
];

function gitSetupAndCreateTodoItems(wsPath: string): TodoTreeItem[][] {
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

	const todoTreeItems: TodoTreeItem[][] = [
		[
			new TodoTreeItem("TODO", vscode.TreeItemCollapsibleState.Expanded),
			new TodoTreeItem("TODO: todo -->", vscode.TreeItemCollapsibleState.None, {
				prefix: "TODO",
				fileAbsPath: `${wsPath}/test.md`,
				currentLine: 1,
				committedLine: 1,
				character: 5,
				preview: "TODO: todo -->",
				isIgnored: false,
				commitHash,
				author,
			}),
		],
		[
			new TodoTreeItem("FIXME", vscode.TreeItemCollapsibleState.Expanded),
			new TodoTreeItem(
				"FIXME: fixme -->",
				vscode.TreeItemCollapsibleState.None,
				{
					prefix: "FIXME",
					fileAbsPath: `${wsPath}/test.md`,
					currentLine: 3,
					committedLine: 3,
					character: 5,
					preview: "FIXME: fixme -->",
					isIgnored: false,
					commitHash,
					author,
				},
			),
		],
		[
			new TodoTreeItem("HACK", vscode.TreeItemCollapsibleState.Expanded),
			new TodoTreeItem("HACK: hack -->", vscode.TreeItemCollapsibleState.None, {
				prefix: "HACK",
				fileAbsPath: `${wsPath}/test.md`,
				currentLine: 2,
				committedLine: 2,
				character: 5,
				preview: "HACK: hack -->",
				isIgnored: false,
				commitHash,
				author,
			}),
		],
		[
			new TodoTreeItem("NOTE", vscode.TreeItemCollapsibleState.Expanded),
			new TodoTreeItem("NOTE: note -->", vscode.TreeItemCollapsibleState.None, {
				prefix: "NOTE",
				fileAbsPath: `${wsPath}/test.md`,
				currentLine: 4,
				committedLine: 4,
				character: 5,
				preview: "NOTE: note -->",
				isIgnored: false,
				commitHash,
				author,
			}),
		],
		[new TodoTreeItem("IGNORE LIST", vscode.TreeItemCollapsibleState.Expanded)],
	];

	return todoTreeItems;
}

async function getTodoItems(): Promise<TodoTreeItem[][]> {
	const ext = vscode.extensions.getExtension<vscode.ExtensionContext>(
		"senken.todo-list-for-teams",
	);
	const context = await ext?.activate();
	if (!context) {
		throw new Error("context is undefined");
	}
	const workspaceState = new TypedWorkspaceState(context.workspaceState);
	const todoListProvider = new TodoListProvider(wsPath, workspaceState);
	function getElements(element: TodoTreeItem): TodoTreeItem[] {
		const childElements = todoListProvider.getChildren(element);
		if (childElements.length === 0) {
			return [element];
		}
		return [element, ...childElements.flatMap(getElements)];
	}

	return todoListProvider.getChildren().map(getElements);
}

let fileCount = 0;
function createMdFileName() {
	return `test${fileCount++}.md`;
}

function createMdFileNameWithSpace() {
	return `test ${fileCount++}.md`;
}
