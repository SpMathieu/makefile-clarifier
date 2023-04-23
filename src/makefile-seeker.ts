import { Console } from 'console';
import exp = require('constants');
import { type } from 'os';
import path = require('path');
import { start } from 'repl';
import { text } from 'stream/consumers';
import * as vscode from 'vscode';
import { MakefileContext } from './makefile-hover-provider';
import * as fs from 'fs';

export type MakefileVariable = {
    name: string,
    recipe: string,
    source: string,
    range: vscode.Range
};

type Definition = {
    text: string,
    nbRecipe: number,
    lineIndexes: Array<number>,
    definitionLengths: Array<number>
};

export type EndingContext = {
    filePath: string;
    line: number;
};

export type FileContext = {
    source: string,
    endingContext: EndingContext,
    context: Array<MakefileVariable>,
    isGenerated: boolean
};

export type FileContext2 = {
    source: string,
    endingContext: EndingContext,
    context: string,
    lineInContext: number,
    isGenerated: boolean
};


/**
 * Select the hovered variable
 * 
 * @param document context
 * @param position cursorPosition
 * @returns return a MakefileVariable if the cursor is on a variable else return null
 */
export function identifyVariable(
    document: vscode.TextDocument,
    position: vscode.Position
): MakefileVariable | null {
    let line = document.lineAt(position.line).text;
    let i = position.character;
    let dollarPosition = null;
    let endBracketPosition = null;
    while (i >= 0) {
        if (line.charAt(i) == '$' && line.charAt(i + 1) == '(') {
            dollarPosition = i;
            break;
        }
        if (line.charAt(i) == ' ') {
            break;
        }
        i--;
    }
    if (dollarPosition == null) {
        return null;
    }
    i = position.character;
    while (i < line.length) {
        if (line.charAt(i) == ')') {
            endBracketPosition = i;
            break;
        }
        if (line.charAt(i) == ' ') {
            break;
        }
        i++;
    }
    if (endBracketPosition == null) {
        return null;
    }

    return {
        name: line.substring(dollarPosition + 2, endBracketPosition),
        recipe: line.substring(dollarPosition, endBracketPosition + 1),
        source: document.uri.path,
        range: new vscode.Range(
            new vscode.Position(position.line, dollarPosition),
            new vscode.Position(position.line, endBracketPosition))
    };
}

export async function generateContext(
    document: vscode.TextDocument,
    fileContext: FileContext
): Promise<FileContext> {
    let i = 0;
    let line = "";
    let match;
    let endingLine: number;
    let index: number;
    let variable: string;
    let value: string;
    let context = fileContext;
    const regQM = /\s*\?\=\s*/;
    const regEq = /\s*\=\s*/;
    const regDD = /\s*\:\=\s*/;
    const regPlus = /\s*\+\=\s*/;
    const regInc = /include\s+/;
    if (document.fileName !== fileContext.endingContext.filePath) {
        endingLine = document.lineCount;
    } else {
        endingLine = fileContext.endingContext.line;
    }

    while (i < endingLine && context.isGenerated === false) {
        line = document.lineAt(i).text;
        i++;
        if (regInc.test(line)) {
            let path = includePath(fileContext.source.substring(0, fileContext.source.lastIndexOf('/')), line.replace(regInc, ''));
            let includeDoc = await vscode.workspace.openTextDocument(path);
            context = await generateContext(includeDoc, context);
        } else if (regQM.test(line)) {
            match = line.match(regQM)![0];
            variable = line.substring(0, line.indexOf(match));
            value = line.substring(line.indexOf(match) + match.length);
            index = matchingIndex(context, variable);
            if (index == -1) {
                context.context.push(
                    {
                        name: variable,
                        recipe: value,
                        source: document.uri.path,
                        range: new vscode.Range(
                            new vscode.Position(i - 1, line.indexOf(variable)),
                            new vscode.Position(i - 1, line.indexOf(variable) + variable.length))
                    }
                );
            }
        } else if (regPlus.test(line)) {
            match = line.match(regPlus)![0];
            variable = line.substring(0, line.indexOf(match));
            value = line.substring(line.indexOf(match) + match.length);
            index = matchingIndex(context, variable);
            if (index == -1) {
                context.context.push(
                    {
                        name: variable,
                        recipe: value,
                        source: document.uri.path,
                        range: new vscode.Range(
                            new vscode.Position(i - 1, line.indexOf(variable)),
                            new vscode.Position(i - 1, line.indexOf(variable) + variable.length))
                    }

                );
            } else {
                context.context[index].source = document.uri.path;
                context.context[index].range = new vscode.Range(
                    new vscode.Position(i - 1, line.indexOf(variable)),
                    new vscode.Position(i - 1, line.indexOf(variable) + variable.length));
                context.context[index].recipe += " " + value;
            }
        } else if (regDD.test(line)) {
            match = line.match(regDD)![0];
            variable = line.substring(0, line.indexOf(match));
            value = line.substring(line.indexOf(match) + match.length);
            index = matchingIndex(context, variable);
            if (index == -1) {
                let varToPush = {
                    name: variable,
                    recipe: value,
                    source: document.uri.path,
                    range: new vscode.Range(
                        new vscode.Position(i - 1, line.indexOf(variable)),
                        new vscode.Position(i - 1, line.indexOf(variable) + variable.length))
                };
                varToPush = unrollVariable(varToPush, context);
                context.context.push(varToPush);
            } else {
                context.context[index].source = document.uri.path;
                context.context[index].range = new vscode.Range(
                    new vscode.Position(i - 1, line.indexOf(variable)),
                    new vscode.Position(i - 1, line.indexOf(variable) + variable.length));
                context.context[index].recipe = value;
            }
        } else if (regEq.test(line)) {
            match = line.match(regEq)![0];
            variable = line.substring(0, line.indexOf(match));
            value = line.substring(line.indexOf(match) + match.length);
            index = matchingIndex(context, variable);
            if (index == -1) {
                context.context.push(
                    {
                        name: variable,
                        recipe: value,
                        source: document.uri.path,
                        range: new vscode.Range(
                            new vscode.Position(i - 1, line.indexOf(variable)),
                            new vscode.Position(i - 1, line.indexOf(variable) + variable.length))
                    }

                );
            } else {
                context.context[index].source = document.uri.path;
                context.context[index].range = new vscode.Range(
                    new vscode.Position(i - 1, line.indexOf(variable)),
                    new vscode.Position(i - 1, line.indexOf(variable) + variable.length));
                context.context[index].recipe = value;
            }
        }
    }

    if (document.fileName === fileContext.endingContext.filePath) {
        context.isGenerated = true;
    }

    return context;
}

export async function generateContext2(
    document: vscode.TextDocument,
    fileContext: FileContext2,
    tmpFilePath: string
): Promise<FileContext2> {
    let i = 0;
    let line = "";
    let match;
    let endingLine: number;
    let index: number;
    let variable: string;
    let value: string;
    let context = fileContext;
    const regInc = /include\s+/;
    const regPW1 = /\$\(PWD\)/;
    const regPW2 = /\$\(shell\s+pwd\)/;
    if (document.fileName !== fileContext.endingContext.filePath) {
        endingLine = document.lineCount;
    } else {
        endingLine = fileContext.endingContext.line;
    }

    while (i < endingLine && context.isGenerated === false) {
        line = document.lineAt(i).text;
        i++;
        if (regInc.test(line)) {
            let path = includePath(fileContext.source.substring(0, fileContext.source.lastIndexOf('/')), line.replace(regInc, ''));
            let includeDoc = await vscode.workspace.openTextDocument(path);
            fs.appendFileSync(tmpFilePath, "###################################"+ path +"###################################\n", "utf-8");
            context.lineInContext++;
            context = await generateContext2(includeDoc, context, tmpFilePath);
        } else {
            let SPLength = fileContext.source.lastIndexOf("/");
            let pwd = fileContext.source.substring(0,SPLength); 
            fs.appendFileSync(tmpFilePath, line.replace(regPW1,pwd).replace(regPW2, pwd)+"\n", "utf-8");
            context.lineInContext++;
        }
    }

    if (document.fileName === fileContext.endingContext.filePath) {
        context.isGenerated = true;
    }

    return context;
}

export async function finishContext(
    // contextPath: string,
    // endingContext: EndingContext,
    // activeDoc: vscode.TextDocument,
    // makefileVar: MakefileVariable

    contextPath: string,
    activeDoc: vscode.TextDocument,
    fileContext: FileContext2,
    makefileVar: MakefileVariable
    
): Promise<string> {
    let i = 0;
    fs.appendFileSync(contextPath, "###################################"+ activeDoc.uri.path +"###################################\n", "utf-8");
    let context = await generateContext2(activeDoc,fileContext, contextPath);
    fs.appendFileSync(contextPath, "\n\n\n###################################"+ " Makefile Clarifier " +"###################################\n\n", "utf-8");
    let makefileRecipe = "makefile-clairifier-"+makefileVar.name;
    fs.appendFileSync(contextPath, "\n"+makefileRecipe+":\n\t@echo "+makefileVar.recipe , "utf-8");
    return makefileRecipe;
}


/**
 * Identify variable present in a line
 * @param definition 
 * @param source 
 * @returns 
 */
export function identifyVariablesInLine(
    definition: Definition,
    source: string
): Array<MakefileVariable> | null {
    let output: MakefileVariable[] = [];
    let regVar = RegExp('\\$\\([\\w]*\\)');
    if (definition.nbRecipe == 1) {
        let line = definition.text;
        let mfVar;
        while (regVar.exec(line) !== null) {
            mfVar = (regVar.exec(line) as RegExpExecArray)[0];
            output.push({
                name: mfVar.substring(2, mfVar.length - 1),
                recipe: mfVar,
                source: source,
                range: new vscode.Range(
                    new vscode.Position(definition.lineIndexes[0], definition.text.indexOf(mfVar)),
                    new vscode.Position(definition.lineIndexes[0], definition.text.indexOf(mfVar) + mfVar.length))
            });
            line = line.substring(definition.text.indexOf(mfVar) + mfVar.length);
        }
    } else {
        console.log("breal");
    }


    if (output.length == 0) {
        return null;
    }

    return output;
}

/**
 * Generate absolute path from relative path
 * @param contextPath absolute path where the relative call is
 * @param includePath the relative call
 * @returns absolute path to the include call
 */
export function includePath(
    contextPath: string,
    includePath: string
): string {
    if (includePath.charAt(0) == '/') {
        return includePath;
    } else {
        let newPath = contextPath;
        let pathAddOn = includePath;
        while (pathAddOn.charAt(0) == '.') {
            if (pathAddOn.charAt(1) == '.') {
                pathAddOn = pathAddOn.substring(3);
                newPath = newPath.substring(0, newPath.lastIndexOf('/'));
            } else {
                pathAddOn = pathAddOn.substring(1);
            }
        }
        if (pathAddOn.charAt(0) !== '/') {
            pathAddOn = '/' + pathAddOn;
        }
        newPath += pathAddOn;
        return newPath.replace(" ", "");
    }

}

/**
 * Give the index of the var in the fileContext
 * @param fileContext 
 * @param name 
 * @returns index of the var in fileContext, return -1 if doesn't exist
 */
export function matchingIndex(
    fileContext: FileContext,
    name: string
): number {
    let i = 0;
    while (i < fileContext.context.length) {
        if (name == fileContext.context[i].name) {
            break;
        }
        i++;
    }
    if (i == fileContext.context.length) {
        i = -1;
    }
    return i;
}

export async function findEndingContext(
    documentSource: vscode.TextDocument,
    sourcePath: string
): Promise<EndingContext> {
    let docSourcePath = documentSource.uri.path;
    let activeDocPath = vscode.window.activeTextEditor?.document.uri.path;
    let i = 0;
    let output: EndingContext;
    const regInc = /include\s+/;
    while (i < documentSource.lineCount) {
        let line = documentSource.lineAt(i).text;
        if (regInc.test(line)) {
            let includePathVar = line.replace(regInc, '');
            let path = includePath(sourcePath, includePathVar);
            if (path == activeDocPath) {
                return {
                    filePath: docSourcePath,
                    line: i
                };
            } else {
                if (fs.existsSync(path)) {
                    let nextDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(path));
                    let output = await findEndingContext(nextDoc, sourcePath);
                    if (output.line !== -1) {
                        return output;
                    }
                }
            }
        }
        i++;
    }
    return {
        filePath: "",
        line: -1
    };
}

export function unrollVariable(
    variable: MakefileVariable,
    fileContext: FileContext
): MakefileVariable {
    let unrolledVariable = variable;
    let recipe = unrolledVariable.recipe;
    let regVar = RegExp('\\$\\([\\w]*\\)');
    while (regVar.exec(recipe) !== null) {
        let varName = (regVar.exec(recipe) as RegExpExecArray)[0];
        let varShort = varName.substring(2, varName.length - 1);
        let index = matchingIndex(fileContext, varShort);
        if (varShort == "PWD") {
            recipe = recipe.replace(varName, fileContext.source.substring(0, fileContext.source.lastIndexOf("/")));
        } else if (index !== -1) {
            recipe = recipe.replace(varName, fileContext.context[index].recipe);
        } else {
            recipe = recipe.replace(varName, '');
            // recipe = recipe.replace(varName,'$(£'+varName.substring(2));
        }

    }

    // recipe = recipe.replace("£",'');
    unrolledVariable.recipe = recipe;

    return unrolledVariable;
}