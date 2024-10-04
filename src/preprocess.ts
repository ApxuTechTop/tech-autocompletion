import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { constants } from 'buffer';

interface PreprocessorDirective {
    type: string;
    value?: string[];
}

export function processCodeWithMacros(code: string, macros: Record<string, string> = {}): string {
    // Заменяем макросы на их значения
    const macroRegex = /defined\s*\(\s*(\w+)\s*\)|\b\w+\b/g;

    let cleanedCode = code;

    cleanedCode = cleanedCode.replace(macroRegex, (match, macroName) => {
        if (match && macros.hasOwnProperty(match)) {
            return macros[match];
        } else {
            return match; // Если макроса нет в списке, оставляем его как есть
        }
    });

    return cleanedCode;
}

export function preprocess(inputCode: string, macros: Record<string, string>, skipping: boolean = false): [string, number] {
    let processedCode = '';
    const lines: string[] = inputCode.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        let trimmedLine = lines[i].trim();
        if (!trimmedLine.startsWith('#')) {
            if (!skipping) {
                processedCode += lines[i] + '\n';
            }
            continue;
        }
        const directive = trimmedLine.slice(1).trim();
        const parts = directive.split(/\s+/);
        const directiveType = parts[0];
        const directiveValue = parts.slice(1);
        const preprocessorDirective: PreprocessorDirective = {
            type: directiveType,
            value: directiveValue.length > 0 ? directiveValue : undefined,
        };
        if (preprocessorDirective.type === 'else') {
            skipping = !skipping;
            continue;
        }
        switch (preprocessorDirective.type) {
            case 'if':
            case 'ifdef':
            case 'ifndef':
                const [newProcessedCode, parsedLines] = processConditionalDirective(preprocessorDirective, lines, i, macros);
                if (!skipping) {
                    processedCode += newProcessedCode;
                }
                i += parsedLines;
                break;
            case 'elif':
                if (skipping) {
                    skipping = !processElifDirective(preprocessorDirective, lines[i], macros);
                } else {
                    skipping = true;
                }
                break;
            case 'endif':
                return [processedCode, i];
        }
        if (!skipping) {
            switch (preprocessorDirective.type) {
                case 'include':
                    processedCode += handleIncludeDirective(preprocessorDirective, macros);
                    break;
                case 'define':
                    handleDefineDirective(preprocessorDirective, lines, i, macros);
                    break;
                case 'undef':
                    handleUndefDirective(preprocessorDirective, macros);
                    break;
            }
        }
    }
    return [processedCode, lines.length];
}

export function evaluatePreprocessorExpression(expression: string, macros: Record<string, string> = {}): boolean {
    try {
        const macroRegex = /defined\((\w+)\)/g;
        let cleanedExpression = expression.replace(/\s+/g, '');
        // TODO проверить правильность macroName
        cleanedExpression = cleanedExpression.replace(macroRegex, (_, macroName) => {
            console.log(_, macroName);
            return macros.hasOwnProperty(macroName) ? '1' : '0';
        });
        console.log(cleanedExpression);

        for (const [key, value] of Object.entries(macros)) {
            const regex = new RegExp(`\\b${key}\\b`, 'g');
            cleanedExpression = cleanedExpression.replace(regex, value);
        }
        return parseBooleanExpression(cleanedExpression);
    } catch (error) {
        console.error("Error evaluating expression:", error);
        return false;
    }
}

function parseBooleanExpression(expression: string): boolean {
    const tokens = expression.split(/\s*(&&|\|\||[()])\s*/);

    let currentValue: boolean | undefined;
    let operator: string | undefined;

    for (const token of tokens) {
        if (token === ' ') {
            continue;
        }
        if (token === '&&') {
            operator = '&&';
        } else if (token === '||') {
            operator = '||';
        } else if (token === '(') {
            // Пропускаем открытые скобки
        } else if (token === ')') {
            // Пропускаем закрытые скобки
        } else {
            // Обработка логических операций и макросов
            const value = token === '1' || token === 'true';

            if (currentValue === undefined) {
                currentValue = value;
            } else if (operator === '&&') {
                currentValue = currentValue && value;
            } else if (operator === '||') {
                currentValue = currentValue || value;
            } else {
                currentValue = value;
            }
        }
    }

    return currentValue || false; // Вернуть текущее значение или false по умолчанию
}

function processElifDirective(preprocessorDirective: PreprocessorDirective, line: string, macros: Record<string, string>): boolean {
    const expression = preprocessorDirective.value?.join();
    return !evaluatePreprocessorExpression(expression!, macros);
}

function processConditionalDirective(preprocessorDirective: PreprocessorDirective, lines: string[], i: number, macros: Record<string, string>): [string, number] {
    let processedCode: string = "";
    let skipping = false;
    if (preprocessorDirective.type === "if") {
        const expression = preprocessorDirective.value?.join();
        skipping = !evaluatePreprocessorExpression(expression!, macros);
    } else {
        let word = preprocessorDirective.value![0];
        skipping = preprocessorDirective.type === "ifdef" ? !Boolean(macros[word]) : Boolean(macros[word]);
    }
    [processedCode, i] = preprocess(lines.slice(i + 1).join('\n'), macros, skipping);
    return [processedCode, i + 1];
}

function handleDefineDirective(directive: PreprocessorDirective, lines: string[], i: number, macros: Record<string, string>) {
    let words = directive.value!.slice(1);
    words = words.map(word => macros[word] ? macros[word] : word);
    macros[directive.value![0]] = words.join(' ');
}

function handleUndefDirective(directive: PreprocessorDirective, macros: Record<string, string>) {
    delete macros[directive.value![0]];
}



function handleIncludeDirective(directive: PreprocessorDirective, macros: Record<string, string>): string {
    if (!directive.value) {
        return "";
    };
    
    let headerPath = directive.value.join(''); // Remove quotes
    let isLocal = headerPath.startsWith('"');
    headerPath = headerPath.slice(1, -1);
    const projectRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
    const systemIncludePaths = ['/usr/include', '/usr/local/include', '/usr/include/x86_64-linux-gnu', '/usr/lib/gcc/x86_64-linux-gnu/11/include'];
    let fullHeaderPath = '';

    if (isLocal) {
        fullHeaderPath = path.resolve(projectRoot, headerPath);
    } else {
        for (const includePath of systemIncludePaths) {
            const result = path.resolve(includePath, headerPath);
            if (result) {
                fullHeaderPath = result;
                break;
            }
        }
        //return "";
    }

    let processedCode = "";
    if (fs.existsSync(fullHeaderPath)) {
        const headerContent = fs.readFileSync(fullHeaderPath, 'utf8');
        const [processedHeader, i] = preprocess(headerContent, macros);
        processedCode += processedHeader + '\n';
    }
    return processedCode;
}

function findHeaderFileSync(headerPath: string, baseDir: string): string | null {
    const files = fs.readdirSync(baseDir);
    console.log(headerPath);
    for (const file of files) {
        const fullPath = path.join(baseDir, file);
        
        if (fs.statSync(fullPath).isDirectory()) {
            const result = findHeaderFileSync(headerPath, fullPath);
            if (result) {
                return result;
            }
        } else if (fullPath.endsWith(headerPath)) {
            return fullPath;
        }
    }

    return null;
}