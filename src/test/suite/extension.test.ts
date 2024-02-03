import { execSync } from "child_process";
import * as vscode from "vscode";
import { TypedWorkspaceState } from "../../todoListProvider";
import {
	createMdFileName,
	createMdFileNameWithSpace,
	getExtContext,
	gitSetupAndCreateExpectedTodoList,
} from "../testUtils";

describe("Git tests", () => {
	const wsPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
	if (!wsPath) {
		throw new Error("wsPath is undefined");
	}

	afterEach(() => {
		// clean up
		execSync(`rm -rf ${wsPath}/.git ${wsPath}/test*.md`);
	});

	test("Should be create todo list with committed files", async () => {
		const expectedTodoList = gitSetupAndCreateExpectedTodoList(wsPath);
		const extContext = await getExtContext();
		await vscode.commands.executeCommand("todo-list-for-teams.refresh");

		const workspaceState = new TypedWorkspaceState(extContext.workspaceState);

		expect(workspaceState.get("todoList")).toEqual(expectedTodoList);
	});

	test("Created todo list with uncommitted files", async () => {
		const expectedTodoList = gitSetupAndCreateExpectedTodoList(wsPath);

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
		const expectedTodoList = gitSetupAndCreateExpectedTodoList(wsPath);

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
		const expectedTodoList = gitSetupAndCreateExpectedTodoList(wsPath);

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
		]);
	});
});
