import { execSync } from "child_process";
import * as vscode from "vscode";
import { ShouldHaveBeenIncludedSearchWordError } from "./error";
import { log } from "./logger";

const searchWordShell = /TODO:\|FIXME:\|HACK:\|NOTE:/;
const searchWordTS = /TODO:|FIXME:|HACK:|NOTE:/;

const prefixes = ["TODO", "FIXME", "HACK", "NOTE"] as const;
type Prefix = (typeof prefixes)[number];
export type TodoList = {
	prefix: Prefix;
	fileAbsPath: string;
	currentLine: number;
	committedLine?: number;
	character: number;
	preview: string;
	isIgnored: boolean;
	author: string;
	commitHash?: string;
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
		this.workspaceState?.update("todoList", this.generateTodoList());
		this._onDidChangeTreeData.fire(undefined);
		console.log("refreshed");
	}

	generateTodoList(isReset = false): TodoList {
		const ignoredList = isReset
			? []
			: this.workspaceState
					?.get("todoList")
					?.filter((todo) => todo.isIgnored) || [];

		const grepTrackedFiles = execSync(
			`bash ./src/test/getTodoTrackedFiles.sh ${this.workspaceRoot}`,
		).toString();

		const trackedTodoList: TodoList =
			grepTrackedFiles === ""
				? []
				: grepTrackedFiles
						.slice(0, -2) // Remove last "\n\n"
						.split("\n\n")
						.map((output) => {
							// output is like:
							// filePath src/test/suite/extension.test.ts
							// c86dbc4aa3e590d61868dfb242c6bf7fdecc55fc 134 48 1
							// author senkenn
							// author-mail <senken32@gmail.com>
							// author-time 1706716246
							// author-tz +0900
							// committer senkenn
							// committer-mail <senken32@gmail.com>
							// committer-time 1706716246
							// committer-tz +0900
							// summary Add support for Windows in CI workflow and update extension tests
							// previous a7c0a2a6b40802b2ab46bdca59fe961f0a0f1525 src/test/suite/extension.test.ts
							// filename src/test/suite/extension.test.ts
							// 				editBuilder.insert(new vscode.Position(0, 0), "<!-- TODO: test todo -->");
							const outputLines = output.split("\n");

							const currentFilePathMatch =
								outputLines[0].match(/filePath (.*)/);
							const commitHashMatch = outputLines[1].match(
								/([a-f0-9]{40}) \d+ \d+ \d/,
							);
							const currentLineMatch = outputLines[1].match(
								/[a-f0-9]{40} \d+ (\d+) \d/,
							);
							const committedLineMatch = outputLines[1].match(
								/[a-f0-9]{40} (\d+) \d+ \d/,
							);
							const authorMatch = outputLines[2].match(/author (.*)/);
							const fullPreview = outputLines.slice(-1)[0].slice(1);
							if (
								!currentFilePathMatch ||
								!commitHashMatch ||
								!currentLineMatch ||
								!committedLineMatch ||
								!authorMatch ||
								!fullPreview
							) {
								log.call({
									output,
									currentFilePathMatch,
									commitHashMatch,
									currentLineMatch,
									authorMatch,
									fullPreview,
								});
								throw new ShouldHaveBeenIncludedSearchWordError(output);
							}

							const fileAbsPath = `${this.workspaceRoot}/${currentFilePathMatch[1]}`;
							const commitHashIncludingUncommitted = commitHashMatch[1].slice(
								0,
								8,
							);
							const currentLine = Number(currentLineMatch[1]);
							const committedLine = Number(committedLineMatch[1]);
							const author = authorMatch[1];
							const matchedWord = fullPreview.match(searchWordTS);
							if (matchedWord?.index === undefined) {
								log.call({ output, matchedWord });
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
									ignored.committedLine === committedLine,
							);

							return {
								prefix,
								fileAbsPath,
								currentLine,
								committedLine,
								character,
								preview,
								isIgnored,
								commitHash,
								author,
							};
						});

		const grepResultUntrackedFiles = execSync(
			`bash ./src/test/getTodoUntrackedFiles.sh ${this.workspaceRoot}`,
		).toString();
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
							if (
								matchedWord?.index === undefined ||
								matchedWord.input === undefined
							) {
								log.call({ output, matchedWord });
								throw new ShouldHaveBeenIncludedSearchWordError(output);
							}
							const prefix = this.getPrefix(matchedWord[0]);
							const character = matchedWord.index;

							return {
								author: "Not Committed Yet",
								prefix,
								fileAbsPath: `${this.workspaceRoot}/${filePath}`,
								currentLine: Number(line),
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

		const { fileAbsPath, currentLine: line, character } = todoItemMetaData;
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
