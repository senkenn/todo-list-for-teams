import * as child_process from "child_process";
import * as vscode from "vscode";
import { createHash } from "crypto";

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
		context.workspaceState,
	);

	// TODO: Is this needed?
	vscode.window.registerTreeDataProvider(
		"todo-list-for-teams",
		todoListProvider,
	);
	vscode.window.createTreeView("todo-list-for-teams", {
		treeDataProvider: todoListProvider,
	});

	// TODO: Non git project case

	const workspaceState = new WorkspaceState(context.workspaceState);

	// Must set first
	workspaceState.update("hiddenItemHashSet", new Set<string>());

	// Must set second
	workspaceState.update("todoList", todoListProvider.generateTodoList());

	const disposables = [
		vscode.commands.registerCommand("todo-list-for-teams.refresh", () =>
			todoListProvider.refresh(),
		),
		vscode.commands.registerCommand(
			"todo-list-for-teams.openFile",
			({ fileAbsPath, selection }: CommandOpenFile) => {
				vscode.window.showTextDocument(vscode.Uri.file(fileAbsPath), {
					selection,
				});
			},
		),
		vscode.commands.registerCommand(
			"todo-list-for-teams.hideItem",
			(todoItem: TodoTreeItem) => {
				if (!todoItem.itemId) {
					throw new NotSupportedError("Uncommitted item");
				}
				const workspaceState = new WorkspaceState(context.workspaceState);
				workspaceState.update(
					"hiddenItemHashSet",
					workspaceState.get("hiddenItemHashSet").add(todoItem.itemId),
				);
				log.call({ items: context.workspaceState.get("hiddenItemHashSet") });

				todoListProvider.refresh();
			},
		),
	];

	context.subscriptions.push(...disposables);
}

const searchWordShell = /TODO:\|HACK:\|NOTE:\|FIXME:/;
const searchWordTS = /TODO:|HACK:|NOTE:|FIXME:/;

type TodoList = {
	prefix: string;
	filePath: string;
	line: number;
	character: number;
	preview: string;
	commitHash?: string;
	author?: string;
}[];

class ShouldHaveBeenIncludedSearchWordError extends Error {
	constructor(message: string) {
		super(`ShouldHaveBeenIncludedSearchWordError: ${message}`);
	}
}

class NotSupportedError extends Error {
	constructor(nonSupportedSubject: string) {
		super(`NotSupportedError: ${nonSupportedSubject} is not supported`);
	}
}
type WorkspaceStateKeys = "todoList" | "hiddenItemHashSet";

type WorkspaceStateValueSelector<T extends WorkspaceStateKeys> =
	T extends "todoList"
		? TodoList | undefined
		: T extends "hiddenItemHashSet"
		  ? Set<string>
		  : never;

class WorkspaceState {
	constructor(
		private workspaceState: vscode.ExtensionContext["workspaceState"],
	) {
		this.workspaceState = workspaceState;
	}
	public get<T extends WorkspaceStateKeys>(
		key: T,
	): WorkspaceStateValueSelector<T> {
		const getResult = this.workspaceState.get(key);
		return <WorkspaceStateValueSelector<T>>getResult;
	}
	public update<T extends WorkspaceStateKeys>(
		key: T,
		value: WorkspaceStateValueSelector<T>,
	): void {
		this.workspaceState.update(key, value);
	}
}

function createHashFromTodoInfo(
	commitHash: string,
	filePath: string,
	line: number,
): string {
	return createHash("md5")
		.update(`${commitHash}-${filePath}-${line}`)
		.digest("base64");
}

export class TodoListProvider implements vscode.TreeDataProvider<TodoTreeItem> {
	private currentBranch = "";

	constructor(
		private workspaceRoot: string,
		private workspaceState: vscode.ExtensionContext["workspaceState"],
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

		const prefixes = ["TODO", "HACK", "NOTE", "FIXME"];
		const workspaceState = new WorkspaceState(this.workspaceState);
		const allTodoList = workspaceState.get("todoList");
		if (!allTodoList) {
			return [
				new TodoTreeItem(
					"No todo comments.",
					vscode.TreeItemCollapsibleState.None,
				),
			];
		}

		if (isFirstViewElement) {
			return prefixes.map((prefix) => {
				const list = allTodoList.filter((todo) => todo.prefix === prefix);
				return new TodoTreeItem(
					prefix,
					list.length && vscode.TreeItemCollapsibleState.Expanded,
				);
			});
		}

		const specifiedTodoList = allTodoList.filter(
			(todo) => todo.prefix === element.label,
		);
		return specifiedTodoList.map((todo) => {
			const hash: string | undefined =
				todo.commitHash &&
				createHashFromTodoInfo(todo.commitHash, todo.filePath, todo.line);

			return new TodoTreeItem(
				todo.preview,
				vscode.TreeItemCollapsibleState.None,
				{
					fileAbsPath: `${this.workspaceRoot}/${todo.filePath}`,
					line: todo.line,
					character: todo.character,
				},
				hash,
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
		this.workspaceState.update("todoList", this.generateTodoList());
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
		const grepResultUntrackedFiles = child_process
			.execSync(`
				cd ${this.workspaceRoot} \
		 		&& grep -n -E ${searchWordShell.source} $(git ls-files --others --exclude-standard) 
				`)
			.toString();

		const trackedTodoList: TodoList =
			grepTrackedFiles === ""
				? []
				: grepTrackedFiles
						.slice(0, -1) // cut last "\n"
						.split("\n")
						.map((output) => {
							const formattedOutput = output
								.replace(/\(\s+/, "")
								.replace(/\)/, "\t");
							const [filePath, commitHash, author, date, line, fullPreview] =
								formattedOutput.split("\t");
							const matchedWord = fullPreview.match(searchWordTS);
							if (!matchedWord?.index) {
								throw new ShouldHaveBeenIncludedSearchWordError(output);
							}
							const prefix = matchedWord[0].slice(0, -1); // cut last ":"
							const previewStartedWithPrefix = fullPreview.slice(
								matchedWord.index,
							);
							const character = matchedWord.index;

							return {
								prefix,
								filePath,
								line: Number(line),
								character,
								preview: previewStartedWithPrefix,
								commitHash,
								author,
							};
						})
						// Skip if item was already contained in hiddenItemHashSet
						.filter((todo) => {
							const hash = createHashFromTodoInfo(
								todo.commitHash,
								todo.filePath,
								Number(todo.line),
							);
							const workspaceState = new WorkspaceState(this.workspaceState);
							const hiddenItemHashSet = workspaceState.get("hiddenItemHashSet");
							if (hiddenItemHashSet.has(hash)) {
								return false;
							}
							return true;
						});

		const uncommittedTodoList: TodoList =
			grepResultUntrackedFiles === ""
				? []
				: grepResultUntrackedFiles
						.slice(0, -1)
						.split("\n")
						.map((output) => {
							const [filePath, line, ...rest] = output.split(":");
							const matchedWord = rest.join(":").match(searchWordTS);
							if (!matchedWord?.index || !matchedWord.input) {
								throw new ShouldHaveBeenIncludedSearchWordError(output);
							}
							const prefix = matchedWord[0].slice(0, -1); // cut last ":"
							const character = matchedWord.index;

							return {
								prefix,
								filePath,
								line: Number(line),
								character,
								preview: matchedWord.input?.slice(matchedWord.index),
							};
						});

		console.log("generate todo list successfully");
		return [...trackedTodoList, ...uncommittedTodoList];
	}
}

class TodoTreeItem extends vscode.TreeItem {
	public command?: vscode.Command;
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		private readonly openFileConfig?: {
			fileAbsPath: string;
			line: number;
			character: number;
		},
		public readonly itemId?: string,
	) {
		super(label, collapsibleState);
		if (!openFileConfig) {
			return;
		}

		this.contextValue = "todo-items";
		this.itemId = itemId;

		const { fileAbsPath, line, character } = openFileConfig;
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
