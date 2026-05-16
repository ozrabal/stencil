import * as vscode from 'vscode';

import type { RunTemplateDeliveryAdapter, RunTemplateDeliveryResult } from './delivery/types.js';

import { StencilError, StencilErrorCode } from '../core/index.js';
import { getDeliveryTargetCapability } from './delivery/capabilities.js';
import { clipboardDeliveryAdapter, ClipboardDeliveryError } from './delivery/clipboardDelivery.js';
import { copilotChatDeliveryAdapter } from './delivery/copilotChatDelivery.js';
import { editorDeliveryAdapter } from './delivery/editorDelivery.js';
import {
  lmApiDeliveryAdapter,
  LmApiDeliveryCancelledError,
  LmApiDeliveryError,
} from './delivery/lmApiDelivery.js';
import { getUnknownErrorMessage } from './errors.js';
import { buildPlaceholderPromptPlan, collectPlaceholderInputs } from './placeholderInput.js';
import {
  resolveRunTemplateExecutionOptions,
  type RunTemplateChatMode,
  type RunTemplateDeliveryTarget,
  type RunTemplateMode,
  type RunTemplateRequest,
} from './runOptions.js';
import { resolveRunTemplateTarget } from './runTemplateTarget.js';

export type RunTemplateOutcome =
  | RunTemplateCancelledOutcome
  | RunTemplateChatModeUnavailableOutcome
  | RunTemplateCompletedOutcome
  | RunTemplateCompletedWithFallbackOutcome
  | RunTemplateDeliveryFailedOutcome
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

export interface RunTemplateCompletedWithFallbackOutcome {
  delivery: RunTemplateDeliveryResult;
  fallbackDeliveryTarget: RunTemplateDeliveryTarget;
  fallbackReason: string;
  kind: 'completed-with-fallback';
  requestedDeliveryTarget: RunTemplateDeliveryTarget;
  templateName: string;
}

export interface RunTemplateDeliveryFailedOutcome {
  deliveryTarget: RunTemplateDeliveryTarget;
  kind: 'delivery-failed';
  reason: string;
  templateName: string;
}

export interface RunTemplateChatModeUnavailableOutcome {
  chatMode: RunTemplateChatMode;
  deliveryTarget: RunTemplateDeliveryTarget;
  kind: 'chat-mode-unavailable';
  supportedChatModes: RunTemplateChatMode[];
}

export interface RunTemplateCancelledOutcome {
  kind: 'cancelled';
  stage: 'lm-api-execution' | 'placeholder-input';
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
  const capability = await getDeliveryTargetCapability(options.deliveryTarget);

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

  const fallbackTargets = getFallbackTargets(options.deliveryTarget);
  if (!capability.available && fallbackTargets.length === 0) {
    return {
      deliveryTarget: options.deliveryTarget,
      kind: 'target-unavailable',
      mode: options.mode,
      ...(capability.unavailableReason !== undefined
        ? { reason: capability.unavailableReason }
        : {}),
    };
  }

  const unsupportedChatMode =
    options.deliveryTarget === 'copilot-chat' &&
    !capability.supportedChatModes.includes(options.chatMode)
      ? {
          chatMode: options.chatMode,
          deliveryTarget: options.deliveryTarget,
          kind: 'chat-mode-unavailable' as const,
          supportedChatModes: capability.supportedChatModes,
        }
      : undefined;

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
  const resolvedTemplate = await resolveTemplateForDelivery(request, templateName);
  if ('kind' in resolvedTemplate) {
    return resolvedTemplate;
  }

  if (unsupportedChatMode !== undefined) {
    return attemptFallbackDelivery({
      fallbackTargets,
      primaryFailureMessage: `Copilot Chat mode "${unsupportedChatMode.chatMode}" is unavailable in the current runtime.`,
      requestedDeliveryTarget: options.deliveryTarget,
      resolvedBody: resolvedTemplate.resolvedBody,
      templateName,
    });
  }

  if (!capability.available) {
    if (fallbackTargets.length === 0) {
      return {
        deliveryTarget: options.deliveryTarget,
        kind: 'target-unavailable',
        mode: options.mode,
        ...(capability.unavailableReason !== undefined
          ? { reason: capability.unavailableReason }
          : {}),
      };
    }

    return attemptFallbackDelivery({
      fallbackTargets,
      primaryFailureMessage:
        capability.unavailableReason ??
        `Stencil run target "${formatDeliveryTargetLabel(options.deliveryTarget)}" is unavailable in the current runtime.`,
      requestedDeliveryTarget: options.deliveryTarget,
      resolvedBody: resolvedTemplate.resolvedBody,
      templateName,
    });
  }

  try {
    return {
      delivery: await getDeliveryAdapter(options.deliveryTarget).deliver({
        chatMode: options.chatMode,
        mode: options.mode,
        resolvedBody: resolvedTemplate.resolvedBody,
        ...(request.selectedLanguageModelId !== undefined
          ? { selectedModelId: request.selectedLanguageModelId }
          : {}),
        templateName,
      }),
      kind: 'completed',
      templateName,
    };
  } catch (error) {
    if (error instanceof LmApiDeliveryCancelledError) {
      return {
        kind: 'cancelled',
        stage: 'lm-api-execution',
        templateName,
      };
    }

    if (fallbackTargets.length === 0) {
      return {
        deliveryTarget: options.deliveryTarget,
        kind: 'delivery-failed',
        reason: getDeliveryFailureMessage(options.deliveryTarget, templateName, error),
        templateName,
      };
    }

    return attemptFallbackDelivery({
      fallbackTargets,
      primaryFailureMessage: getPrimaryDeliveryFailureMessage(
        options.deliveryTarget,
        templateName,
        error,
      ),
      requestedDeliveryTarget: options.deliveryTarget,
      resolvedBody: resolvedTemplate.resolvedBody,
      templateName,
    });
  }
}

export async function showRunTemplateOutcomeMessage(outcome: RunTemplateOutcome): Promise<void> {
  if (outcome.kind === 'delivery-failed') {
    await vscode.window.showErrorMessage(outcome.reason);
    return;
  }

  const message = getRunTemplateOutcomeMessage(outcome);
  if (message === undefined) {
    return;
  }

  await vscode.window.showInformationMessage(message);
}

function getRunTemplateOutcomeMessage(outcome: RunTemplateOutcome): string | undefined {
  switch (outcome.kind) {
    case 'cancelled':
      return outcome.stage === 'lm-api-execution'
        ? `Cancelled language model execution for template "${outcome.templateName}".`
        : `Cancelled running template "${outcome.templateName}".`;
    case 'chat-mode-unavailable':
      return `Stencil chat mode "${outcome.chatMode}" is unavailable for target "${formatDeliveryTargetLabel(outcome.deliveryTarget)}". Supported chat modes: ${outcome.supportedChatModes.join(', ')}.`;
    case 'completed':
      return `Ran "${outcome.templateName}". ${capitalize(outcome.delivery.deliveryActionLabel)} resolved prompt in ${outcome.delivery.deliveryTargetLabel}.`;
    case 'completed-with-fallback':
      return outcome.fallbackReason;
    case 'delivery-failed':
      return undefined;
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

async function resolveTemplateForDelivery(
  request: RunTemplateRequest,
  templateName: string,
): Promise<
  RunTemplateCancelledOutcome | RunTemplateUnresolvedAfterPromptOutcome | { resolvedBody: string }
> {
  const template = await request.stencil.get(templateName);
  if (template === null) {
    throw new StencilError(
      `Template "${templateName}" could not be found.`,
      StencilErrorCode.TEMPLATE_NOT_FOUND,
    );
  }

  const initialResult = await request.stencil.resolve(templateName, {});
  if (initialResult.unresolvedCount === 0) {
    return { resolvedBody: initialResult.resolvedBody };
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

  return { resolvedBody: finalResult.resolvedBody };
}

async function attemptFallbackDelivery(options: {
  fallbackTargets: RunTemplateDeliveryTarget[];
  primaryFailureMessage: string;
  requestedDeliveryTarget: RunTemplateDeliveryTarget;
  resolvedBody: string;
  templateName: string;
}): Promise<RunTemplateCompletedWithFallbackOutcome | RunTemplateDeliveryFailedOutcome> {
  const fallbackFailures: string[] = [];

  for (const fallbackTarget of options.fallbackTargets) {
    const capability = await getDeliveryTargetCapability(fallbackTarget);
    if (!capability.implemented) {
      fallbackFailures.push(
        `${capitalize(formatDeliveryTargetLabel(fallbackTarget))} fallback is not supported in this extension build.`,
      );
      continue;
    }

    if (!capability.available) {
      fallbackFailures.push(
        capability.unavailableReason ??
          `${capitalize(formatDeliveryTargetLabel(fallbackTarget))} fallback is unavailable in the current runtime.`,
      );
      continue;
    }

    try {
      const delivery = await getDeliveryAdapter(fallbackTarget).deliver({
        chatMode: 'ask',
        mode: 'default',
        resolvedBody: options.resolvedBody,
        templateName: options.templateName,
      });

      return {
        delivery,
        fallbackDeliveryTarget: fallbackTarget,
        fallbackReason: buildFallbackSuccessMessage(options.primaryFailureMessage, delivery),
        kind: 'completed-with-fallback',
        requestedDeliveryTarget: options.requestedDeliveryTarget,
        templateName: options.templateName,
      };
    } catch (error) {
      fallbackFailures.push(getFallbackFailureMessage(fallbackTarget, options.templateName, error));
    }
  }

  return {
    deliveryTarget: options.requestedDeliveryTarget,
    kind: 'delivery-failed',
    reason: [options.primaryFailureMessage, ...fallbackFailures].join(' '),
    templateName: options.templateName,
  };
}

function capitalize(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function getDeliveryAdapter(deliveryTarget: RunTemplateDeliveryTarget): RunTemplateDeliveryAdapter {
  switch (deliveryTarget) {
    case 'clipboard':
      return clipboardDeliveryAdapter;
    case 'copilot-chat':
      return copilotChatDeliveryAdapter;
    case 'editor':
      return editorDeliveryAdapter;
    case 'lm-api':
      return lmApiDeliveryAdapter;
  }

  return assertUnreachable(deliveryTarget);
}

function getFallbackTargets(
  deliveryTarget: RunTemplateDeliveryTarget,
): RunTemplateDeliveryTarget[] {
  switch (deliveryTarget) {
    case 'clipboard':
      return ['editor'];
    case 'copilot-chat':
    case 'lm-api':
      return ['clipboard', 'editor'];
    case 'editor':
      return [];
  }
}

function getPrimaryDeliveryFailureMessage(
  deliveryTarget: RunTemplateDeliveryTarget,
  templateName: string,
  error: unknown,
): string {
  switch (deliveryTarget) {
    case 'copilot-chat':
      return `Copilot Chat failed: ${getUnknownErrorMessage(error)}.`;
    default:
      return getDeliveryFailureMessage(deliveryTarget, templateName, error);
  }
}

function getDeliveryFailureMessage(
  deliveryTarget: RunTemplateDeliveryTarget,
  templateName: string,
  error: unknown,
): string {
  if (error instanceof ClipboardDeliveryError || error instanceof LmApiDeliveryError) {
    return error.userMessage;
  }

  return `Stencil could not deliver template "${templateName}" to ${formatDeliveryTargetLabel(deliveryTarget)}: ${getUnknownErrorMessage(error)}`;
}

function getFallbackFailureMessage(
  deliveryTarget: RunTemplateDeliveryTarget,
  templateName: string,
  error: unknown,
): string {
  return `${capitalize(formatDeliveryTargetLabel(deliveryTarget))} fallback failed: ${getDeliveryFailureMessage(deliveryTarget, templateName, error)}`;
}

function buildFallbackSuccessMessage(
  primaryFailureMessage: string,
  delivery: RunTemplateDeliveryResult,
): string {
  const fallbackActionMessage =
    delivery.deliveryTarget === 'clipboard'
      ? `Copied the resolved prompt to ${delivery.deliveryTargetLabel} instead.`
      : `Opened the resolved prompt in a ${delivery.deliveryTargetLabel} instead.`;

  return `${primaryFailureMessage} ${fallbackActionMessage}`;
}

function formatDeliveryTargetLabel(deliveryTarget: RunTemplateDeliveryTarget): string {
  switch (deliveryTarget) {
    case 'clipboard':
      return 'clipboard';
    case 'copilot-chat':
      return 'Copilot Chat';
    case 'lm-api':
      return 'Stencil Language Model execution';
    default:
      return 'editor';
  }
}

function assertUnreachable(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
