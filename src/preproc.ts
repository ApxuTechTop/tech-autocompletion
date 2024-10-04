import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function preprocDisposable() {
    let preprocCompletionDisposable = vscode.languages.registerCompletionItemProvider({language: 'c'}, {
		provideCompletionItems(document, position, token, context) {
            let text = document.lineAt(position).text;
			let linePrefix = text.substring(0, position.character);
			if (linePrefix.trim() !== '#') {
				return [];
			}
			let completionItems: vscode.CompletionItem[] = [];
			completionItems.push({label: 'include', kind: vscode.CompletionItemKind.Keyword, insertText: 'include'});
            completionItems.push({label: 'define', kind: vscode.CompletionItemKind.Keyword, insertText: 'define'});
            completionItems.push({label: 'pragma', kind: vscode.CompletionItemKind.Keyword, insertText: 'pragma'});
            completionItems.push({label: 'ifdef', kind: vscode.CompletionItemKind.Keyword, insertText: 'ifdef'});
            completionItems.push({label: 'ifndef', kind: vscode.CompletionItemKind.Keyword, insertText: 'ifndef'});
            completionItems.push({label: 'if', kind: vscode.CompletionItemKind.Keyword, insertText: 'if'});
            completionItems.push({label: 'elif', kind: vscode.CompletionItemKind.Keyword, insertText: 'elif'});
            completionItems.push({label: 'else', kind: vscode.CompletionItemKind.Keyword, insertText: 'else'});
            completionItems.push({label: 'endif', kind: vscode.CompletionItemKind.Keyword, insertText: 'endif'});
			return completionItems;
		}
	}, '#');
    return preprocCompletionDisposable;
}