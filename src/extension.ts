import * as child_process from "child_process";
import * as vscode from "vscode";

const log = function <T>(this: { [key: string]: T }) {
	const key = Object.keys(this)[0];
	const value = this[key];
	console.log(`${key}: ${JSON.stringify(value, null, 2)}`);
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

	const todoList = [
		// ...todoListProvider.getUnCommitTodoList(),
		...todoListProvider.getCommittedTodoList(),
	];

	// TODO: Is this needed?
	vscode.window.registerTreeDataProvider(
		"todo-list-for-teams",
		todoListProvider,
	);
	vscode.window.createTreeView("todo-list-for-teams", {
		treeDataProvider: todoListProvider,
	});
	vscode.commands.registerCommand("nodeDependencies.refreshEntry", () =>
		todoListProvider.refresh(),
	);
	context.workspaceState.update("todoList", todoList);

	const disposable = vscode.commands.registerCommand(
		"todo-list-for-teams.refresh",
		async () => {
			todoListProvider.refresh();
		},
	);

	context.subscriptions.push(disposable);
}

const searchWordGit = /TODO:\|HACK:/;
const searchWordTS = /TODO:|HACK:/;

type UnCommitTodoList = {
	prefix: string;
	sourcePath: string;
	line: number;
	preview: string;
	isPreview: boolean;
}[];

type CommittedTodoList = (UnCommitTodoList[0] & {
	branch: string;
	commitHash: string;
	author: string;
})[];

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
			| CommittedTodoList
			| undefined;
		if (!allTodoList) {
			return [new TodoTreeItem("No todo comments.")];
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

		const specifiedTodoList = allTodoList
			.filter((todo) => todo.branch === this.currentBranch)
			.filter((todo) => todo.prefix === element.label);
		log.call({ specifiedTodoList });
		return specifiedTodoList.map((todo) => {
			return new TodoTreeItem(todo.preview);
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

	getUnCommitTodoList(): UnCommitTodoList {
		const cmd = `git -C ${this.workspaceRoot} diff \
								 | grep -E ${searchWordGit.source} | grep '^+' \
								 || [ $? = 1 ] # if grep return 1, then return 0`;
		const output = child_process.execSync(cmd).toString();

		// cut last "\n" and split by "\n"
		const searchResultArray = output.slice(0, -1).split("\n");
		const unCommitTodoList = searchResultArray.map((output) => {
			const matchedWord = output.match(searchWordTS);
			if (!matchedWord) {
				throw new ShouldHaveBeenIncludedSearchWordError(output);
			}
			return {
				prefix: matchedWord[0].slice(0, -1),
				sourcePath: output.slice(1),
				line: 0,
				preview: "",
				isPreview: true,
			};
		});
		return unCommitTodoList;
	}

	getCommittedTodoList(): CommittedTodoList {
		const cmd = `cd ${this.workspaceRoot} &&
								 git -c grep.lineNumber=true grep -E ${searchWordGit.source} $(git branch --format='%(objectname) %(refname:short)' \
								 | sort | uniq -w 40 | cut -c 42-) \
								 || [ $? = 1 ] # if grep return 1, then return 0`;
		const gitGrepResult = child_process.execSync(cmd).toString();
		if (gitGrepResult === "") {
			return [];
		}

		// cut last "\n" and split by "\n"
		const searchResultArray = gitGrepResult.slice(0, -1).split("\n");

		const committedTodoList = searchResultArray.map((output) => {
			// tracked file
			const firstIndex = output.indexOf(":");
			const secondIndex = output.indexOf(":", firstIndex + 1);
			const thirdIndex = output.indexOf(":", secondIndex + 1);
			const fullLine = output.slice(thirdIndex + 1);
			const matchedWord = fullLine.match(searchWordTS);
			if (!matchedWord) {
				throw new ShouldHaveBeenIncludedSearchWordError(output);
			}
			const prefix = matchedWord[0].slice(0, -1);
			const branch = output.slice(0, firstIndex);
			const sourcePath = output.slice(firstIndex + 1, secondIndex);
			const line = Number(output.slice(secondIndex + 1, thirdIndex));
			const preview = fullLine.slice(matchedWord.index);

			const cmd = `cd ${this.workspaceRoot} && git blame ${branch} -L ${line},${line} ${sourcePath}`;
			const blameOutput = child_process.execSync(cmd).toString();

			// get commit hash, author
			const commitHash = blameOutput.slice(0, 8);
			const author = blameOutput.split(" ")[1].slice(1);

			return {
				prefix,
				branch,
				sourcePath,
				line,
				preview,
				isPreview: true,
				commitHash,
				author,
			};
		});
		return committedTodoList;
	}
}

class TodoTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState?: vscode.TreeItemCollapsibleState,
	) {
		super(label, collapsibleState);
	}
}
export function deactivate() {}
