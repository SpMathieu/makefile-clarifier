// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as mkProvider from './makefile-hover-provider';
// import VerilogHoverProvider from './verilog-hover-provider';
import * as fs from 'fs';
import { exec } from 'child_process';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, hover-provider-sample extension is active!');

	const tmpFolderPath = context.extensionPath + "/tmp";
	if (!fs.existsSync(tmpFolderPath)) {
		fs.mkdirSync(tmpFolderPath);
	}
	let makefileContext = new mkProvider.MakefileContext(tmpFolderPath);


	// Update on editor switch.
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(
		(textEditor) => {
			if (textEditor === undefined) {
				return;
			}
			if (vscode.workspace.workspaceFolders === undefined) {
				return;
			}
			if (textEditor.document.languageId !== 'makefile') {
				return;
			}
			makefileContext.updateContext();
			console.log("");
		}
	));
	
	if (typeof (vscode.window.activeTextEditor) !== undefined) {
		makefileContext.updateContext();
	}

	const hoverProvider = new mkProvider.MakefileHoverProvider(makefileContext, tmpFolderPath);

	vscode.languages.registerHoverProvider('makefile', hoverProvider);
}
