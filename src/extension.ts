import * as child_process from "child_process";
import * as vscode from "vscode";

const log = function <T>(this: { [key: string]: T }) {
	const keys = Object.keys(this);
	for (const key of keys) {
		const value = this[key];
		console.log(`${key}: ${JSON.stringify(value, null, 2)}`);
	}
};

export function activate(context: vscode.ExtensionContext) {
	const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
	log.call({ rootPath });
	if (!rootPath) {
		return;
	}

	const todoListProvider = new TodoListProvider(
		rootPath,
		new TypedWorkspaceState(context.workspaceState),
	);

	// TODO: Is this needed?
	vscode.window.registerTreeDataProvider(
		"todo-list-for-teams",
		todoListProvider,
	);
	vscode.window.createTreeView("todo-list-for-teams", {
		treeDataProvider: todoListProvider,
	});

	// TODO: Skip on non git project

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
	private currentBranch = "";

	constructor(
		private workspaceRoot: string,
		private workspaceState: TypedWorkspaceState,
	) {
		// get current branch
		const stdout = child_process
			.execSync(`cd ${this.workspaceRoot} && git branch --show-current`)
			.toString();

		// cut last "\n" and set to currentBranch
		this.currentBranch = stdout.slice(0, -1);
		log.call({ currentBranch: this.currentBranch });
	}

	getTreeItem(element: TodoTreeItem): TodoTreeItem {
		return element;
	}

	getChildren(element?: TodoTreeItem): TodoTreeItem[] {
		const isFirstViewElement = !element;

		const todoList = this.workspaceState.get("todoList");
		// TODO: undefinedケースは必要ない？typedWorkspaceStateでかける？
		if (!todoList) {
			return [
				new TodoTreeItem(
					"No todo comments.",
					vscode.TreeItemCollapsibleState.None,
				),
			];
		}

		if (isFirstViewElement) {
			const groups = [...prefixes, "IGNORE LIST"];
			return groups.map((groupName) => {
				return new TodoTreeItem(
					groupName,
					vscode.TreeItemCollapsibleState.Expanded,
				);
			});
		}

		if (element.label === "IGNORE LIST") {
			const ignoreList = todoList.filter((todo) => todo.isIgnored === true);
			log.call({ ignoreList });
			return ignoreList.map((todo) => {
				return new TodoTreeItem(
					todo.preview,
					vscode.TreeItemCollapsibleState.None,
					todo,
				);
			});
		}

		const todoListFilteredByGroup = todoList.filter(
			(todo) => todo.prefix === element.label && todo.isIgnored === false,
		);
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
							const [filePath, commitHash, author, date, lineStr, fullPreview] =
								formattedOutput.split("\t");
							const line = Number(lineStr);
							const matchedWord = fullPreview.match(searchWordTS);
							if (!matchedWord?.index) {
								throw new ShouldHaveBeenIncludedSearchWordError(output);
							}
							const prefix = this.getPrefix(matchedWord[0]);
							const previewStartedWithPrefix = fullPreview.slice(
								matchedWord.index,
							);
							const character = matchedWord.index;

							return {
								prefix,
								fileAbsPath: `${this.workspaceRoot}/${filePath}`,
								line,
								character,
								preview: previewStartedWithPrefix,
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
							log.call({ output });
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
	public contextValue?: "todo-item" | "todo-ignored-item";
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly todoItemMetaData?: TodoList[number],
	) {
		super(label, collapsibleState);
		if (!todoItemMetaData) {
			return;
		}

		this.contextValue =
			todoItemMetaData.isIgnored === false ? "todo-item" : "todo-ignored-item";

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
