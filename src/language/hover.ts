import * as vscode from 'vscode';

import { dslContract } from '../config/contract';
import type { CommandDefinition, ContextualQualifierDefinition, MetadataDirectiveDefinition } from '../types/contract';

const HUNT_SELECTOR: vscode.DocumentSelector = { language: 'hunt', scheme: 'file' };

export function registerHoverProvider(): vscode.Disposable {
  return vscode.languages.registerHoverProvider(HUNT_SELECTOR, {
    provideHover(document, position) {
      const line = document.lineAt(position).text.trim();
      const range = document.getWordRangeAtPosition(position, /[@\[\]A-Za-z_]+/u) ?? document.lineAt(position).range;

      const command = findCommandForLine(line);
      if (command) {
        return new vscode.Hover(buildCommandMarkdown(command), range);
      }

      const metadata = findMetadataAtPosition(document, position);
      if (metadata) {
        return new vscode.Hover(buildMetadataMarkdown(metadata), range);
      }

      const qualifier = findQualifierForWord(document, position);
      if (qualifier) {
        return new vscode.Hover(buildQualifierMarkdown(qualifier), range);
      }

      return undefined;
    },
  });
}

function findCommandForLine(line: string): CommandDefinition | undefined {
  const normalized = line.toUpperCase();

  return dslContract.commands.find((command) => {
    // Use the command's regex when available for precise matching
    if (command.regex) {
      try {
        // Convert Python named groups (?P<name>) to JS (?<name>) and backreferences (?P=name) to \k<name>
        const jsPattern = command.regex
          .replace(/\(\?P<(\w+)>/g, '(?<$1>')
          .replace(/\(\?P=(\w+)\)/g, '\\k<$1>');
        if (new RegExp(jsPattern, 'iu').test(line)) {
          return true;
        }
      } catch {
        // Fall through to label-based match
      }
    }
    return normalized.startsWith(command.label.toUpperCase());
  });
}

function findMetadataAtPosition(document: vscode.TextDocument, position: vscode.Position): MetadataDirectiveDefinition | undefined {
  const line = document.lineAt(position).text.trim();
  return dslContract.metadata.find((directive) => line.startsWith(directive.label));
}

function findQualifierForWord(document: vscode.TextDocument, position: vscode.Position): ContextualQualifierDefinition | undefined {
  const word = document.getText(document.getWordRangeAtPosition(position, /[A-Za-z_]+/u) ?? new vscode.Range(position, position));
  const upperWord = word.toUpperCase();

  if (upperWord === 'NEAR') {
    return dslContract.contextualQualifiers.find((qualifier) => qualifier.id === 'near');
  }

  if (upperWord === 'INSIDE') {
    return dslContract.contextualQualifiers.find((qualifier) => qualifier.id === 'inside_row');
  }

  if (upperWord === 'HEADER') {
    return dslContract.contextualQualifiers.find((qualifier) => qualifier.id === 'on_header');
  }

  if (upperWord === 'FOOTER') {
    return dslContract.contextualQualifiers.find((qualifier) => qualifier.id === 'on_footer');
  }

  return undefined;
}

function buildCommandMarkdown(command: CommandDefinition): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = false;
  markdown.appendMarkdown(`${command.description}\n\n`);
  markdown.appendMarkdown(`Category: ${command.category}`);
  if (command.interactionMode) {
    markdown.appendMarkdown(`\nInteraction mode: ${command.interactionMode}`);
  }
  markdown.appendMarkdown('\nExample\n');
  markdown.appendCodeblock(command.uiText, 'hunt');
  markdown.appendMarkdown('\nSnippet\n');
  markdown.appendCodeblock(command.snippet, 'hunt');
  return markdown;
}

function buildMetadataMarkdown(directive: MetadataDirectiveDefinition): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = false;
  markdown.appendMarkdown(`${directive.description}\n\n`);
  markdown.appendCodeblock(directive.uiText, 'hunt');
  return markdown;
}

function buildQualifierMarkdown(qualifier: ContextualQualifierDefinition): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = false;
  markdown.appendMarkdown(`${qualifier.description}\n\n`);
  markdown.appendCodeblock(qualifier.syntax, 'hunt');
  markdown.appendMarkdown(`\nScoring kind: ${qualifier.scoring.kind}`);
  return markdown;
}