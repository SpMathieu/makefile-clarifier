import { match } from 'assert';
import * as vscode from 'vscode';
import * as mfSeeker from './makefile-seeker';
import * as fs from 'fs';
import { ExecException, exec, execSync } from 'child_process';

export class MakefileHoverProvider implements vscode.HoverProvider {
  private _makefileContext: MakefileContext;
  private _tmpFolder;

  constructor(makefileContext: MakefileContext, tmpFolder: string) {
    this._makefileContext = makefileContext;
    this._tmpFolder = tmpFolder;
  }

  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    const md = new vscode.MarkdownString();
    let hoveredVar = mfSeeker.identifyVariable(document, position);
    if (hoveredVar) {
      md.appendText(hoveredVar.name);
      let name = hoveredVar.name;
      // for (const originContext of this._makefileContext.getContexts()) {
      //   let context = JSON.parse(JSON.stringify(originContext));
      //   let newContext: mfSeeker.FileContext = {
      //     source: context.source,
      //     endingContext: {
      //       filePath: document.fileName,
      //       line: hoveredVar.range.start.line
      //     },
      //     context: context.context,
      //     isGenerated: false
      //   };
      //   let updateContext: mfSeeker.FileContext;
      //   let variableInContext: mfSeeker.MakefileVariable;
      //   let index;
      //   if (vscode.workspace.workspaceFolders !== undefined) {
      //     let WPLength = vscode.workspace.workspaceFolders[0].uri.path.length + 1;
      //     updateContext = await mfSeeker.generateContext(document, newContext);
      //     index = mfSeeker.matchingIndex(updateContext, name);
      //     if(name == 'PWD'){
      //       md.appendCodeblock(updateContext.source.substring(WPLength) + " : " + updateContext.source.substring(0,updateContext.source.lastIndexOf('/')), document.languageId)
      //     } else if (index == -1) {
      //       md.appendCodeblock(updateContext.source.substring(WPLength) + " : " + name + " IS UNDEFINED IN THIS CONTEXT", document.languageId);
      //     } else {
      //       variableInContext = updateContext.context[index];
      //       variableInContext = mfSeeker.unrollVariable(variableInContext, updateContext);
      //       md.appendCodeblock(updateContext.source.substring(WPLength) + " : " + variableInContext.recipe, document.languageId);
      //     }
      //   }else{
      //     updateContext = await mfSeeker.generateContext(document, newContext);
      //     index = mfSeeker.matchingIndex(updateContext, name);
      //     if (index == -1) {
      //       md.appendCodeblock(updateContext.source.substring(updateContext.source.lastIndexOf('/')+1) + " : " + name + " IS UNDEFINED IN THIS CONTEXT", document.languageId);
      //     } else {
      //       variableInContext = updateContext.context[index];
      //       variableInContext = mfSeeker.unrollVariable(variableInContext, updateContext);
      //       md.appendCodeblock(updateContext.source.substring(updateContext.source.lastIndexOf('/')+1) + " : " + variableInContext.recipe, document.languageId);
      //     }
      //   }
      // }
      for (const originContext of this._makefileContext.getContexts2()) {
        let context = JSON.parse(JSON.stringify(originContext));
        let newContextPath = context.context.replace(".mk", "-hover.mk");
        let newContext: mfSeeker.FileContext2 = {
          source: context.source,
          endingContext: {
            filePath: document.fileName,
            line: hoveredVar.range.start.line
          },
          context: newContextPath,
          lineInContext: context.lineInContext,
          isGenerated: false
        };
        fs.copyFileSync(originContext.context, newContextPath);
        let recipe = await mfSeeker.finishContext(newContextPath, document, newContext, hoveredVar);
        const makeCommand = 'make '+ recipe +' -f ' + newContextPath;
        try {
          let output = execSync(makeCommand, { encoding: 'utf8' });
          let shortSource = originContext.source;
          if (vscode.workspace.workspaceFolders !== undefined) {
            let WPLength = vscode.workspace.workspaceFolders[0].uri.path.length + 1;
            shortSource = originContext.source.substring(WPLength);
          }
        md.appendCodeblock(shortSource + " : " + output, document.languageId);
        } catch (e) {
          if(typeof e === "string"){
            vscode.window.showInformationMessage("Error: " + e);
          }else if(e instanceof Error){
            vscode.window.showInformationMessage("Error: " + e.message);
          }
        }
      }

      return new vscode.Hover(md, hoveredVar.range);
    }
    return null;

  }

}

export class MakefileContext {
  private _contexts: Array<mfSeeker.FileContext> = [];
  private _contexts2: Array<mfSeeker.FileContext2> = [];
  private _tmpFolderPath: string;

  constructor(tmpFolderPath: string) {
    this._tmpFolderPath = tmpFolderPath;
  }

  public getFilename(): string {
    let value = vscode.window.activeTextEditor?.document.uri.path;
    if (value) {
      return value.substring(value.lastIndexOf('/'));
    } else {
      return 'undefined';
    }

  }

  public getContexts(): Array<mfSeeker.FileContext> {
    return this._contexts;
  }

  public getContexts2(): Array<mfSeeker.FileContext2> {
    return this._contexts2;
  }

  public async updateContext() {
    if (fs.existsSync(this._tmpFolderPath)) {
      fs.rmSync(this._tmpFolderPath, { recursive: true, force: true });
      fs.mkdirSync(this._tmpFolderPath);
    }

    this._contexts = [];
    this._contexts2 = [];
    let makefiles = await vscode.workspace.findFiles('**/Makefile', null, 1000);
    let i = 0;
    for (const makefileURI of makefiles) {
      i++;
      let makefile = await vscode.workspace.openTextDocument(makefileURI);
      let endingContext = await mfSeeker.findEndingContext(makefile, makefileURI.path.substring(0, makefileURI.path.lastIndexOf("/")));
      if (endingContext.line !== -1) {
        let context: mfSeeker.FileContext = {
          source: makefileURI.path,
          endingContext: endingContext,
          context: [],
          isGenerated: false
        };
        let context2: mfSeeker.FileContext2 = {
          source: makefileURI.path,
          endingContext: endingContext,
          context: this._tmpFolderPath + "/context" + i + ".mk",
          lineInContext: 0,
          isGenerated: false
        };
        context = await mfSeeker.generateContext(makefile, context);
        context2 = await mfSeeker.generateContext2(makefile, context2, context2.context);
        this._contexts.push(context);
        this._contexts2.push(context2);
      } else if (makefileURI.path === vscode.window.activeTextEditor?.document.uri.path) {
        let context: mfSeeker.FileContext = {
          source: makefileURI.path,
          endingContext: endingContext,
          context: [],
          isGenerated: false
        };
        this._contexts.push(context);
      }
    }
    if (this._contexts.length == 0) {
      let context: mfSeeker.FileContext = {
        source: (vscode.window.activeTextEditor?.document.fileName as string),
        endingContext: {
          filePath: "none",
          line: -1
        },
        context: [],
        isGenerated: false
      };
      this._contexts.push(context);
    }
    console.log("");
  }
}
