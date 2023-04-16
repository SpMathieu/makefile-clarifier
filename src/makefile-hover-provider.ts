import { match } from 'assert';
import * as vscode from 'vscode';
import * as mfSeeker from './makefile-seeker';


export class MakefileHoverProvider implements vscode.HoverProvider {
  private _makefileContext: MakefileContext;

  constructor(makefileContext: MakefileContext) {
    this._makefileContext = makefileContext;
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
      for (const originContext of this._makefileContext.getContexts()) {
        let context = JSON.parse(JSON.stringify(originContext));
        let newContext: mfSeeker.FileContext = {
          source: context.source,
          endingContext: {
            filePath: document.fileName,
            line: hoveredVar.range.start.line
          },
          context: context.context,
          isGenerated: false
        };
        let updateContext: mfSeeker.FileContext;
        let variableInContext: mfSeeker.MakefileVariable;
        let index;
        if (vscode.workspace.workspaceFolders !== undefined) {
          let WPLength = vscode.workspace.workspaceFolders[0].uri.path.length + 1;
          updateContext = await mfSeeker.generateContext(document, newContext);
          index = mfSeeker.matchingIndex(updateContext, name);
          if (index == -1) {
            md.appendCodeblock(updateContext.source.substring(WPLength) + " : " + name + " IS UNDEFINED IN THIS CONTEXT", document.languageId);
          } else {
            variableInContext = updateContext.context[index];
            variableInContext = mfSeeker.unrollVariable(variableInContext, updateContext);
            md.appendCodeblock(updateContext.source.substring(WPLength) + " : " + variableInContext.recipe, document.languageId);
          }
        }else{
          updateContext = await mfSeeker.generateContext(document, newContext);
          index = mfSeeker.matchingIndex(updateContext, name);
          if (index == -1) {
            md.appendCodeblock(updateContext.source.substring(updateContext.source.lastIndexOf('/')+1) + " : " + name + " IS UNDEFINED IN THIS CONTEXT", document.languageId);
          } else {
            variableInContext = updateContext.context[index];
            variableInContext = mfSeeker.unrollVariable(variableInContext, updateContext);
            md.appendCodeblock(updateContext.source.substring(updateContext.source.lastIndexOf('/')+1) + " : " + variableInContext.recipe, document.languageId);
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


  public async updateContext() {
    this._contexts = [];
    let makefiles = await vscode.workspace.findFiles('**/Makefile', null, 1000);
    for (const makefileURI of makefiles) {
      let makefile = await vscode.workspace.openTextDocument(makefileURI);
      let endingContext = await mfSeeker.findEndingContext(makefile);
      if (endingContext.line !== -1) {
        let context: mfSeeker.FileContext = {
          source: makefileURI.path,
          endingContext: endingContext,
          context: [],
          isGenerated: false
        };
        context = await mfSeeker.generateContext(makefile, context);
        this._contexts.push(context);
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
    if(this._contexts.length == 0){
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
