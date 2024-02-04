import { execSync } from "child_process";
import { appendFileSync } from "fs";
import * as vscode from "vscode";
import { log } from "../../logger";
import { TodoList, TypedWorkspaceState } from "../../todoListProvider";
import {
	createMdFileName,
	createMdFileNameWithSpace,
	getExtContext,
	gitSetupAndCreateTodoList,
} from "../testUtils";

const wsPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
if (!wsPath) {
	throw new Error("wsPath is undefined");
}

afterEach(async () => {
	// clean up
	execSync(`rm -rf ${wsPath}/.git ${wsPath}/test*.md`);
	const extContext = await getExtContext();
	const workspaceState = new TypedWorkspaceState(extContext.workspaceState);
	workspaceState.update("todoList", []);
});

describe("Git tests", () => {
	test("Should be create todo list with committed files", async () => {
		const expectedTodoList = gitSetupAndCreateTodoList(wsPath);
		const extContext = await getExtContext();
		await vscode.commands.executeCommand("todo-list-for-teams.refresh");

		const workspaceState = new TypedWorkspaceState(extContext.workspaceState);

		expect(workspaceState.get("todoList")).toEqual(expectedTodoList);
	});

	test("Created todo list with uncommitted files", async () => {
		const expectedTodoList = gitSetupAndCreateTodoList(wsPath);

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

		// get todo list
		const extContext = await getExtContext();
		const workspaceState = new TypedWorkspaceState(extContext.workspaceState);

		expect(workspaceState.get("todoList")).toEqual([
			...expectedTodoList,
			{
				author: "Not Committed Yet",
				character: 5,
				fileAbsPath,
				isIgnored: false,
				line: 1,
				prefix: "TODO",
				preview: "TODO: test todo -->",
			},
		]);
	});

	test("Created todo list with uncommitted files and space in file name", async () => {
		const expectedTodoList = gitSetupAndCreateTodoList(wsPath);

		const fileAbsPath = `${wsPath}/${createMdFileNameWithSpace()}`;
		execSync(`touch "${fileAbsPath}"`);

		// open file and save
		const document = await vscode.workspace.openTextDocument(fileAbsPath);
		const editor = await vscode.window.showTextDocument(document);
		await editor.edit((editBuilder) => {
			editBuilder.insert(new vscode.Position(0, 0), "<!-- TODO: test todo -->");
		});
		await document.save();

		// get todo list
		const extContext = await getExtContext();
		const workspaceState = new TypedWorkspaceState(extContext.workspaceState);

		// check todo list
		expect(workspaceState.get("todoList")).toEqual([
			...expectedTodoList,
			{
				author: "Not Committed Yet",
				character: 5,
				fileAbsPath,
				isIgnored: false,
				line: 1,
				prefix: "TODO",
				preview: "TODO: test todo -->",
			},
		]);
	});

	test("Created todo list with uncommitted files and multiple files", async () => {
		const expectedTodoList = gitSetupAndCreateTodoList(wsPath);

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

		// get todo list
		const extContext = await getExtContext();
		const workspaceState = new TypedWorkspaceState(extContext.workspaceState);

		// remove test file
		execSync(`rm -f "${fileAbsPath}"`).toString();
		execSync(`rm -f "${fileAbsPath2}"`).toString();

		// check todo list
		expect(workspaceState.get("todoList")).toEqual([
			...expectedTodoList,
			{
				author: "Not Committed Yet",
				character: 6,
				fileAbsPath: fileAbsPath2,
				isIgnored: false,
				line: 1,
				prefix: "HACK",
				preview: "HACK: test hack -->",
			},
			{
				author: "Not Committed Yet",
				character: 5,
				fileAbsPath,
				isIgnored: false,
				line: 1,
				prefix: "TODO",
				preview: "TODO: test todo -->",
			},
		]);
	});
});

describe("Command tests", () => {
	test("refresh", async () => {
		const todoList = gitSetupAndCreateTodoList(wsPath);

		// append todo to test.md
		appendFileSync(`${wsPath}/test.md`, "<!-- TODO: add todo -->");

		const extContext = await getExtContext();
		await vscode.commands.executeCommand("todo-list-for-teams.refresh");
		const workspaceState = new TypedWorkspaceState(extContext.workspaceState);

		expect(workspaceState.get("todoList")).toEqual([
			...todoList,
			{
				author: "Not Committed Yet",
				character: 5,
				commitHash: undefined,
				fileAbsPath: `${wsPath}/test.md`,
				isIgnored: false,
				line: 5,
				prefix: "TODO",
				preview: "TODO: add todo -->",
			},
		]);
	});

	test("addToIgnoreList", async () => {
		const todoList = gitSetupAndCreateTodoList(wsPath);

		await vscode.commands.executeCommand("todo-list-for-teams.refresh");
		await vscode.commands.executeCommand(
			"todo-list-for-teams.addToIgnoreList",
			{
				todoItemMetaData: todoList[0],
			},
		);

		const extContext = await getExtContext();
		const workspaceState = new TypedWorkspaceState(extContext.workspaceState);
		expect(workspaceState.get("todoList")).toEqual([
			{
				...todoList[0],
				isIgnored: true,
			},
			...todoList.slice(1),
		]);
	});

	test("restoreItem", async () => {
		const todoList = gitSetupAndCreateTodoList(wsPath);

		await vscode.commands.executeCommand("todo-list-for-teams.refresh");
		await vscode.commands.executeCommand(
			"todo-list-for-teams.addToIgnoreList",
			{
				todoItemMetaData: todoList[0],
			},
		);

		const extContext = await getExtContext();
		const workspaceState = new TypedWorkspaceState(extContext.workspaceState);
		expect(workspaceState.get("todoList")).toEqual([
			{
				...todoList[0],
				isIgnored: true,
			},
			...todoList.slice(1),
		]);

		// restore item
		await vscode.commands.executeCommand("todo-list-for-teams.restoreItem", {
			todoItemMetaData: {
				...todoList[0],
				isIgnored: true,
			},
		});
		await vscode.commands.executeCommand("todo-list-for-teams.refresh");
		expect(workspaceState.get("todoList")).toEqual(todoList);
	});
});
