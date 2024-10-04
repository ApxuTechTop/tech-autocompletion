// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import {IdentifierTable, extractIdentifiers, identifierDisposable, memberDisposable} from './identifiers';
import {headerDisposable} from './headers';
import {preprocDisposable} from './preproc';
import {keywordDisposable} from './keywords';


export function activate(context: vscode.ExtensionContext) {
	console.log("activated");
	let preprocCompletion = preprocDisposable();
	let headersCompletion = headerDisposable();
	let keywordsCompletion = keywordDisposable();
	let identifiersCompletion = identifierDisposable();
    let membersCompletion = memberDisposable();
	context.subscriptions.push(preprocCompletion);
	context.subscriptions.push(headersCompletion);
	context.subscriptions.push(keywordsCompletion);
	context.subscriptions.push(identifiersCompletion);
    context.subscriptions.push(membersCompletion);
}

export function deactivate() {
	console.log('Deactivated');
}
