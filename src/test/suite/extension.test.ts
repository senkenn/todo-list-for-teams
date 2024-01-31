import * as child_process from "child_process";
import * as vscode from "vscode";
import { TodoList, TypedWorkspaceState } from "../../todoListProvider";

function gitSetupAndCreateExpectedTodoList(wsPath: string): TodoList {
	// git config
	const author = "Test User";
	child_process.execSync(
		`cd ${wsPath} && git init && git config --local user.name "${author}" && git config --local user.email "you@example.com"`,
	);

	// git init and commit test.md
	const commitFileContent = `<!-- TODO: todo -->
<!-- HACK: hack -->
<!-- FIXME: fixme -->
<!-- NOTE: note -->`;
	const commitFileName = "test.md";
	child_process
		.execSync(
			`cd ${wsPath} && \
			 touch ${commitFileName} && \
			 echo "${commitFileContent}" > ${commitFileName} && \
			 git add . && \
			 git commit -m "init"`,
		)
		.toString();
	const commitHash = child_process
		.execSync(`cd ${wsPath} && git rev-parse --short=8 HEAD`)
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

async function getExtContext(): Promise<vscode.ExtensionContext> {
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
function createMdFileName() {
	return `test${fileCount++}.md`;
}
function createMdFileNameWithSpace() {
	return `test ${fileCount++}.md`;
}

describe("Extension Test Suite", () => {
	const wsPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
	if (!wsPath) {
		throw new Error("wsPath is undefined");
	}

	beforeAll(() => {});

	afterEach(() => {
		// clean up
		child_process.execSync(`rm -rf ${wsPath}/.git`);
		child_process.execSync(`rm -f ${wsPath}/test*.md`);
	});

	test("Should be create todo list with committed files", async () => {
		const expectedTodoList = gitSetupAndCreateExpectedTodoList(wsPath);
		const extContext = await getExtContext();
		await vscode.commands.executeCommand("todo-list-for-teams.refresh");

		const workspaceState = new TypedWorkspaceState(extContext.workspaceState);

		expect(workspaceState.get("todoList")).toEqual(expectedTodoList);
	});

	// test("Created todo list with uncommitted files", async () => {
	// 	const expectedTodoList = gitSetupAndCreateExpectedTodoList(wsPath);

	// 	// create file
	// 	const fileAbsPath = `${wsPath}/${createMdFileName()}`;
	// 	child_process.execSync(`touch ${fileAbsPath}`);

	// 	// open file and save
	// 	const document = await vscode.workspace.openTextDocument(fileAbsPath);
	// 	const editor = await vscode.window.showTextDocument(document);
	// 	await editor.edit((editBuilder) => {
	// 		editBuilder.insert(new vscode.Position(0, 0), "<!-- TODO: test todo -->");
	// 	});
	// 	await document.save();

	// 	// get todo list
	// 	const extContext = await getExtContext();
	// 	const workspaceState = new TypedWorkspaceState(extContext.workspaceState);

	// 	expect(workspaceState.get("todoList")).toEqual([
	// 		...expectedTodoList,
	// 		{
	// 			character: 5,
	// 			fileAbsPath,
	// 			isIgnored: false,
	// 			line: 1,
	// 			prefix: "TODO",
	// 			preview: "TODO: test todo -->",
	// 		},
	// 	]);
	// });

	// test("Created todo list with uncommitted files and space in file name", async () => {
	// 	const expectedTodoList = gitSetupAndCreateExpectedTodoList(wsPath);

	// 	const fileAbsPath = `${wsPath}/${createMdFileNameWithSpace()}`;
	// 	child_process.execSync(`touch "${fileAbsPath}"`);

	// 	// open file and save
	// 	const document = await vscode.workspace.openTextDocument(fileAbsPath);
	// 	const editor = await vscode.window.showTextDocument(document);
	// 	await editor.edit((editBuilder) => {
	// 		editBuilder.insert(new vscode.Position(0, 0), "<!-- TODO: test todo -->");
	// 	});
	// 	await document.save();

	// 	// get todo list
	// 	const extContext = await getExtContext();
	// 	const workspaceState = new TypedWorkspaceState(extContext.workspaceState);

	// 	// check todo list
	// 	expect(workspaceState.get("todoList")).toEqual([
	// 		...expectedTodoList,
	// 		{
	// 			character: 5,
	// 			fileAbsPath,
	// 			isIgnored: false,
	// 			line: 1,
	// 			prefix: "TODO",
	// 			preview: "TODO: test todo -->",
	// 		},
	// 	]);
	// });

	// test("Created todo list with uncommitted files and multiple files", async () => {
	// 	const expectedTodoList = gitSetupAndCreateExpectedTodoList(wsPath);

	// 	const fileAbsPath = `${wsPath}/${createMdFileName()}`;
	// 	const fileAbsPath2 = `${wsPath}/${createMdFileNameWithSpace()}`;
	// 	child_process.execSync(`touch "${fileAbsPath}" "${fileAbsPath2}"`);

	// 	// open file and save
	// 	const document = await vscode.workspace.openTextDocument(fileAbsPath);
	// 	const editor = await vscode.window.showTextDocument(document);
	// 	await editor.edit((editBuilder) => {
	// 		editBuilder.insert(new vscode.Position(0, 0), "<!-- TODO: test todo -->");
	// 	});
	// 	await document.save();

	// 	// close file
	// 	await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

	// 	const document2 = await vscode.workspace.openTextDocument(fileAbsPath2);
	// 	const editor2 = await vscode.window.showTextDocument(document2);
	// 	await editor2.edit((editBuilder) => {
	// 		editBuilder.insert(
	// 			new vscode.Position(0, 0),
	// 			" <!-- HACK: test hack -->",
	// 		);
	// 	});
	// 	await document2.save();

	// 	// get todo list
	// 	const extContext = await getExtContext();
	// 	const workspaceState = new TypedWorkspaceState(extContext.workspaceState);

	// 	// remove test file
	// 	child_process.execSync(`rm -f "${fileAbsPath}"`).toString();
	// 	child_process.execSync(`rm -f "${fileAbsPath2}"`).toString();

	// 	// check todo list
	// 	expect(workspaceState.get("todoList")).toEqual([
	// 		...expectedTodoList,
	// 		{
	// 			character: 6,
	// 			fileAbsPath: fileAbsPath2,
	// 			isIgnored: false,
	// 			line: 1,
	// 			prefix: "HACK",
	// 			preview: "HACK: test hack -->",
	// 		},
	// 		{
	// 			character: 5,
	// 			fileAbsPath,
	// 			isIgnored: false,
	// 			line: 1,
	// 			prefix: "TODO",
	// 			preview: "TODO: test todo -->",
	// 		},
	// 	]);
	// });

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
