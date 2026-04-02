export type CommandCategory =
  | 'navigation'
  | 'interaction'
  | 'wait'
  | 'data'
  | 'assertion'
  | 'keyboard'
  | 'network'
  | 'utility'
  | 'python'
  | 'control_flow'
  | 'structure';

export type InteractionModeId = 'drag' | 'select' | 'input' | 'clickable' | 'hover' | 'locate';

export interface CommandDefinition {
  readonly id: string;
  readonly label: string;
  readonly uiText: string;
  readonly snippet: string;
  readonly regex: string | null;
  readonly description: string;
  readonly category: CommandCategory;
  readonly interactionMode?: InteractionModeId;
}

export interface QualifierScoringRule {
  readonly kind: string;
  readonly proximityWeight: number;
  readonly distanceThresholdPx?: number;
  readonly region?: string;
  readonly containerScope?: string;
}

export interface ContextualQualifierDefinition {
  readonly id: string;
  readonly syntax: string;
  readonly regex: string;
  readonly description: string;
  readonly scoring: QualifierScoringRule;
}

export interface MetadataDirectiveDefinition {
  readonly id: string;
  readonly label: string;
  readonly uiText: string;
  readonly snippet: string;
  readonly description: string;
}

export interface HookBlockDefinition {
  readonly id: string;
  readonly label: string;
  readonly openTag: string;
  readonly closeTag: string;
  readonly snippet: string;
  readonly description: string;
}

export interface InteractionModeDefinition {
  readonly id: InteractionModeId;
  readonly triggers: readonly string[];
  readonly triggerRule: string;
  readonly description: string;
}

export interface ManulDslContract {
  readonly version: string;
  readonly generatedFrom: string;
  readonly commands: readonly CommandDefinition[];
  readonly contextualQualifiers: readonly ContextualQualifierDefinition[];
  readonly metadata: readonly MetadataDirectiveDefinition[];
  readonly hookBlocks: readonly HookBlockDefinition[];
  readonly interactionModes: readonly InteractionModeDefinition[];
  readonly comments: {
    readonly lineComment: string;
    readonly rule: string;
  };
  readonly indentation: {
    readonly rule: string;
  };
}