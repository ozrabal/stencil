import type { RunTemplateDeliveryResult } from './delivery/types.js';

import { editorDeliveryAdapter } from './delivery/editorDelivery.js';

export type OutputDeliveryResult = RunTemplateDeliveryResult;

export async function openResolvedTemplateOutput(
  resolvedBody: string,
): Promise<OutputDeliveryResult> {
  return editorDeliveryAdapter.deliver({
    mode: 'default',
    resolvedBody,
    templateName: 'resolved-output',
  });
}
