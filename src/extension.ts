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

	context.workspaceState.update("todoList", todoListProvider.getTodoList());

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
	];

	context.subscriptions.push(...disposables);
}

const searchWordGit = /TODO:\|HACK:/;
const searchWordTS = /TODO:|HACK:/;

type TodoList = {
	prefix: string;
	filePath: string;
	line: number;
	character: number;
	preview: string;
	isPreview: boolean;
	commitHash: string;
	author: string;
}[];

class ShouldHaveBeenIncludedSearchWordError extends Error {
	constructor(message: string) {
		super(`${ShouldHaveBeenIncludedSearchWordError.name}: ${message}`);
		this.name = "ShouldHaveBeenIncludedSearchWordError";
	}
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
		log.call({ element });
		const isFirstViewElement = !element;

		const prefixes = ["TODO", "HACK", "FIXME"];
		const allTodoList = (this.workspaceState.get("todoList") || []) as
			| TodoList
			| undefined;
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
		// log.call({ specifiedTodoList });
		return specifiedTodoList.map((todo) => {
			return new TodoTreeItem(
				todo.preview,
				vscode.TreeItemCollapsibleState.None,
				{
					fileAbsPath: `${this.workspaceRoot}/${todo.filePath}`,
					line: todo.line,
					character: todo.character,
				},
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
		console.log("refreshed");
	}

	getTodoList(): TodoList {
		const cmd = `cd ${this.workspaceRoot} \
								 && git grep -n -E ${searchWordGit.source} \
								 | while IFS=: read i j k; do \
								     echo -n "$i "; \
									 	 git blame --show-name -L $j,$j $i | cat;
									 done`;
		const gitGrepResult = child_process.execSync(cmd).toString();
		if (gitGrepResult === "") {
			return [];
		}

		// cut last "\n" and split by "\n"
		const searchResultArray = gitGrepResult.slice(0, -1).split("\n");

		const committedTodoList = searchResultArray.map((output) => {
			const filePath = output.split(" ")[0];
			const afterFilePath = output.substring(filePath.length + " ".length);
			const commitHash = afterFilePath.split(" ")[0];
			const afterCommitHash = afterFilePath.substring(
				filePath.length + " (".length,
			);
			const author = afterCommitHash.split(" ")[0];
			const afterAuthor = afterCommitHash.substring(author.length + " ".length);
			const matchedWord = afterAuthor.match(searchWordTS);
			if (!matchedWord?.index) {
				throw new ShouldHaveBeenIncludedSearchWordError(output);
			}
			const prefix = matchedWord[0].slice(0, -1);
			const getLineResult = output.match(/(\d+)\)/);
			if (!getLineResult?.[1]) {
				throw new Error("line is not found");
			}
			const line = Number(getLineResult[1]);
			const afterMatchedWord = afterAuthor.match(/\)\s/);
			if (!afterMatchedWord?.index) {
				throw new Error("character is not found");
			}
			const previewLine = afterAuthor.slice(
				afterMatchedWord.index + ") ".length,
			);
			const preview = afterAuthor.slice(matchedWord.index);
			const character = previewLine.match(searchWordTS)?.index;
			if (character === undefined) {
				throw new ShouldHaveBeenIncludedSearchWordError(output);
			}
			return {
				prefix,
				filePath,
				line,
				character,
				preview,
				isPreview: true,
				commitHash,
				author,
			};
		});
		log.call({ committedTodoList });
		return committedTodoList;
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
	) {
		super(label, collapsibleState);
		if (!openFileConfig) {
			return;
		}

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
