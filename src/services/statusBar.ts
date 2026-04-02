import * as vscode from 'vscode';

export class ManulStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  public constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'manul.runFile';
    this.item.name = 'ManulMcpServer';
    this.item.tooltip = 'Run the active .hunt file';
    this.setIdle();
  }

  public sync(editor: vscode.TextEditor | undefined): void {
    if (editor && this.isHuntDocument(editor.document)) {
      this.setReady();
      this.item.show();
      return;
    }

    this.item.hide();
  }

  public setReady(): void {
    this.item.text = 'ManulMcpServer: Ready';
    this.item.backgroundColor = undefined;
    this.item.tooltip = 'ManulMcpServer is ready to run the active .hunt file';
  }

  public setRunning(scope: string): void {
    this.item.text = `$(sync~spin) ManulMcpServer: ${scope}`;
    this.item.backgroundColor = undefined;
    this.item.tooltip = `ManulMcpServer is running ${scope.toLowerCase()}`;
    this.item.show();
  }

  public setWarning(message: string): void {
    this.item.text = '$(warning) ManulMcpServer: Attention';
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    this.item.tooltip = message;
    this.item.show();
  }

  public setError(message: string): void {
    this.item.text = '$(error) ManulMcpServer: Error';
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.item.tooltip = message;
    this.item.show();
  }

  public setIdle(): void {
    this.item.text = 'ManulMcpServer: Ready';
    this.item.backgroundColor = undefined;
    this.item.tooltip = 'Open a .hunt file to run ManulMcpServer';
  }

  public dispose(): void {
    this.item.dispose();
  }

  private isHuntDocument(document: vscode.TextDocument): boolean {
    return document.languageId === 'hunt' || document.uri.fsPath.endsWith('.hunt');
  }
}