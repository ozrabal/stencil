import type * as vscode from 'vscode';

import type {
  RunTemplateChatMode,
  RunTemplateDeliveryTarget,
  RunTemplateMode,
} from '../runOptions.js';

export interface RunTemplateDeliveryRequest {
  chatMode: RunTemplateChatMode;
  mode: RunTemplateMode;
  resolvedBody: string;
  selectedModelId?: string;
  templateName: string;
}

export interface RunTemplateDeliveryResult {
  deliveryActionLabel: string;
  deliveryTarget: RunTemplateDeliveryTarget;
  deliveryTargetLabel: string;
  documentUri?: vscode.Uri;
  panelTitle?: string;
  surfaceLabel?: string;
}

export interface RunTemplateDeliveryAdapter {
  deliver(request: RunTemplateDeliveryRequest): Promise<RunTemplateDeliveryResult>;
  readonly target: RunTemplateDeliveryTarget;
}
