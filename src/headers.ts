import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';




export function headerDisposable() {
    let headersCompletionDisposable = vscode.languages.registerCompletionItemProvider({ language: 'c' }, {
        provideCompletionItems: async (document, position, token, context) => {
            let linePrefix = document.lineAt(position).text.substring(0, position.character);
            if (!linePrefix.includes('#include')) {
                return [];
            }
            const headerFiles = await getAllHeaderFiles();
            return Array.from(headerFiles.keys()).map(fileName => {
                const item = new vscode.CompletionItem(fileName, vscode.CompletionItemKind.File);
                item.detail = headerFiles.get(fileName);
                return item;
            });
        }
    }, '<', '"');
    return headersCompletionDisposable;
}

async function getIncludePathsFromCppProperties(): Promise<string[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
    if (!workspaceFolder) {
        return [];
    }

    const configPath = path.join(workspaceFolder, '.vscode', 'c_cpp_properties.json');
    if (!fs.existsSync(configPath)) {
        return [];
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const includePaths: string[] = [];

    if (config.configurations && config.configurations.length > 0) {
        const configuration = config.configurations[0];
        if (configuration.includePath && Array.isArray(configuration.includePath)) {
            configuration.includePath.forEach((includePath: string) => {
                const resolvedPath = includePath.replace('${workspaceFolder}', workspaceFolder);
                includePaths.push(resolvedPath);
            });
        }
    }

    return includePaths;
}

async function findHeaderFilesInWorkspace(): Promise<string[]> {
    const files = await vscode.workspace.findFiles('**/*.h');
    return files.map(uri => uri.fsPath);
}

// function findHeaderFilesInDirectory(directory: string): string[] {
//     let headerFiles: string[] = [];
//     const files = fs.readdirSync(directory);
//     for (const file of files) {
//         const fullPath = path.join(directory, file);
//         if (!fs.statSync(fullPath).isDirectory() && path.extname(fullPath) === '.h') {
//             headerFiles.push(fullPath);
//         }
//     }
//     return headerFiles;
// }

function findHeaderFilesInDirectory(directory: string): string[] {
    return fs.readdirSync(directory)
        .map(file => path.join(directory, file))
        .filter(fullPath => !fs.statSync(fullPath).isDirectory() && path.extname(fullPath) === '.h');
}
const standardIncludePaths = ['/usr/include', '/usr/local/include'];
function findHeaderFilesInStandardPaths(): string[] {
    let headerFiles: string[] = [];
    for (const includePath of standardIncludePaths) {
        headerFiles = headerFiles.concat(findHeaderFilesInDirectory(includePath));
    }
    return headerFiles;
}

async function findHeaderFilesInPaths(includePaths: string[]): Promise<string[]> {
    let headerFiles: string[] = [];
    for (const includePath of includePaths) {
        headerFiles = headerFiles.concat(findHeaderFilesInDirectory(includePath));
    }
    return headerFiles;
}

async function getAllHeaderFiles(): Promise<Map<string, string>> {
    const headerFiles = new Map<string, string>();

    const workspaceHeaders = await findHeaderFilesInWorkspace();
    const standardHeaders = findHeaderFilesInStandardPaths();
    const cppPropertiesIncludePaths = await getIncludePathsFromCppProperties();
    const cppPropertiesHeaders = await findHeaderFilesInPaths(cppPropertiesIncludePaths);

    workspaceHeaders.concat(standardHeaders, cppPropertiesHeaders).forEach(filePath => {
        const fileName = path.basename(filePath);
        if (!headerFiles.has(fileName)) {
            headerFiles.set(fileName, filePath);
        }
    });

    return headerFiles;
}


