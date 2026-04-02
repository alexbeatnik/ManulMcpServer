import * as vscode from 'vscode';

export class ManulOutputChannel implements vscode.Disposable {
  public readonly channel: vscode.OutputChannel;

  public constructor(name = 'ManulMcpServer') {
    this.channel = vscode.window.createOutputChannel(name);
  }

  public info(message: string): void {
    this.write('INFO', message);
  }

  public warn(message: string): void {
    this.write('WARN', message);
  }

  public error(message: string): void {
    this.write('ERROR', message);
  }

  public step(message: string): void {
    this.write('STEP', message);
  }

  public debug(label: string, value: unknown): void {
    const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    this.write('DEBUG', `${label}\n${body}`);
  }

  public reveal(preserveFocus = false): void {
    this.channel.show(preserveFocus);
  }

  public dispose(): void {
    this.channel.dispose();
  }

  private write(level: string, message: string): void {
    const timestamp = new Date().toISOString();
    this.channel.appendLine(`[${timestamp}] [${level}] ${message}`);
  }
}