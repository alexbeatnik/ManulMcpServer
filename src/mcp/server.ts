import { getCommandKeywordSuggestions, normalizeGoal, normalizeNaturalLanguageStep } from '../dsl/builder';
import { suggestClosestCommand, validateDocument, validateStep } from '../dsl/validator';
import type { ManulLogger } from '../services/logger';
import type { GoalNormalizationResult, IManulBackend, RunExecutionResult, ValidationIssue } from '../types/api';

export class ManulMcpServer {
  public constructor(
    private readonly apiClient: IManulBackend,
    private readonly output: ManulLogger,
  ) {}

  public async runStep(step: string): Promise<RunExecutionResult> {
    const normalization = normalizeNaturalLanguageStep(step);
    if (!normalization.normalized) {
      throw new Error('Step input is empty.');
    }

    const issues = validateStep(normalization.normalized);
    this.throwIfBlockingIssues(issues, normalization.normalized);

    this.output.step(`Executing step: ${normalization.normalized}`);
    const response = await this.apiClient.runStep(normalization.normalized);

    return {
      normalization: [normalization],
      issues,
      response,
    };
  }

  public async runSteps(steps: readonly string[], dsl?: string): Promise<RunExecutionResult> {
    const normalization = steps.map((step) => normalizeNaturalLanguageStep(step));
    const normalizedSteps = normalization.map((result) => result.normalized).filter((value) => value.length > 0);

    if (normalizedSteps.length === 0) {
      throw new Error('No executable steps were found.');
    }

    const issues = dsl ? validateDocument(dsl) : normalizedSteps.flatMap((step, index) => validateStep(step, index + 1));
    this.throwIfBlockingIssues(issues, normalizedSteps[0]);

    this.output.step(`Executing ${normalizedSteps.length} step(s).`);
    const response = await this.apiClient.runSteps(normalizedSteps, dsl);

    return {
      normalization,
      issues,
      response,
    };
  }

  public async runGoal(goal: string): Promise<RunExecutionResult> {
    const normalizedGoal = normalizeGoal(goal);
    this.logGoalNormalization(normalizedGoal);
    return this.runSteps(normalizedGoal.steps, normalizedGoal.steps.join('\n'));
  }

  public async getState() {
    return this.apiClient.getState();
  }

  private throwIfBlockingIssues(issues: readonly ValidationIssue[], originalInput: string): void {
    const blockingIssue = issues.find((issue) => issue.severity === 'error');
    if (!blockingIssue) {
      return;
    }

    const firstToken = originalInput.trim().split(/\s+/u)[0] ?? '';
    const suggestion = suggestClosestCommand(firstToken, getCommandKeywordSuggestions());
    const suffix = suggestion ? ` Closest command: ${suggestion}.` : '';
    throw new Error(`${blockingIssue.message}${suffix}`);
  }

  private logGoalNormalization(goalResult: GoalNormalizationResult): void {
    if (goalResult.steps.length === 0) {
      this.output.warn('Goal normalization did not produce any runnable DSL steps.');
      return;
    }

    this.output.info(`Goal normalized into ${goalResult.steps.length} step(s).`);
    if (goalResult.appliedFixes.length > 0) {
      this.output.debug('Goal normalization fixes', goalResult.appliedFixes);
    }
  }
}