import * as vscode from 'vscode';

const keywords = [
	'if', 'while', 'for', 'else', 'case', 'switch', 'typedef',
	'struct', 'union', 'volatile', 'const', 'return', 
	'do', 'continue', 'break', 'sizeof', 'static', 'enum'
];

const compItems: {[key: string]: any} = {};
compItems["for"] = {
	label: "for",
	kind: vscode.CompletionItemKind.Snippet,
	detail: 'Insert a for loop',
	insertText: new vscode.SnippetString(
		'for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n\t$0\n}'
	)
};


export function keywordDisposable() {
    let keywordsCompletionDisposable = vscode.languages.registerCompletionItemProvider({language: 'c'}, {
		provideCompletionItems(document, position, token, context) {
			
			let completionItems: vscode.CompletionItem[] = [];
			
			for (let keyword of keywords) {
				if (compItems[keyword]) {
					completionItems.push(compItems[keyword]);
				} else {
					completionItems.push({label: keyword, kind: vscode.CompletionItemKind.Keyword});
				}
				
			}
			
			return completionItems;
		}
	});
    return keywordsCompletionDisposable;
}