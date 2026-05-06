import * as vscode from 'vscode';

export interface OutputDeliveryResult {
  deliveryTargetLabel: string;
  documentUri: vscode.Uri;
}

export async function openResolvedTemplateOutput(
  resolvedBody: string,
): Promise<OutputDeliveryResult> {
  const document = await vscode.workspace.openTextDocument({
    content: resolvedBody,
    language: 'markdown',
  });

  await vscode.window.showTextDocument(document);

  return {
    deliveryTargetLabel: 'new editor',
    documentUri: document.uri,
  };
}
