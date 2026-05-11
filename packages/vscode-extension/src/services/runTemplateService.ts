import * as vscode from 'vscode';

import type { RunTemplateDeliveryAdapter, RunTemplateDeliveryResult } from './delivery/types.js';

import { StencilError, StencilErrorCode } from '../core/index.js';
import { getDeliveryTargetCapability } from './delivery/capabilities.js';
import { editorDeliveryAdapter } from './delivery/editorDelivery.js';
import { buildPlaceholderPromptPlan, collectPlaceholderInputs } from './placeholderInput.js';
import {
  resolveRunTemplateExecutionOptions,
  type RunTemplateDeliveryTarget,
  type RunTemplateMode,
  type RunTemplateRequest,
} from './runOptions.js';
import { resolveRunTemplateTarget } from './runTemplateTarget.js';

export type RunTemplateOutcome =
  | RunTemplateCancelledOutcome
  | RunTemplateCompletedOutcome
  | RunTemplateModeUnavailableOutcome
  | RunTemplateNoTargetSelectedOutcome
  | RunTemplateTargetUnavailableOutcome
  | RunTemplateUnresolvedAfterPromptOutcome
  | RunTemplateUnsupportedTargetOutcome;

export interface RunTemplateCompletedOutcome {
  delivery: RunTemplateDeliveryResult;
  kind: 'completed';
  templateName: string;
}

export interface RunTemplateCancelledOutcome {
  kind: 'cancelled';
  stage: 'placeholder-input';
  templateName: string;
}

export interface RunTemplateNoTargetSelectedOutcome {
  kind: 'no-target-selected';
  reason: 'no-templates-available' | 'picker-cancelled';
}

export interface RunTemplateUnresolvedAfterPromptOutcome {
  kind: 'unresolved-after-prompt';
  templateName: string;
  unresolvedNames: string[];
}

export interface RunTemplateUnsupportedTargetOutcome {
  deliveryTarget: RunTemplateDeliveryTarget;
  kind: 'unsupported-target';
  mode: RunTemplateMode;
}

export interface RunTemplateTargetUnavailableOutcome {
  deliveryTarget: RunTemplateDeliveryTarget;
  kind: 'target-unavailable';
  mode: RunTemplateMode;
  reason?: string;
}

export interface RunTemplateModeUnavailableOutcome {
  deliveryTarget: RunTemplateDeliveryTarget;
  kind: 'mode-unavailable';
  mode: RunTemplateMode;
  supportedModes: RunTemplateMode[];
}

export async function runTemplate(request: RunTemplateRequest): Promise<RunTemplateOutcome> {
  const options = resolveRunTemplateExecutionOptions(request.options);
  const capability = getDeliveryTargetCapability(options.deliveryTarget);

  if (!capability.implemented) {
    return {
      deliveryTarget: options.deliveryTarget,
      kind: 'unsupported-target',
      mode: options.mode,
    };
  }

  if (!capability.supportedModes.includes(options.mode)) {
    return {
      deliveryTarget: options.deliveryTarget,
      kind: 'mode-unavailable',
      mode: options.mode,
      supportedModes: capability.supportedModes,
    };
  }

  if (!capability.available) {
    return {
      deliveryTarget: options.deliveryTarget,
      kind: 'target-unavailable',
      mode: options.mode,
      ...(capability.unavailableReason !== undefined
        ? { reason: capability.unavailableReason }
        : {}),
    };
  }

  const requestedTarget = request.requestedTarget;
  const targetResult = await resolveRunTemplateTarget({
    ...(requestedTarget !== undefined ? { requestedTarget } : {}),
    stencil: request.stencil,
    workspace: request.workspace,
  });

  if (targetResult.kind !== 'selected') {
    return {
      kind: 'no-target-selected',
      reason: targetResult.reason,
    };
  }

  const templateName = targetResult.templateName;
  const template = await request.stencil.get(templateName);
  if (template === null) {
    throw new StencilError(
      `Template "${templateName}" could not be found.`,
      StencilErrorCode.TEMPLATE_NOT_FOUND,
    );
  }

  const initialResult = await request.stencil.resolve(templateName, {});
  const deliveryAdapter = getDeliveryAdapter(options.deliveryTarget);
  if (initialResult.unresolvedCount === 0) {
    return {
      delivery: await deliveryAdapter.deliver({
        mode: options.mode,
        resolvedBody: initialResult.resolvedBody,
        templateName,
      }),
      kind: 'completed',
      templateName,
    };
  }

  const promptPlan = buildPlaceholderPromptPlan(template, initialResult);
  const promptResult = await collectPlaceholderInputs(promptPlan.queue);
  if (promptResult.kind === 'cancelled') {
    return {
      kind: 'cancelled',
      stage: 'placeholder-input',
      templateName,
    };
  }

  const finalResult = await request.stencil.resolve(templateName, promptResult.values);
  if (finalResult.unresolvedCount > 0) {
    return {
      kind: 'unresolved-after-prompt',
      templateName,
      unresolvedNames: finalResult.placeholders
        .filter((placeholder) => placeholder.source === 'unresolved')
        .map((placeholder) => placeholder.name),
    };
  }

  return {
    delivery: await deliveryAdapter.deliver({
      mode: options.mode,
      resolvedBody: finalResult.resolvedBody,
      templateName,
    }),
    kind: 'completed',
    templateName,
  };
}

export async function showRunTemplateOutcomeMessage(outcome: RunTemplateOutcome): Promise<void> {
  const message = getRunTemplateOutcomeMessage(outcome);
  if (message === undefined) {
    return;
  }

  await vscode.window.showInformationMessage(message);
}

function getRunTemplateOutcomeMessage(outcome: RunTemplateOutcome): string | undefined {
  switch (outcome.kind) {
    case 'cancelled':
      return `Cancelled running template "${outcome.templateName}".`;
    case 'completed':
      return `Ran "${outcome.templateName}". Opened resolved prompt in a ${outcome.delivery.deliveryTargetLabel}.`;
    case 'mode-unavailable':
      return `Stencil run mode "${outcome.mode}" is unavailable for target "${formatDeliveryTargetLabel(outcome.deliveryTarget)}". Supported modes: ${outcome.supportedModes.join(', ')}.`;
    case 'no-target-selected':
      return outcome.reason === 'no-templates-available'
        ? 'No Stencil templates were found in this workspace.'
        : undefined;
    case 'target-unavailable':
      return (
        outcome.reason ??
        `Stencil run target "${formatDeliveryTargetLabel(outcome.deliveryTarget)}" is unavailable in the current runtime.`
      );
    case 'unresolved-after-prompt':
      return `Template "${outcome.templateName}" is still missing placeholder values: ${outcome.unresolvedNames.join(', ')}.`;
    case 'unsupported-target':
      return `Stencil run target "${formatDeliveryTargetLabel(outcome.deliveryTarget)}" is not supported yet.`;
  }
}

function getDeliveryAdapter(deliveryTarget: RunTemplateDeliveryTarget): RunTemplateDeliveryAdapter {
  switch (deliveryTarget) {
    case 'editor':
      return editorDeliveryAdapter;
    default:
      throw new Error(`No delivery adapter is registered for "${deliveryTarget}".`);
  }
}

function formatDeliveryTargetLabel(deliveryTarget: RunTemplateDeliveryTarget): string {
  switch (deliveryTarget) {
    case 'copilot-chat':
      return 'copilot-chat';
    case 'lm-api':
      return 'lm-api';
    default:
      return deliveryTarget;
  }
}
