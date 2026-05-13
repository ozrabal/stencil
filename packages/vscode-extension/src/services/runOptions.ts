import type { Stencil } from '../core/index.js';
import type { ResolvedWorkspace } from '../types.js';

export type RunTemplateDeliveryTarget = 'clipboard' | 'copilot-chat' | 'editor' | 'lm-api';

export type RunTemplateChatMode = 'agent' | 'ask' | 'edit';

export type RunTemplateMode = 'default' | 'execute' | 'insert' | 'send';

export type RunTemplateInvocationSource = 'command-palette' | 'tree-item';

export interface RunTemplateRequestTarget {
  templateName: string;
}

export interface RunTemplateExecutionOptions {
  chatMode: RunTemplateChatMode;
  deliveryTarget: RunTemplateDeliveryTarget;
  mode: RunTemplateMode;
}

export interface RunTemplateRequest {
  invocationSource: RunTemplateInvocationSource;
  options?: Partial<RunTemplateExecutionOptions>;
  requestedTarget?: RunTemplateRequestTarget;
  stencil: Stencil;
  workspace: ResolvedWorkspace;
}

export function resolveRunTemplateExecutionOptions(
  options?: Partial<RunTemplateExecutionOptions>,
): RunTemplateExecutionOptions {
  return {
    chatMode: options?.chatMode ?? 'ask',
    deliveryTarget: options?.deliveryTarget ?? 'editor',
    mode: options?.mode ?? 'default',
  };
}
