import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
//import * as myExtension from './../extension';
import {processCodeWithMacros} from './../preprocess';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Process code with macros - basic replacement', () => {
        const code = `
            #define VALUE1 100
            #define VALUE2 200
            int main() {
                int x = VALUE1;
                int y = VALUE2;
                return 0;
            }
        `;
        const macros = {
            VALUE1: '500',
            VALUE2: '1000'
        };
        const expectedCode = `
            #define VALUE1 500
            #define VALUE2 1000
            int main() {
                int x = 500;
                int y = 1000;
                return 0;
            }
        `;
        const processedCode = processCodeWithMacros(code, macros);
        assert.strictEqual(processedCode.trim(), expectedCode.trim());
    });

    test('Process code with macros - undefined macros', () => {
        const code = `
            #define VALUE1 100
            #define VALUE2 200
            int main() {
                int x = VALUE1;
                int y = VALUE3; // Undefined macro
                return 0;
            }
        `;
        const macros = {
            VALUE1: '500',
            VALUE2: '1000'
        };
        const expectedCode = `
            #define VALUE1 500
            #define VALUE2 1000
            int main() {
                int x = 500;
                int y = VALUE3; // Undefined macro, should remain unchanged
                return 0;
            }
        `;
        const processedCode = processCodeWithMacros(code, macros);
        assert.strictEqual(processedCode.trim(), expectedCode.trim());
    });
});
