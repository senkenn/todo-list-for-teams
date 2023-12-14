import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

const log = function <T>(this: { [key: string]: T }) {
	const key = Object.keys(this)[0];
	const value = this[key];
	console.log(`${key}: ${JSON.stringify(value, null, 2)}`);
};

export function activate(context: vscode.ExtensionContext) {
	// const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
	const rootPath = "/home/senken/personal/vsce-base/todo-list-for-teams";
	log.call({ rootPath });
	if (!rootPath) {
		return;
	}

	vscode.window.registerTreeDataProvider(
		"todo-list-for-teams",
		new TodoListProvider(rootPath as string),
	);
	vscode.window.createTreeView("todo-list-for-teams", {
		treeDataProvider: new TodoListProvider(rootPath as string),
		// showCollapseAll: true,
	});

	const todoList = [
		// ...getUnCommitTodoList(rootPath),
		...getCommittedTodoList(rootPath),
	];
	log.call({ todoList }); // Fix: Pass the correct 'this' context to logger.call

	// const onSave = vscode.workspace.onDidSaveTextDocument((e) => {
	// 	updateTreeView(provider);
	// });

	const disposable = vscode.commands.registerCommand(
		"todo-list-for-teams.helloWorld",
		async () => {
			// Save and View
			// TODO: implement
			context.workspaceState.update("todoList", todoList);
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
}[];

type CommittedTodoList = (UnCommitTodoList[0] & {
	branch: string;
	commitHash: string;
	author: string;
})[];

class NotContainSearchWordError extends Error {
	constructor(message: string) {
		super(`${NotContainSearchWordError.name}: ${message}`);
		this.name = "NotContainSearchWordError";
	}
}

function getUnCommitTodoList(repoAbsPath: string): UnCommitTodoList {
	const cmd = `git -C ${repoAbsPath} diff \
									 | grep -E ${searchWordGit.source} | grep '^+'`;
	// +                       // TODO: implement
	// +       // HACK: refactor

	const output = child_process.execSync(cmd).toString();

	// cut last "\n" and split by "\n"
	const searchResultArray = output.slice(0, -1).split("\n");
	const result = searchResultArray.map((output) => {
		const matchedWord = output.match(searchWordTS);
		if (!matchedWord) {
			throw new NotContainSearchWordError(output);
		}
		return {
			prefix: matchedWord[0].slice(0, -1),
			sourcePath: output.slice(1),
			line: 0,
			preview: "",
		};
	});
	return result;
}

function getCommittedTodoList(repoAbsPath: string): CommittedTodoList {
	const cmd = `cd ${repoAbsPath} &&
							 git -c grep.lineNumber=true grep -E ${searchWordGit.source} $(git branch --format='%(objectname) %(refname:short)' \
							 | sort | uniq -w 40 | cut -c 42-) \
							 || [ $? = 1 ] # if grep return 1, then return 0`;
	const gitGrepResult = child_process.execSync(cmd).toString();
	if (gitGrepResult === "") {
		return [];
	}

	// HACK: refactor
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
			throw new NotContainSearchWordError(output);
		}
		const prefix = matchedWord[0].slice(0, -1);
		const branch = output.slice(0, firstIndex);
		const sourcePath = output.slice(firstIndex + 1, secondIndex);
		const line = Number(output.slice(secondIndex + 1, thirdIndex));
		const preview = fullLine.slice(matchedWord.index);

		const cmd = `cd ${repoAbsPath} && git blame ${branch} -L ${line},${line} ${sourcePath}`;
		const blameOutput = child_process.execSync(cmd).toString();

		// get commit hash, author
		const commitHash = blameOutput.slice(0, 8);
		const author = blameOutput.split(" ")[1].slice(1);

		// const commitHash = blameOutput.slice(0, 40);
		return { prefix, branch, sourcePath, line, preview, commitHash, author };
	});
	return committedTodoList;
}

export class TodoListProvider implements vscode.TreeDataProvider<Dependency> {
	constructor(private workspaceRoot: string) {}

	getTreeItem(element: Dependency): vscode.TreeItem {
		return element;
	}

	getChildren(element?: Dependency): Thenable<Dependency[]> {
		if (!this.workspaceRoot) {
			vscode.window.showInformationMessage("No dependency in empty workspace");
			return Promise.resolve([]);
		}

		if (element) {
			return Promise.resolve(
				this.getDepsInPackageJson(
					path.join(
						this.workspaceRoot,
						"node_modules",
						element.label,
						"package.json",
					),
				),
			);
		}
		const packageJsonPath = path.join(this.workspaceRoot, "package.json");
		if (this.pathExists(packageJsonPath)) {
			return Promise.resolve(this.getDepsInPackageJson(packageJsonPath));
		}
		vscode.window.showInformationMessage("Workspace has no package.json");
		return Promise.resolve([]);
	}

	/**
	 * Given the path to package.json, read all its dependencies and devDependencies.
	 */
	private getDepsInPackageJson(packageJsonPath: string): Dependency[] {
		if (this.pathExists(packageJsonPath)) {
			const toDep = (moduleName: string, version: string): Dependency => {
				if (
					this.pathExists(
						path.join(this.workspaceRoot, "node_modules", moduleName),
					)
				) {
					return new Dependency(
						moduleName,
						version,
						vscode.TreeItemCollapsibleState.Collapsed,
					);
				}
				return new Dependency(
					moduleName,
					version,
					vscode.TreeItemCollapsibleState.None,
				);
			};

			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

			const deps = packageJson.dependencies
				? Object.keys(packageJson.dependencies).map((dep) =>
						toDep(dep, packageJson.dependencies[dep]),
				  )
				: [];
			const devDeps = packageJson.devDependencies
				? Object.keys(packageJson.devDependencies).map((dep) =>
						toDep(dep, packageJson.devDependencies[dep]),
				  )
				: [];
			return deps.concat(devDeps);
		}
		return [];
	}

	private pathExists(p: string): boolean {
		try {
			fs.accessSync(p);
		} catch (err) {
			return false;
		}
		return true;
	}
}

class Dependency extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		private version: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
	) {
		super(label, collapsibleState);
		this.tooltip = `${this.label}-${this.version}`;
		this.description = this.version;
	}
}

export function deactivate() {}
