import * as child_process from "child_process";
import * as vscode from "vscode";

const log = function <T>(this: { [key: string]: T }) {
	const keys = Object.keys(this);
	for (const key of keys) {
		const value = this[key];
		console.log(`${key}: ${JSON.stringify(value, null, 2)}`);
	}
};

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

	// TODO: Is this needed?
	// vscode.window.registerTreeDataProvider(
	// 	"todo-list-for-teams",
	// 	todoListProvider,
	// );
	vscode.window.createTreeView("todo-list-for-teams", {
		treeDataProvider: todoListProvider,
	});

	const workspaceState = new TypedWorkspaceState(context.workspaceState);
	workspaceState.update("todoList", todoListProvider.generateTodoList());

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
				// Initialize
				workspaceState.update("todoList", todoListProvider.generateTodoList());
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

const searchWordShell = /TODO:\|HACK:\|NOTE:\|FIXME:/;
const searchWordTS = /TODO:|HACK:|NOTE:|FIXME:/;

const prefixes = ["TODO", "HACK", "NOTE", "FIXME"] as const;
type Prefix = (typeof prefixes)[number];
type TodoList = {
	prefix: Prefix;
	fileAbsPath: string;
	line: number;
	character: number;
	preview: string;
	isIgnored: boolean;
	commitHash?: string;
	author?: string;
}[];

class ShouldHaveBeenIncludedSearchWordError extends Error {
	constructor(message: string) {
		super(`ShouldHaveBeenIncludedSearchWordError: ${message}`);
	}
}

type WorkspaceStateKeys = "todoList";
type WorkspaceStateValueSelector<T extends WorkspaceStateKeys> =
	T extends "todoList" ? TodoList : never;

class TypedWorkspaceState {
	constructor(
		private workspaceState: vscode.ExtensionContext["workspaceState"],
	) {
		this.workspaceState = workspaceState;
	}
	public get<T extends WorkspaceStateKeys>(
		key: T,
	): WorkspaceStateValueSelector<T> {
		const getResult = this.workspaceState.get(key);
		if (!getResult) {
			throw new Error(`workspaceState does not have "${key}"`);
		}

		return <WorkspaceStateValueSelector<T>>getResult;
	}
	public update<T extends WorkspaceStateKeys>(
		key: T,
		value: WorkspaceStateValueSelector<T>,
	): void {
		this.workspaceState.update(key, value);
	}
}

export class TodoListProvider implements vscode.TreeDataProvider<TodoTreeItem> {
	private contentMessage?: string;
	private workspaceRoot?: string;
	private workspaceState?: TypedWorkspaceState;
	constructor(contentMessage: string);
	constructor(workspaceRoot: string, workspaceState: TypedWorkspaceState);
	constructor(...args: unknown[]) {
		if (args.length === 1) {
			this.contentMessage = args[0] as string;
			return;
		}

		this.workspaceRoot = args[0] as string;
		this.workspaceState = args[1] as TypedWorkspaceState;
	}

	getTreeItem(element: TodoTreeItem): TodoTreeItem {
		return element;
	}

	getChildren(element?: TodoTreeItem): TodoTreeItem[] {
		if (this.contentMessage) {
			return [
				new TodoTreeItem(
					this.contentMessage,
					vscode.TreeItemCollapsibleState.None,
				),
			];
		}

		const todoList = this.workspaceState?.get("todoList");
		if (!todoList) {
			throw new Error("todoList is undefined");
		}

		// Top view
		const isFirstViewElement = !element;
		if (isFirstViewElement) {
			const groups = [...prefixes, "IGNORE LIST"];
			return groups.map((groupName) => {
				return new TodoTreeItem(
					groupName,
					vscode.TreeItemCollapsibleState.Expanded,
				);
			});
		}

		// Nested view
		const todoListFilteredByGroup = todoList.filter((todo) => {
			if (element.label === "IGNORE LIST") {
				return todo.isIgnored === true;
			}
			return todo.prefix === element.label && todo.isIgnored === false;
		});
		return todoListFilteredByGroup.map((todo) => {
			return new TodoTreeItem(
				todo.preview,
				vscode.TreeItemCollapsibleState.None,
				todo,
			);
		});
	}

	private _onDidChangeTreeData: vscode.EventEmitter<
		TodoTreeItem | undefined | null
	> = new vscode.EventEmitter<TodoTreeItem | undefined | null>();
	readonly onDidChangeTreeData: vscode.Event<TodoTreeItem | undefined | null> =
		this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
		// this.workspaceState.update("todoList", this.generateTodoList());
		console.log("refreshed");
	}

	generateTodoList(): TodoList {
		const grepTrackedFiles = child_process
			.execSync(`
				cd ${this.workspaceRoot} \
				&& git grep -n -E ${searchWordShell.source} \
				| while IFS=: read i j k; do \
						echo -n "$i\t"
						git annotate -L $j,$j "$i" | cat
					done
				`)
			.toString();
		const trackedTodoList: TodoList =
			grepTrackedFiles === ""
				? []
				: grepTrackedFiles
						.slice(0, -1) // cut last "\n"
						.split("\n")
						.map((output) => {
							// Format: {filePath}  {commitHash}  ( {author} {date} {lineStr} )  {fullPreview}
							const formattedOutput = output
								.replace(/\(\s*/, "")
								.replace(/\)/, "\t");
							const [
								filePath,
								commitHashIncludingUncommitted,
								author,
								date,
								lineStr,
								fullPreview,
							] = formattedOutput.split("\t");
							const line = Number(lineStr);
							const matchedWord = fullPreview.match(searchWordTS);
							if (!matchedWord?.index) {
								throw new ShouldHaveBeenIncludedSearchWordError(output);
							}
							const prefix = this.getPrefix(matchedWord[0]);
							const preview = fullPreview.slice(matchedWord.index);
							const character = matchedWord.index;

							const nonCommittedHashType = ["Not Committed Yet", "00000000"];
							const commitHash = nonCommittedHashType.includes(
								commitHashIncludingUncommitted,
							)
								? undefined
								: commitHashIncludingUncommitted;

							return {
								prefix,
								fileAbsPath: `${this.workspaceRoot}/${filePath}`,
								line,
								character,
								preview: preview,
								isIgnored: false,
								commitHash,
								author,
							};
						});

		const grepResultUntrackedFiles = child_process
			.execSync(`
				cd ${this.workspaceRoot} \
					&& grep --with-filename -n -E ${searchWordShell.source} $(git ls-files --others --exclude-standard) 
		    `)
			.toString();
		const untrackedTodoList: TodoList =
			grepResultUntrackedFiles === ""
				? []
				: grepResultUntrackedFiles
						.slice(0, -1) // cut last "\n"
						.split("\n")
						.map((output) => {
							// Format: {filePath}:{line}:{fullPreview}
							const [filePath, line, ...rest] = output.split(":");
							const matchedWord = rest.join(":").match(searchWordTS);
							if (!matchedWord?.index || !matchedWord.input) {
								throw new ShouldHaveBeenIncludedSearchWordError(output);
							}
							const prefix = this.getPrefix(matchedWord[0]);
							const character = matchedWord.index;

							return {
								prefix,
								fileAbsPath: `${this.workspaceRoot}/${filePath}`,
								line: Number(line),
								character,
								preview: matchedWord.input?.slice(matchedWord.index),
								isIgnored: false,
							};
						});

		console.log("Todo list was generated successfully");
		return [...trackedTodoList, ...untrackedTodoList];
	}

	private getPrefix(matchPrefixStr: string): Prefix {
		const prefix = matchPrefixStr.slice(0, -1); // cut last ":"
		if (!Object.values(prefixes).some((p) => p === prefix)) {
			throw new Error("prefixStr is not included in prefixes");
		}
		return prefix as Prefix;
	}
}

class TodoTreeItem extends vscode.TreeItem {
	public contextValue?:
		| "committed-item"
		| "non-committed-item"
		| "ignored-item";
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly todoItemMetaData?: TodoList[number],
	) {
		super(label, collapsibleState);
		if (!todoItemMetaData) {
			return;
		}

		this.contextValue = todoItemMetaData.isIgnored
			? "ignored-item"
			: todoItemMetaData.commitHash
			  ? "committed-item"
			  : "non-committed-item";

		const { fileAbsPath, line, character } = todoItemMetaData;
		const zeroBasedLine = line - 1;
		this.command = {
			command: "todo-list-for-teams.openFile",
			title: "Todo List For Teams: Open File", // TODO: get from package.json
			arguments: [
				{
					fileAbsPath,
					selection: new vscode.Range(
						zeroBasedLine,
						character,
						zeroBasedLine,
						character,
					),
				} satisfies CommandOpenFile,
			],
		};
	}
}

type CommandOpenFile = {
	fileAbsPath: string;
	selection: vscode.Range;
};

export function deactivate() {}
