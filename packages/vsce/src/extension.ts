import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand(
		"todo-list-for-teams.helloWorld",
		() => {
			import("../core").then((module) => {
				console.log(module.add(1, 2));
			});
		},
	);

	context.subscriptions.push(disposable);
}

export function deactivate() {}
