import * as vscode from 'vscode';

export type LmResponsePanelStatus = 'cancelled' | 'completed' | 'error' | 'idle' | 'streaming';

export interface LmResponsePanelState {
  canCancel: boolean;
  errorDetails?: string;
  modelId: string;
  modelLabel: string;
  promptText: string;
  responseText: string;
  status: LmResponsePanelStatus;
  templateName: string;
}

export interface LmResponsePanelSession {
  appendResponseChunk(chunk: string): void;
  cancel(): void;
  complete(): void;
  fail(errorDetails: string): void;
  setCancellationHandler(handler: (() => void) | undefined): void;
}

const PANEL_TYPE = 'stencil.languageModelResponse';
const PANEL_TITLE = 'Stencil Language Model Response';

let panelManager: LmResponsePanelManager | undefined;

export function beginLmResponsePanelSession(
  state: Omit<LmResponsePanelState, 'canCancel' | 'responseText' | 'status'>,
): LmResponsePanelSession {
  const manager = getOrCreatePanelManager();
  manager.beginRun(state);
  return manager;
}

export function disposeLmResponsePanelForTesting(): void {
  panelManager?.dispose();
  panelManager = undefined;
}

class LmResponsePanelManager implements LmResponsePanelSession {
  private cancelHandler: (() => void) | undefined;
  private panel: vscode.WebviewPanel;
  private state: LmResponsePanelState | undefined;

  constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.webview.html = getWebviewHtml();
    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'stencil.lmResponsePanel.cancel'
      ) {
        this.cancel();
      }
    });
    this.panel.onDidDispose(() => {
      this.cancelActiveRun();
      if (panelManager === this) {
        panelManager = undefined;
      }
    });
  }

  appendResponseChunk(chunk: string): void {
    if (
      this.state === undefined ||
      this.state.status === 'cancelled' ||
      this.state.status === 'completed' ||
      this.state.status === 'error'
    ) {
      return;
    }

    this.state = {
      ...this.state,
      responseText: `${this.state.responseText}${chunk}`,
      status: 'streaming',
    };
    this.publishState();
  }

  beginRun(state: Omit<LmResponsePanelState, 'canCancel' | 'responseText' | 'status'>): void {
    this.panel.reveal(vscode.ViewColumn.Beside);
    this.cancelHandler = undefined;
    this.state = {
      ...state,
      canCancel: false,
      responseText: '',
      status: 'idle',
    };
    this.publishState();
  }

  cancel(): void {
    if (
      this.state === undefined ||
      this.state.status === 'cancelled' ||
      this.state.status === 'completed' ||
      this.state.status === 'error'
    ) {
      return;
    }

    this.cancelActiveRun();
    this.state = {
      ...this.state,
      canCancel: false,
      status: 'cancelled',
    };
    this.publishState();
  }

  complete(): void {
    if (this.state === undefined) {
      return;
    }

    this.cancelHandler = undefined;
    this.state = {
      ...this.state,
      canCancel: false,
      status: 'completed',
    };
    this.publishState();
  }

  dispose(): void {
    this.panel.dispose();
  }

  fail(errorDetails: string): void {
    if (this.state === undefined) {
      return;
    }

    this.cancelHandler = undefined;
    this.state = {
      ...this.state,
      canCancel: false,
      errorDetails,
      status: 'error',
    };
    this.publishState();
  }

  setCancellationHandler(handler: (() => void) | undefined): void {
    this.cancelHandler = handler;
    if (this.state === undefined) {
      return;
    }

    this.state = {
      ...this.state,
      canCancel: handler !== undefined,
    };
    this.publishState();
  }

  private cancelActiveRun(): void {
    const handler = this.cancelHandler;
    this.cancelHandler = undefined;
    handler?.();
  }

  private publishState(): void {
    if (this.state === undefined) {
      return;
    }

    void this.panel.webview.postMessage({
      state: this.state,
      type: 'stencil.lmResponsePanel.state',
    });
  }
}

function getOrCreatePanelManager(): LmResponsePanelManager {
  if (panelManager !== undefined) {
    return panelManager;
  }

  panelManager = new LmResponsePanelManager(
    vscode.window.createWebviewPanel(PANEL_TYPE, PANEL_TITLE, vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
    }),
  );
  return panelManager;
}

function getWebviewHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${PANEL_TITLE}</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        font-family: var(--vscode-font-family);
        margin: 0;
        padding: 16px;
      }
      .layout {
        display: grid;
        gap: 16px;
      }
      .meta {
        display: grid;
        gap: 8px;
      }
      .actions {
        display: flex;
        gap: 8px;
      }
      .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
      }
      button {
        width: fit-content;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        padding: 12px;
        border-radius: 8px;
        background: var(--vscode-textCodeBlock-background);
      }
      .label {
        font-size: 12px;
        opacity: 0.8;
        margin-bottom: 4px;
      }
      .error {
        color: var(--vscode-errorForeground);
      }
    </style>
  </head>
  <body>
    <div class="layout">
      <section class="meta">
        <div><strong id="templateName">Waiting for a run...</strong></div>
        <div id="modelLabel"></div>
        <div><span id="status" class="badge">idle</span></div>
        <div class="actions">
          <button id="cancelButton" type="button">Cancel</button>
        </div>
      </section>
      <section>
        <div class="label">Prompt Preview</div>
        <pre id="promptText"></pre>
      </section>
      <section>
        <div class="label">Response</div>
        <pre id="responseText"></pre>
      </section>
      <section id="errorSection" hidden>
        <div class="label error">Error</div>
        <pre id="errorText" class="error"></pre>
      </section>
    </div>
    <script>
      const templateName = document.getElementById('templateName');
      const modelLabel = document.getElementById('modelLabel');
      const status = document.getElementById('status');
      const cancelButton = document.getElementById('cancelButton');
      const promptText = document.getElementById('promptText');
      const responseText = document.getElementById('responseText');
      const errorSection = document.getElementById('errorSection');
      const errorText = document.getElementById('errorText');
      const vscode = acquireVsCodeApi();

      cancelButton.addEventListener('click', () => {
        vscode.postMessage({ type: 'stencil.lmResponsePanel.cancel' });
      });

      window.addEventListener('message', (event) => {
        if (event.data?.type !== 'stencil.lmResponsePanel.state') {
          return;
        }

        const state = event.data.state;
        templateName.textContent = state.templateName;
        modelLabel.textContent = state.modelLabel + ' (' + state.modelId + ')';
        status.textContent = state.status;
        cancelButton.disabled = !state.canCancel;
        promptText.textContent = state.promptText;
        responseText.textContent = state.responseText;

        if (state.errorDetails) {
          errorSection.hidden = false;
          errorText.textContent = state.errorDetails;
        } else {
          errorSection.hidden = true;
          errorText.textContent = '';
        }
      });
    </script>
  </body>
</html>`;
}
