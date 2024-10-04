import * as vscode from 'vscode';
import * as Parser from 'tree-sitter';
import * as CLang from 'tree-sitter-c';
import * as path from 'path';
import * as fs from 'fs';
import { preprocess, processCodeWithMacros } from './preprocess';

const simpleTypes: string[] = ["void", "char", "unsigned char", "short", "unsigned short", "int", "unsigned int",
    "long", "unsigned long", "long long", "unsigned long long", "float", "double", "long double"
];

// export type CType = SimpleType | StructType | UnionType;

export interface SimpleType {
    kind: "type";
    name: string;
}

// export interface StructType {
//     kind: "struct";
//     name: string;
//     members: { name: string, type: CType }[];
// }

// export interface UnionType {
//     kind: "union";
//     name: string;
//     members: { name: string, type: CType }[];
// }

export interface VariableInfo {
    kind: "variable"
    name: string;
    type: IdentifierInfo;
}

export interface FunctionInfo {
    kind: "function";
    name: string;
    returnType: IdentifierInfo;
    parameters: VariableInfo[];
}

export interface MethodInfo {
    kind: "method";
    name: string;
    returnType: IdentifierInfo;
    parameters: VariableInfo[];
}

export type MemberInfo = VariableInfo | FunctionInfo | MethodInfo; 

export interface StructInfo {
    kind: "struct";
    name: string;
    members: MemberInfo[];
}

export interface UnionInfo {
    kind: "union";
    name: string;
    members: MemberInfo[];
}

export interface PointerInfo {
    kind: "pointer";
    type: TypeInfo;
}

export type TypeInfo = SimpleType | StructInfo | UnionInfo;

export type IdentifierInfo = VariableInfo | FunctionInfo | TypeInfo;

export class IdentifierTable {
    public idTable: Record<string, IdentifierInfo[]> = {};
    private counter: number[] = [];
    private names: string[] = [];
    openScope(): any {
        this.counter.push(0);
    }
    closeScope(): any {
        const count: number = this.counter.pop() || 0;
        for (let i = 0; i < count; ++i) {
            let name = this.names.pop();
            if (name) {
                this.idTable[name].pop();
            }
        }
    }
    addIdentifier(identifier: IdentifierInfo): void {
        if (this.counter.length > 0) {
            this.counter[this.counter.length - 1]++;
        }
        if (!this.idTable[identifier.name]) {
            this.idTable[identifier.name] = [];
        }
        this.names.push(identifier.name);
        this.idTable[identifier.name].push(identifier);
    }
    constructor() {
        simpleTypes.forEach(name => {
            this.addIdentifier({kind: "type", name: name});
        });
    }
}



export function extractIdentifiers(document: vscode.TextDocument, position: vscode.Position) {
    let idTable: IdentifierTable = new IdentifierTable();
    const parser = new Parser.default;
    parser.setLanguage(CLang);
    const text = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    let macros: Record<string, string> = {};
    let [processedText] = preprocess(text, macros);
    processedText = processCodeWithMacros(processedText, macros);
    const tree = parser.parse(processedText);
    visitNode(tree.rootNode, idTable);
    return idTable;
}

export function identifierDisposable() {
    const identifierCompletionDisposable = vscode.languages.registerCompletionItemProvider({language: 'c'}, {
        provideCompletionItems(document, position, token, context) {
            const completionItems: vscode.CompletionItem[] = [];
            const idTable = extractIdentifiers(document, position);
            console.log('id');
            for (const identifiers of Object.values(idTable.idTable)) {
                
                if (identifiers.length > 0) {
                    const lastIdentifier = identifiers[identifiers.length - 1];
                    let completionLabel = lastIdentifier.name;
                    const completionItem = new vscode.CompletionItem(completionLabel);
                    let completionDetail = "";
                    //console.log(lastIdentifier.kind);
                    // Добавляем дополнительную информацию для функций
                    if (lastIdentifier.kind === "function") {
                        completionDetail += lastIdentifier.returnType.name;
                        //completionDetail += "function";
                        completionDetail += "(" + lastIdentifier.parameters.map(param => param.type.name + ' ' + param.name).join(", ") + ")";
                        completionItem.kind = vscode.CompletionItemKind.Function;
                    } else if (lastIdentifier.kind === "struct") {
                        completionDetail = "struct";
                        completionItem.kind = vscode.CompletionItemKind.Struct;
                    } else if (lastIdentifier.kind === "union") {
                        completionDetail = "union";
                        completionItem.kind = vscode.CompletionItemKind.Struct;
                    } else if (lastIdentifier.kind === "variable") {
                        completionDetail = lastIdentifier.type.name;
                        completionItem.kind = vscode.CompletionItemKind.Variable;
                    }

                    // Создаем CompletionItem и добавляем его в список
                    
                    completionItem.detail = completionDetail;
                    completionItems.push(completionItem);
                }
            }
            return completionItems;
        }
    });
    return identifierCompletionDisposable;
}

export function memberDisposable() {
    const memberCompletionDisposable = vscode.languages.registerCompletionItemProvider({language: 'c'}, {
        provideCompletionItems(document, position, token, context) {
            const completionItems: vscode.CompletionItem[] = [];
            const text = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
            const match = text.match(/(\w+(\.\w+)*)\.(\w*)$/);
            if (!match) {
                return completionItems;
            }

            const identifierChain = match[1].split('.');
            const idTable = extractIdentifiers(document, position);
            const variable = findVariableInfo(identifierChain[0], idTable);
            
            if (!variable) {
                console.log('non var');
                return completionItems;
            }
            let currentType = variable.type;
            let variableChain = identifierChain[0];
            
            for (let i = 1; i < identifierChain.length; i++) {
                if (!(currentType.kind === 'struct' || currentType.kind === 'union')) {
                    console.log('not struct or union');
                    return completionItems;
                }
                const member = currentType.members!.find(member => member.name === identifierChain[i]);

                if (!member) {
                    console.log('no member');
                    return completionItems; // Member not found
                }
                if (member.kind !== "variable") {
                    return completionItems;
                }
                currentType = member.type;
                variableChain += `.${identifierChain[i]}`;
            }
            
            if (currentType.kind === 'struct' || currentType.kind === 'union') {
                const compositeType = currentType;
                compositeType.members!.forEach(member => {
                    if (member.kind === "variable") {
                        const item = new vscode.CompletionItem(member.name, vscode.CompletionItemKind.Field);
                        item.detail = member.type.name;
                        completionItems.push(item);
                    }
                    if (member.kind === "function") {
                        const item = new vscode.CompletionItem(member.name, vscode.CompletionItemKind.Function);
                        item.detail = member.returnType.name;
                        item.detail += "(" + member.parameters.map(param => param.type.name + ' ' + param.name).join(", ") + ")";
                    }
                    if (member.kind === "method") {
                        const item = new vscode.CompletionItem(member.name, vscode.CompletionItemKind.Method);
                        item.detail = member.returnType.name;
                        item.detail += "(" + member.parameters.map(param => param.type.name + ' ' + param.name).join(", ") + ")";
                        const startPos = position.translate(0, -variableChain.length - 1);
                        const range = new vscode.Range(startPos, position);
                        item.additionalTextEdits = [vscode.TextEdit.replace(range, '')];
                        item.insertText = new vscode.SnippetString(`${member.name}(${variableChain}$0)`);
                        completionItems.push(item);
                    }
                });
            }

            return completionItems;
        },
    }, '.');

    return memberCompletionDisposable;
}

function findVariableInfo(name: string, idTable: IdentifierTable): VariableInfo | undefined {
    const variables = idTable.idTable[name];
    if (variables && variables.length > 0) {
        return variables[variables.length - 1] as VariableInfo;
    }
    return undefined;
}

function visitNode(node: Parser.SyntaxNode, idTable: IdentifierTable) {
    switch (node.type) {
        case 'compound_statement':
            idTable.openScope();
            node.children.forEach(child => {
                visitNode(child, idTable);
            });
            idTable.closeScope();
            break;
        case 'if_statement':
            const ifStatementChildren = node.children;
            const conditionNode = ifStatementChildren.find(child => child.type === 'condition');
            const consequenceNode = ifStatementChildren.find(child => child.type === 'consequence');
            const alternativeNode = ifStatementChildren.find(child => child.type === 'alternative');
            if (conditionNode && consequenceNode) {
                visitNode(conditionNode, idTable);
                visitNode(consequenceNode, idTable);
            }

            if (alternativeNode) {
                visitNode(alternativeNode, idTable);
            }
            break;
        case 'while_statement':
            node.children.forEach(child => {
                visitNode(child, idTable);
            });
            break;
        case 'for_statement':
            node.children.forEach(child => {
                visitNode(child, idTable);
            });
            break;
        case 'function_definition': // Определение функции
            handleFunctionDefinition(node, idTable);
            break;
        case 'declaration':
            handleDeclaration(node, idTable);
            break;
        case 'struct_specifier': // Объявление структуры
            handleStructDeclaration(node, idTable);
            break;
        case 'union_specifier': // Объявление union
            handleUnionDeclaration(node, idTable);
            break;
        // case 'preproc_include':
        //     handleIncludeDirective(node, idTable);
        //     break;
        default:
            node.children.forEach(child => {
                visitNode(child, idTable);
            });
            break;
    }
}

export function handleIncludeDirective(node: Parser.SyntaxNode, idTable: IdentifierTable) {
    const headerFileNode = node.children.find(child => child.type === 'string_literal' || child.type === 'system_lib_string');
    if (!headerFileNode) {
        return;
    }

    let headerPath = headerFileNode.text.slice(1, -1); // Remove quotes
    let fullHeaderPath = '';

    // Check if it's a system header (using <>)
    if (headerFileNode.type === 'system_lib_string') {
        // Try default system include paths
        const systemIncludePaths = ['/usr/include', '/usr/local/include'];
        for (const includePath of systemIncludePaths) {
            fullHeaderPath = path.resolve(includePath, headerPath);
            if (fs.existsSync(fullHeaderPath)) {
                console.log(`System header file found: ${fullHeaderPath}`);
                break;
            }
        }
    } else {
        const projectRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
        
        // Try to resolve relative to current file's directory

        // Try in the project root directory
        fullHeaderPath = path.resolve(projectRoot, headerPath);
        if (fs.existsSync(fullHeaderPath)) {
            console.log(`Local header file found: ${fullHeaderPath}`);
        } else {
            console.log(`Header file not found in local or system paths: ${headerPath}`);
            return;
        }
        
    }

    const headerContent = fs.readFileSync(fullHeaderPath, 'utf8');
    const parser = new Parser.default;
    parser.setLanguage(CLang);
    const headerNode = parser.parse(headerContent).rootNode;
    console.log(headerNode.toString());
    visitNode(headerNode, idTable);
}

// function getTypeFromString(typeStr: string, idTable: IdentifierTable): IdentifierInfo {
//     if (simpleTypes.includes(typeStr)) {
//         return { kind: "type", name: typeStr };
//     }

//     // Проверяем, существует ли тип среди структур
//     const structInfo = idTable.idTable[typeStr]?.find(identifier => identifier.kind === "struct");
//     if (structInfo) {
//         return structInfo as StructInfo;
//     }

//     // Проверяем, существует ли тип среди объединений
//     const unionInfo = idTable.idTable[typeStr]?.find(identifier => identifier.kind === "union");
//     if (unionInfo) {
//         return unionInfo as UnionInfo;
//     }

//     // Добавьте логику для других типов, если необходимо
//     return { kind: "type", name: typeStr };
// }

function handleDeclaration(node: Parser.SyntaxNode, idTable: IdentifierTable) {
    let typeNode = node.childForFieldName('type');
    const declaratorNode = node.childForFieldName('declarator');
    const functionDeclarationNode = node.descendantsOfType('function_declarator');
    if (functionDeclarationNode.length > 0) {
        handleFunctionDefinition(node, idTable);
    }

    if (typeNode && declaratorNode) {
        // if (typeNode.type === 'struct_specifier') {
        //     typeNode = typeNode.childForFieldName('name');
        // }
        const type = getTypeFromNode(typeNode!, idTable);
        
        let idNode = declaratorNode.descendantsOfType("identifier");
        if (idNode.length === 0) {
            return;
        }
        // if (declaratorNode.type === 'init_declarator') {
        //     idNode = declaratorNode.childForFieldName('declarator')!;
        // }
        const variable: VariableInfo = {
            kind: "variable",
            name: idNode[0].text,
            type: type
        };
        idTable.addIdentifier(variable);
    }
}


// TODO сделать правильную обработку объявления полей структуры
function handleStructDeclaration(node: Parser.SyntaxNode, idTable: IdentifierTable) {
    const structNameNode = node.childForFieldName('name');
    if (!structNameNode) {
        return;
    }
    const structInfo: StructInfo = {
        kind: 'struct',
        name: structNameNode.text,
        members: []
    };

    const memberDeclarations = node.descendantsOfType('field_declaration');
    memberDeclarations.forEach(memberNode => {
        const typeNode = memberNode.childForFieldName("type");
        //const nameNode = memberNode.childForFieldName("name");
        const nameNode = memberNode.descendantsOfType("field_identifier")[0];
        if (typeNode && nameNode) {
            //console.log('field declaration ' + nameNode?.text + ' with type: ' + typeNode.text);
            const memberType = getTypeFromNode(typeNode, idTable);
            structInfo.members.push({ kind: "variable", name: nameNode.text, type: memberType });
        }
    });

    idTable.addIdentifier(structInfo);
    
}

function handleUnionDeclaration(node: Parser.SyntaxNode, idTable: IdentifierTable) {
    const unionNameNode = node.childForFieldName('name');
    if (unionNameNode) {
        const unionInfo: UnionInfo = {
            kind: 'union',
            name: unionNameNode.text,
            members: []
        };

        const memberDeclarations = node.descendantsOfType('field_declaration');
        memberDeclarations.forEach(memberNode => {
            const typeNode = memberNode.child(0);
            const nameNode = memberNode.child(1);
            if (typeNode && nameNode) {
                const memberType = getTypeFromNode(typeNode, idTable);
                unionInfo.members.push({ kind: "variable", name: nameNode.text, type: memberType });
            }
        });

        idTable.addIdentifier(unionInfo);
    }
}

function getTypeFromNode(typeNode: Parser.SyntaxNode, idTable: IdentifierTable): IdentifierInfo {
    if (typeNode.type === "primitive_type") {
        return {kind: "type", name: typeNode.text};
    }
    let typeText = "";
    const types = typeNode.descendantsOfType("type_identifier");
    if (!types || types.length === 0) {
        typeText = typeNode.text;
    } else {
        typeText = types[0].text;
    }
    console.log("448 " + typeText);
    const variables = idTable.idTable[typeText];
    if (!variables || variables.length === 0) {
        return {kind: "type", name: typeText} as SimpleType;
    }
    console.log("453");
    return variables[variables.length - 1];
    if (typeNode.type === "primitive_type") {
        return {kind: "type", name: typeNode.text};
    }
    if (typeNode.type === "struct_specifier" || typeNode.type === "union_specifier") {
        const typeName = typeNode.childForFieldName("name")!.text;
        const structInfo = idTable.idTable[typeName]?.find(identifier => identifier.kind === "struct");
        if (structInfo) {
            return structInfo as StructInfo;
        }
        const unionInfo = idTable.idTable[typeName]?.find(identifier => identifier.kind === "union");
        if (unionInfo) {
            return unionInfo as UnionInfo;
        }
    }
    //const variables = idTable.idTable[typeNode.text];
    if (variables.length === 0) {
        return {kind: "type", name: typeNode.text} as SimpleType;
    }
    const identifier = variables[variables.length - 1];
    return identifier;
}

function handleFunctionDefinition(node: Parser.SyntaxNode, idTable: IdentifierTable) {
    const returnTypeNode = node.childForFieldName("type");
    const functionDeclaratorNode = node.descendantsOfType("function_declarator")[0];
    const functionNameNode = functionDeclaratorNode?.childForFieldName("declarator");
    const parameterListNode = functionDeclaratorNode?.childForFieldName("parameters");
    if (returnTypeNode && functionNameNode && parameterListNode) {
        const returnType = getTypeFromNode(returnTypeNode, idTable);
        const parameters: VariableInfo[] = [];
        let isFirst: boolean = true;
        let structType: StructInfo | undefined;
        parameterListNode.namedChildren.forEach(paramNode => {
            if (paramNode.type === "parameter_declaration") {
                const paramTypeNode = paramNode.childForFieldName("type");
                const paramNameNode = paramNode.childForFieldName("declarator");
                if (paramTypeNode && paramNameNode) {
                    const paramType = getTypeFromNode(paramTypeNode, idTable);
                    if (isFirst && (paramType.kind === "struct")) {
                        structType = paramType as StructInfo;
                    }
                    isFirst = false;
                    parameters.push({kind: "variable", name: paramNameNode.text, type: paramType });
                }
            }
        });
        const functionInfo: FunctionInfo = {
            kind: "function",
            name: functionNameNode.text,
            returnType: returnType,
            parameters: parameters
        };
        if (structType) {
            const methodInfo: MethodInfo = {
                kind: "method",
                name: functionNameNode.text,
                returnType: returnType,
                parameters: parameters
            };
            methodInfo.kind = "method";
            structType.members.push(methodInfo);
        }
        idTable.addIdentifier(functionInfo);
    }
    idTable.openScope();
    const bodyNode = node.childForFieldName('body');
    if (bodyNode) {
        bodyNode.children.forEach(child => {
            visitNode(child, idTable);
        });
    }
    idTable.closeScope();
}

