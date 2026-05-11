import type * as vscode from 'vscode';

import type { RunTemplateDeliveryTarget, RunTemplateMode } from '../runOptions.js';

export interface RunTemplateDeliveryRequest {
  mode: RunTemplateMode;
  resolvedBody: string;
  templateName: string;
}

export interface RunTemplateDeliveryResult {
  deliveryTarget: RunTemplateDeliveryTarget;
  deliveryTargetLabel: string;
  documentUri?: vscode.Uri;
}

export interface RunTemplateDeliveryAdapter {
  deliver(request: RunTemplateDeliveryRequest): Promise<RunTemplateDeliveryResult>;
  readonly target: RunTemplateDeliveryTarget;
}
