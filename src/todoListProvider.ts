import * as child_process from "child_process";
import * as vscode from "vscode";
import { ShouldHaveBeenIncludedSearchWordError } from "./error";
import { log } from "./logger";

const searchWordShell = /TODO:\|FIXME:\|HACK:\|NOTE:/;
const searchWordTS = /TODO:|FIXME:|HACK:|NOTE:/;

const prefixes = ["TODO", "FIXME", "HACK", "NOTE"] as const;
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

export type CommandOpenFile = {
	fileAbsPath: string;
	selection: vscode.Range;
};

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
		console.log("refreshed");
	}

	generateTodoList(isReset = false): TodoList {
		const ignoredList = isReset
			? []
			: this.workspaceState
					?.get("todoList")
					?.filter((todo) => todo.isIgnored) || [];

		const grepTrackedFiles = child_process
			.execSync(`
				cd ${this.workspaceRoot}
				git grep -n -E ${searchWordShell.source} \
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
							const fileAbsPath = `${this.workspaceRoot}/${filePath}`;
							const line = Number(lineStr);
							const matchedWord = fullPreview.match(searchWordTS);
							if (matchedWord?.index === undefined) {
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

							// Ignore if it is included in ignoredList
							const isIgnored = ignoredList.some(
								(ignored) =>
									ignored.commitHash === commitHash &&
									ignored.fileAbsPath === fileAbsPath &&
									ignored.line === line,
							);

							return {
								prefix,
								fileAbsPath,
								line,
								character,
								preview,
								isIgnored,
								commitHash,
								author,
							};
						});

		const grepResultUntrackedFiles = child_process
			.execSync(`
				cd ${this.workspaceRoot}
				files=$(git ls-files --others --exclude-standard \
					| grep -v /$) # exclude directory
				if [ -n "$files" ]; then
					echo "$files" | xargs -d '\\n' grep --with-filename -n -E ${searchWordShell.source}
				fi
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
							log.call({ rest: rest.join(":") });
							if (
								matchedWord?.index === undefined ||
								matchedWord.input === undefined
							) {
								console.log(matchedWord);
								throw new ShouldHaveBeenIncludedSearchWordError(output);
							}
							const prefix = this.getPrefix(matchedWord[0]);
							const character = matchedWord.index;

							return {
								prefix,
								fileAbsPath: `${this.workspaceRoot}/${filePath}`,
								line: Number(line),
								character,
								preview: matchedWord.input.slice(matchedWord.index),
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

export class TodoTreeItem extends vscode.TreeItem {
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

type WorkspaceStateKeys = "todoList";
type WorkspaceStateValueSelector<T extends WorkspaceStateKeys> =
	T extends "todoList" ? TodoList : never;

export class TypedWorkspaceState {
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
