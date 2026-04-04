import * as vscode from 'vscode';

import { dslContract } from '../config/contract';

const HUNT_SELECTOR: vscode.DocumentSelector = { language: 'hunt', scheme: 'file' };

export function registerCompletionProvider(): vscode.Disposable {
  return vscode.languages.registerCompletionItemProvider(
    HUNT_SELECTOR,
    {
      provideCompletionItems(document, position) {
        const linePrefix = document.lineAt(position).text.slice(0, position.character);
        const trimmed = linePrefix.trimStart();

        if (trimmed.startsWith('@')) {
          return buildMetadataItems();
        }

        if (trimmed.startsWith('[')) {
          return buildHookItems();
        }

        if (shouldSuggestQualifiers(trimmed)) {
          return buildQualifierItems();
        }

        if (trimmed.length === 0 || rawLineNeedsCommand(linePrefix)) {
          return [...buildCommandItems(), ...buildStructureItems()];
        }

        return [...buildCommandItems(), ...buildQualifierItems(), ...buildMetadataItems()];
      },
    },
    '@',
    '[',
    ' ',
    ':',
    "'",
  );
}

function buildCommandItems(): vscode.CompletionItem[] {
  return dslContract.commands
    .filter((command) => !['done', 'logical_step'].includes(command.id))
    .map((command, index) => {
      const item = new vscode.CompletionItem(command.label, vscode.CompletionItemKind.Snippet);
      item.detail = `${command.category} command`;
      item.documentation = buildMarkdownDocumentation(command.description, command.snippet, command.uiText);
      item.insertText = new vscode.SnippetString(command.snippet);
      item.sortText = `0-${index.toString().padStart(3, '0')}`;
      return item;
    });
}

function buildMetadataItems(): vscode.CompletionItem[] {
  return dslContract.metadata.map((directive, index) => {
    const item = new vscode.CompletionItem(directive.label, vscode.CompletionItemKind.Property);
    item.detail = 'metadata directive';
    item.documentation = buildMarkdownDocumentation(directive.description, directive.snippet, directive.uiText);
    item.insertText = new vscode.SnippetString(directive.snippet);
    item.sortText = `1-${index.toString().padStart(3, '0')}`;
    return item;
  });
}

function buildHookItems(): vscode.CompletionItem[] {
  return dslContract.hookBlocks.map((block, index) => {
    const item = new vscode.CompletionItem(block.label, vscode.CompletionItemKind.Snippet);
    item.detail = 'hook block';
    item.documentation = buildMarkdownDocumentation(block.description, block.snippet, block.label);
    item.insertText = new vscode.SnippetString(block.snippet);
    item.sortText = `2-${index.toString().padStart(3, '0')}`;
    return item;
  });
}

function buildQualifierItems(): vscode.CompletionItem[] {
  return dslContract.contextualQualifiers.map((qualifier, index) => {
    const item = new vscode.CompletionItem(qualifier.id.toUpperCase(), vscode.CompletionItemKind.Keyword);
    item.detail = 'contextual qualifier';
    item.documentation = buildMarkdownDocumentation(qualifier.description, qualifier.syntax, qualifier.syntax);
    item.insertText = new vscode.SnippetString(qualifier.syntax.replace('<action> ', ''));
    item.sortText = `3-${index.toString().padStart(3, '0')}`;
    return item;
  });
}

function buildStructureItems(): vscode.CompletionItem[] {
  const stepItem = new vscode.CompletionItem('STEP', vscode.CompletionItemKind.Snippet);
  stepItem.detail = 'step header';
  stepItem.documentation = buildMarkdownDocumentation(
    'Declares a logical step block. Action lines under a STEP header should use a 4-space indent.',
    'STEP ${1:1}: ${2:Description}',
    'STEP 1: Description',
  );
  stepItem.insertText = new vscode.SnippetString('STEP ${1:1}: ${2:Description}');

  const doneItem = new vscode.CompletionItem('DONE.', vscode.CompletionItemKind.Keyword);
  doneItem.detail = 'mission terminator';
  doneItem.documentation = 'Explicitly ends the mission.';
  doneItem.insertText = 'DONE.';

  return [stepItem, doneItem];
}

const QUALIFIER_TRIGGER_REGEX = new RegExp(
  `(?:${dslContract.commands
    .filter((c) => c.interactionMode)
    .map((c) => c.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\b`,
  'iu',
);

function shouldSuggestQualifiers(linePrefix: string): boolean {
  return QUALIFIER_TRIGGER_REGEX.test(linePrefix);
}

function rawLineNeedsCommand(linePrefix: string): boolean {
  return linePrefix.trim().length === 0 || linePrefix.startsWith('    ');
}

function buildMarkdownDocumentation(description: string, snippet: string, preview: string): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = false;
  markdown.appendMarkdown(`${description}\n\n`);
  markdown.appendCodeblock(preview, 'hunt');
  if (snippet !== preview) {
    markdown.appendMarkdown('\nSnippet\n');
    markdown.appendCodeblock(snippet, 'hunt');
  }
  return markdown;
}