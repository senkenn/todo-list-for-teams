import * as child_process from "child_process";
import * as vscode from "vscode";
import {
	CommandOpenFile,
	TodoListProvider,
	TodoTreeItem,
	TypedWorkspaceState,
} from "./todoListProvider";
import { log } from "./logger";

export function activate(context: vscode.ExtensionContext): void {
	const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
	log.call({ rootPath });
	if (!rootPath) {
		return;
	}

	// If git is not installed, show error message with tree view
	try {
		child_process.execSync("git --version");
	} catch (error) {
		console.warn((error as Buffer).toString());
		vscode.window.createTreeView("todo-list-for-teams", {
			treeDataProvider: new TodoListProvider("Git is not installed."),
		});
		return;
	}

	// If git is not initialized, show error message with tree view
	try {
		child_process.execSync(`cd ${rootPath} && git status`);
	} catch (error) {
		console.warn((error as Buffer).toString());
		vscode.window.createTreeView("todo-list-for-teams", {
			treeDataProvider: new TodoListProvider("Not a git repository."),
		});
		return;
	}

	const todoListProvider = new TodoListProvider(
		rootPath,
		new TypedWorkspaceState(context.workspaceState),
	);

	vscode.window.createTreeView("todo-list-for-teams", {
		treeDataProvider: todoListProvider,
	});

	const workspaceState = new TypedWorkspaceState(context.workspaceState);
	workspaceState.update("todoList", todoListProvider.generateTodoList());

	// Trigger
	vscode.workspace.onDidChangeTextDocument(() => {
		console.log("File was changed");
		workspaceState.update("todoList", todoListProvider.generateTodoList());
		todoListProvider.refresh();
	});

	const disposables = [
		vscode.commands.registerCommand("todo-list-for-teams.refresh", () =>
			todoListProvider.refresh(),
		),
		vscode.commands.registerCommand("todo-list-for-teams.reset", async () => {
			// Confirmation
			const selection = await vscode.window.showInformationMessage(
				"Are you sure you want to reset the todo list?",
				{ modal: true },
				"OK",
			);
			if (selection === "OK") {
				workspaceState.update(
					"todoList",
					todoListProvider.generateTodoList(true),
				);
				todoListProvider.refresh();
			}
		}),
		vscode.commands.registerCommand(
			"todo-list-for-teams.openFile",
			({ fileAbsPath, selection }: CommandOpenFile) => {
				vscode.window.showTextDocument(vscode.Uri.file(fileAbsPath), {
					selection,
				});
			},
		),
		vscode.commands.registerCommand(
			"todo-list-for-teams.addToIgnoreList",
			(todoItem: TodoTreeItem) => {
				const workspaceState = new TypedWorkspaceState(context.workspaceState);
				const todoList = workspaceState.get("todoList");
				if (!todoItem.todoItemMetaData) {
					throw new Error("todoItemMetaData is undefined");
				}
				const { commitHash, fileAbsPath, line } = todoItem.todoItemMetaData;

				// Update todo list to ignore same todo item
				const updatedTodoList = todoList.map((todo) => {
					if (
						todo.commitHash === commitHash &&
						todo.fileAbsPath === fileAbsPath &&
						todo.line === line
					) {
						return {
							...todo,
							isIgnored: true,
						};
					}
					return todo;
				});
				workspaceState.update("todoList", updatedTodoList);
				todoListProvider.refresh();
				console.log("Added to ignore list");
			},
		),
		vscode.commands.registerCommand(
			"todo-list-for-teams.restoreItem",
			(todoItem: TodoTreeItem) => {
				const workspaceState = new TypedWorkspaceState(context.workspaceState);
				const todoList = workspaceState.get("todoList");
				if (!todoItem.todoItemMetaData) {
					throw new Error("todoItemMetaData is undefined");
				}

				// Update todo list to restore same todo item from ignore list
				const updatedTodoList = todoList.map((todo) => {
					if (todo === todoItem.todoItemMetaData) {
						return {
							...todo,
							isIgnored: false,
						};
					}
					return todo;
				});
				workspaceState.update("todoList", updatedTodoList);
				todoListProvider.refresh();
				console.log("Restored item");
			},
		),
	];

	context.subscriptions.push(...disposables);
}

export function deactivate() {}
