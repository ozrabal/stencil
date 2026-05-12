# PromptVault – "Run Template" Feature

## Implementation Specification for VS Code Extension

> **Document purpose:** Describes the functionality of automatically injecting a prompt into an AI chat window in VS Code. This document serves as input for sprint planning / taskboard — each section maps to a discrete implementation task.

---

## 1. Feature Overview

### 1.1 Description

"Run Template" is an action available for every prompt in the PromptVault library. When triggered:

1. The plugin resolves variables in the prompt body using IDE context (selected code, file name, git branch, etc.)
2. For variables requiring manual input — displays an inline form
3. The resolved prompt is injected into the chosen AI chat window in VS Code

Default behavior: the prompt is **inserted** into the chat input field (not auto-submitted), giving the user a chance to review it before pressing Enter.

### 1.2 Supported Target AI Assistants

| Assistant                               | Mechanism                                             | Status               |
| --------------------------------------- | ----------------------------------------------------- | -------------------- |
| GitHub Copilot Chat (Ask/Edit/Agent)    | `workbench.action.chat.open` + `isPartialQuery`       | ✅ Stable, MVP       |
| Copilot Chat — auto-send                | `workbench.action.chat.open` without `isPartialQuery` | ✅ Stable, MVP       |
| Copilot Inline Chat                     | `inlineChat.start`                                    | ⚠️ Limited API, v1.1 |
| Language Model API (streaming in panel) | `vscode.lm.selectChatModels` + `sendRequest`          | ✅ Stable, v1.1      |
| Claude Code / Cline / others            | Clipboard fallback                                    | ✅ Fallback, MVP     |
| MCP-compatible clients                  | MCP Server (PromptVault as provider)                  | 🔜 v1.2              |

### 1.3 Run Mode Variants

```
[▶ Run] button → dropdown:
  ├── Insert to Chat            (isPartialQuery: true, mode: 'ask')   ← default
  ├── Insert to Chat – Agent    (isPartialQuery: true, mode: 'agent')
  ├── Insert to Chat – Edit     (isPartialQuery: true, mode: 'edit')
  ├── Send directly             (auto-submit, no isPartialQuery)
  ├── Run in PromptVault panel  (Language Model API, inline result)
  └── Copy to clipboard         (fallback for Claude/Cline/others)
```

---

## 2. Architecture and Components

### 2.1 Flow Diagram

```
User clicks [▶ Run] in Sidebar/Webview
        │
        ▼
RunTemplateService.execute(promptId, runMode)
        │
        ├─► ContextService.resolveVariables(prompt.content)
        │         │
        │         ├─ auto vars: selectedText, fileName, gitBranch, language, etc.
        │         └─ input vars: show InputCollectorView → wait for user input
        │
        ▼
   resolvedPromptText (string, ready to send)
        │
        ├──[mode: 'copilot-insert']──► CopilotChatAdapter.insertToChat(text, chatMode)
        │                                     └─ executeCommand('workbench.action.chat.open', ...)
        │
        ├──[mode: 'copilot-send']───► CopilotChatAdapter.sendToChat(text, chatMode)
        │                                     └─ executeCommand('workbench.action.chat.open', ...)
        │
        ├──[mode: 'lm-api']─────────► LMApiAdapter.streamResponse(text)
        │                                     └─ vscode.lm.selectChatModels(...)
        │                                     └─ model.sendRequest(...)
        │                                     └─ stream → WebviewPanel
        │
        └──[mode: 'clipboard']──────► vscode.env.clipboard.writeText(text)
                                      + showInformationMessage(...)
```

### 2.2 New Files / Modules

```
src/
├── services/
│   ├── RunTemplateService.ts       ← orchestrates the full flow
│   ├── ContextService.ts           ← variable resolution (already in MVP plan)
│   └── adapters/
│       ├── CopilotChatAdapter.ts   ← integration with workbench.action.chat.open
│       ├── LMApiAdapter.ts         ← Language Model API streaming
│       └── ClipboardAdapter.ts     ← clipboard fallback
├── ui/
│   ├── InputCollectorView.ts       ← QuickInput for 'input' type variables
│   └── RunModeQuickPick.ts         ← dropdown for run mode selection
└── webview/
    └── components/
        └── ResponsePanel.tsx       ← panel displaying LM API response
```

---

## 3. Technical Specification of Components

### 3.1 `RunTemplateService` — Orchestrator

**File:** `src/services/RunTemplateService.ts`

**Responsibility:** Main entry point for the "Run Template" action. Coordinates context resolution, user input collection, and delegation to the appropriate adapter.

**Interface:**

```typescript
export type ChatMode = 'ask' | 'edit' | 'agent';

export type RunMode =
  | 'copilot-insert' // insert without submitting
  | 'copilot-send' // insert + auto-submit
  | 'lm-api' // streaming in PromptVault panel
  | 'clipboard'; // copy to clipboard

export interface RunOptions {
  promptId: string;
  runMode: RunMode;
  chatMode?: ChatMode; // for copilot-insert and copilot-send
  skipModeSelection?: boolean; // true = use defaults without dropdown
}

export class RunTemplateService {
  constructor(
    private promptService: PromptService,
    private contextService: ContextService,
    private inputCollector: InputCollectorView,
    private adapters: {
      copilot: CopilotChatAdapter;
      lmApi: LMApiAdapter;
      clipboard: ClipboardAdapter;
    },
  ) {}

  async execute(options: RunOptions): Promise<void>;
  async executeWithModeSelection(promptId: string): Promise<void>; // shows dropdown
}
```

**`execute()` logic:**

```typescript
async execute(options: RunOptions): Promise<void> {
  const prompt = await this.promptService.getById(options.promptId);
  if (!prompt) throw new Error(`Prompt ${options.promptId} not found`);

  // 1. Resolve auto variables
  let resolvedText = await this.contextService.resolveVariables(prompt.content);

  // 2. Collect variables requiring user input
  const inputVars = extractInputVariables(resolvedText);
  if (inputVars.length > 0) {
    const values = await this.inputCollector.collect(inputVars);
    if (values === null) return; // user cancelled
    resolvedText = applyInputVariables(resolvedText, values);
  }

  // 3. Delegate to the appropriate adapter
  switch (options.runMode) {
    case 'copilot-insert':
      await this.adapters.copilot.insertToChat(resolvedText, options.chatMode ?? 'ask');
      break;
    case 'copilot-send':
      await this.adapters.copilot.sendToChat(resolvedText, options.chatMode ?? 'ask');
      break;
    case 'lm-api':
      await this.adapters.lmApi.streamResponse(resolvedText);
      break;
    case 'clipboard':
      await this.adapters.clipboard.copyWithNotification(resolvedText);
      break;
  }

  // 4. Update usage statistics
  await this.promptService.incrementUsage(options.promptId);
}
```

---

### 3.2 `ContextService` — Variable Resolution

**File:** `src/services/ContextService.ts`

**Responsibility:** Detects and fills context variables in the prompt body using live IDE state.

#### 3.2.1 Variable Types

| Category               | Syntax                   | Source                                         | Example value       |
| ---------------------- | ------------------------ | ---------------------------------------------- | ------------------- |
| **Auto – editor**      | `{{selectedText}}`       | `activeTextEditor.document.getText(selection)` | `"const x = 5;"`    |
| **Auto – editor**      | `{{fileName}}`           | `activeTextEditor.document.fileName`           | `"utils.ts"`        |
| **Auto – editor**      | `{{filePath}}`           | `activeTextEditor.document.uri.fsPath`         | `"/src/utils.ts"`   |
| **Auto – editor**      | `{{language}}`           | `activeTextEditor.document.languageId`         | `"typescript"`      |
| **Auto – editor**      | `{{lineNumber}}`         | `activeTextEditor.selection.active.line`       | `"42"`              |
| **Auto – editor**      | `{{fileContent}}`        | `document.getText()` (full file)               | (full content)      |
| **Auto – workspace**   | `{{workspaceName}}`      | `workspace.workspaceFolders[0].name`           | `"my-project"`      |
| **Auto – workspace**   | `{{workspaceFolder}}`    | `workspace.workspaceFolders[0].uri.fsPath`     | `"/home/user/proj"` |
| **Auto – git**         | `{{gitBranch}}`          | Git extension API                              | `"feature/auth"`    |
| **Auto – git**         | `{{gitLastCommit}}`      | Git extension API                              | `"fix: auth token"` |
| **Auto – package**     | `{{projectFramework}}`   | parse `package.json`                           | `"nextjs"`          |
| **Auto – package**     | `{{projectLanguage}}`    | parse `package.json` + `tsconfig`              | `"typescript"`      |
| **Auto – diagnostics** | `{{currentErrors}}`      | `languages.getDiagnostics(uri)`                | `"TS2345: Arg..."`  |
| **Input (manual)**     | `{{input:VariableName}}` | QuickInput from user                           | any text            |
| **Input with default** | `{{input:Name:default}}` | QuickInput, placeholder = default              | any text            |

#### 3.2.2 Interface and Implementation

```typescript
export interface VariableResolver {
  name: string;
  type: 'auto' | 'input';
  resolve: () => Promise<string | null>;
}

export class ContextService {
  private resolvers: Map<string, VariableResolver>;

  constructor(private gitExtension: vscode.Extension<any> | undefined) {
    this.registerBuiltinResolvers();
  }

  // Main method — returns text with auto variables filled in.
  // {{input:X}} variables are left unchanged (handled in RunTemplateService).
  async resolveVariables(template: string): Promise<string>;

  // Helper — detects all variables in the template
  extractVariables(template: string): ParsedVariable[];

  private registerBuiltinResolvers(): void;
  private getActiveEditor(): vscode.TextEditor | undefined;
  private getGitInfo(): Promise<{ branch: string; lastCommit: string }>;
  private getPackageInfo(): Promise<Record<string, string>>;
  private getDiagnosticsText(uri: vscode.Uri): string;
}
```

#### 3.2.3 Variable Parsing

```typescript
export interface ParsedVariable {
  fullMatch: string; // e.g. "{{input:GoalName:improve performance}}"
  name: string; // e.g. "GoalName"
  type: 'auto' | 'input';
  defaultValue?: string; // e.g. "improve performance"
}

// Regex for variables
const VARIABLE_REGEX = /\{\{([^}]+)\}\}/g;

export function extractInputVariables(text: string): ParsedVariable[] {
  const vars: ParsedVariable[] = [];
  let match;
  while ((match = VARIABLE_REGEX.exec(text)) !== null) {
    const inner = match[1]; // e.g. "input:GoalName:improve performance"
    if (inner.startsWith('input:')) {
      const parts = inner.slice(6).split(':');
      vars.push({
        fullMatch: match[0],
        name: parts[0],
        type: 'input',
        defaultValue: parts[1],
      });
    }
  }
  return vars;
}
```

---

### 3.3 `CopilotChatAdapter` — Copilot Chat Integration

**File:** `src/services/adapters/CopilotChatAdapter.ts`

**Responsibility:** Injects the prompt into the GitHub Copilot Chat window via the VS Code command API.

```typescript
export class CopilotChatAdapter {
  // Inserts prompt into the chat input field WITHOUT submitting.
  // The user can review and optionally edit before pressing Enter.
  async insertToChat(text: string, mode: ChatMode = 'ask'): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      query: text,
      isPartialQuery: true,
      ...(mode !== 'ask' && { mode }), // only pass mode if not the default
    });
  }

  // Inserts the prompt AND automatically submits it.
  async sendToChat(text: string, mode: ChatMode = 'ask'): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      query: text,
      ...(mode !== 'ask' && { mode }),
    });
  }

  // Checks whether Copilot Chat is installed and active.
  async isAvailable(): Promise<boolean> {
    try {
      const commands = await vscode.commands.getCommands(true);
      return commands.includes('workbench.action.chat.open');
    } catch {
      return false;
    }
  }
}
```

**Implementation notes:**

- `isPartialQuery: true` — officially confirmed by the VS Code team (January 2025); inserts text without submitting.
- `mode` parameter (`'ask'` | `'edit'` | `'agent'`) — supported from VS Code 1.100+; silently ignored on older versions.
- `workbench.action.chat.open` command is stable since VS Code 1.90.

---

### 3.4 `LMApiAdapter` — Language Model API (Streaming)

**File:** `src/services/adapters/LMApiAdapter.ts`

**Responsibility:** Directly calls the language model via the VS Code Language Model API. The response is streamed into the PromptVault panel (without opening the Copilot Chat window). Requires an active Copilot subscription.

```typescript
export class LMApiAdapter {
  private responsePanel: ResponsePanelManager;

  constructor(responsePanel: ResponsePanelManager) {
    this.responsePanel = responsePanel;
  }

  async streamResponse(
    text: string,
    modelPreferences?: vscode.LanguageModelChatSelector,
  ): Promise<void> {
    const selector = modelPreferences ?? {
      vendor: 'copilot',
      family: 'gpt-4o',
    };

    const models = await vscode.lm.selectChatModels(selector);
    if (models.length === 0) {
      vscode.window.showErrorMessage(
        'No AI model available. Make sure you have an active GitHub Copilot subscription.',
      );
      return;
    }

    const model = models[0];
    const messages = [vscode.LanguageModelChatMessage.User(text)];
    const tokenSource = new vscode.CancellationTokenSource();

    this.responsePanel.show({ promptText: text, modelId: model.id });

    try {
      const response = await model.sendRequest(messages, {}, tokenSource.token);

      for await (const chunk of response.text) {
        this.responsePanel.appendChunk(chunk);
      }
      this.responsePanel.markComplete();
    } catch (err) {
      if (err instanceof vscode.LanguageModelError) {
        this.responsePanel.showError(err.message, err.code);
      } else {
        throw err;
      }
    }
  }

  async getAvailableModels(): Promise<vscode.LanguageModelChat[]> {
    return vscode.lm.selectChatModels({ vendor: 'copilot' });
  }
}
```

---

### 3.5 `ClipboardAdapter` — Fallback for External Assistants

**File:** `src/services/adapters/ClipboardAdapter.ts`

**Responsibility:** Copies the resolved prompt to the clipboard with a user notification. Used when the target assistant does not expose a public command API (Claude Code, Cline, Aider, etc.).

```typescript
export class ClipboardAdapter {
  async copyWithNotification(text: string, targetAssistant?: string): Promise<void> {
    await vscode.env.clipboard.writeText(text);

    const assistantName = targetAssistant ?? 'your AI chat window';
    const message = `Prompt copied to clipboard — paste into ${assistantName} (Ctrl+V / Cmd+V)`;

    const actions = this.getOpenActions(targetAssistant);
    const selected = await vscode.window.showInformationMessage(message, ...actions);

    if (selected) {
      await this.handleOpenAction(selected, targetAssistant);
    }
  }

  private getOpenActions(assistant?: string): string[] {
    const actionMap: Record<string, string> = {
      claude: 'Open Claude Code',
      cline: 'Open Cline',
    };
    const action = assistant && actionMap[assistant];
    return action ? [action] : [];
  }

  private async handleOpenAction(action: string, assistant?: string): Promise<void> {
    const commandMap: Record<string, string> = {
      'Open Claude Code': 'claude.openChat',
      'Open Cline': 'cline.openPanel',
    };
    const cmd = commandMap[action];
    if (cmd) {
      const commands = await vscode.commands.getCommands(true);
      if (commands.includes(cmd)) {
        await vscode.commands.executeCommand(cmd);
      }
    }
  }
}
```

---

### 3.6 `InputCollectorView` — Form for `{{input:X}}` Variables

**File:** `src/ui/InputCollectorView.ts`

**Responsibility:** Collects values for variables requiring manual input using the VS Code QuickInput API. Displays sequential input boxes (multi-step Quick Input) for each variable.

```typescript
export interface InputVariable {
  name: string;
  defaultValue?: string;
  placeholder?: string;
}

export class InputCollectorView {
  // Returns Map<variableName, value> or null if the user cancelled.
  async collect(variables: InputVariable[]): Promise<Map<string, string> | null> {
    const result = new Map<string, string>();

    for (let i = 0; i < variables.length; i++) {
      const variable = variables[i];
      const value = await this.promptSingleValue(variable, i + 1, variables.length);

      if (value === undefined) return null; // user pressed Escape
      result.set(variable.name, value);
    }

    return result;
  }

  private async promptSingleValue(
    variable: InputVariable,
    step: number,
    totalSteps: number,
  ): Promise<string | undefined> {
    return new Promise((resolve) => {
      const input = vscode.window.createInputBox();
      input.title = `PromptVault – Fill in variable (${step}/${totalSteps})`;
      input.prompt = `Value for: **${variable.name}**`;
      input.placeholder = variable.defaultValue ?? variable.placeholder ?? '';
      input.value = variable.defaultValue ?? '';
      input.step = step;
      input.totalSteps = totalSteps;
      input.ignoreFocusOut = true;

      input.onDidAccept(() => {
        resolve(input.value || variable.defaultValue || '');
        input.dispose();
      });

      input.onDidHide(() => {
        resolve(undefined);
        input.dispose();
      });

      input.show();
    });
  }
}
```

---

### 3.7 `RunModeQuickPick` — Run Mode Dropdown

**File:** `src/ui/RunModeQuickPick.ts`

**Responsibility:** Displays a menu for selecting the prompt run mode. Remembers the last selection per session.

```typescript
export interface RunModeOption {
  label: string;
  description: string;
  detail?: string;
  runMode: RunMode;
  chatMode?: ChatMode;
}

const RUN_MODE_OPTIONS: RunModeOption[] = [
  {
    label: '$(comment-discussion) Insert to Chat',
    description: 'Insert into Copilot Chat (Ask)',
    detail: 'Prompt appears in the chat input — submit manually',
    runMode: 'copilot-insert',
    chatMode: 'ask',
  },
  {
    label: '$(robot) Insert to Chat – Agent',
    description: 'Insert into Copilot Chat (Agent mode)',
    runMode: 'copilot-insert',
    chatMode: 'agent',
  },
  {
    label: '$(edit) Insert to Chat – Edit',
    description: 'Insert into Copilot Chat (Edit mode)',
    runMode: 'copilot-insert',
    chatMode: 'edit',
  },
  {
    label: '$(send) Send directly',
    description: 'Submit the prompt immediately',
    detail: 'Prompt will be sent without the chance to edit',
    runMode: 'copilot-send',
    chatMode: 'ask',
  },
  {
    label: '$(window) Run in PromptVault panel',
    description: 'Response appears in the PromptVault panel',
    detail: 'Uses Language Model API (requires Copilot)',
    runMode: 'lm-api',
  },
  {
    label: '$(clippy) Copy to clipboard',
    description: 'Copy to clipboard',
    detail: 'For Claude Code, Cline, and other assistants',
    runMode: 'clipboard',
  },
];

export class RunModeQuickPick {
  private lastSelectedMode: RunModeOption = RUN_MODE_OPTIONS[0];

  async show(): Promise<RunModeOption | undefined> {
    const items = RUN_MODE_OPTIONS.map((opt) => ({
      ...opt,
      picked:
        opt.runMode === this.lastSelectedMode.runMode &&
        opt.chatMode === this.lastSelectedMode.chatMode,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      title: 'PromptVault – Select run mode',
      placeHolder: 'How would you like to use this prompt?',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (selected) {
      this.lastSelectedMode = selected;
    }

    return selected as RunModeOption | undefined;
  }
}
```

---

### 3.8 `ResponsePanelManager` — LM API Result Panel

**File:** `src/services/ResponsePanelManager.ts`

**Responsibility:** Manages the Webview panel that displays streaming responses from the Language Model API. The panel is a singleton — if already open, its content is reset on each new run.

```typescript
export interface ResponsePanelState {
  promptText: string;
  modelId: string;
  responseChunks: string[];
  isComplete: boolean;
  error?: { message: string; code: string };
}

export class ResponsePanelManager {
  private panel: vscode.WebviewPanel | undefined;
  private state: ResponsePanelState | undefined;

  show(initial: Pick<ResponsePanelState, 'promptText' | 'modelId'>): void;
  appendChunk(chunk: string): void;
  markComplete(): void;
  showError(message: string, code: string): void;
  dispose(): void;

  private createPanel(): vscode.WebviewPanel;
  private updateWebview(): void;
  private getWebviewContent(): string; // returns HTML with React bundle
}
```

**Webview React component (`ResponsePanel.tsx`) — UI sections:**

```typescript
// 1. Header: model name, status indicator (streaming / complete / error)
// 2. Prompt preview (collapsible): the prompt text that was sent
// 3. Response area: markdown-rendered streaming output
// 4. Actions: Copy response | Insert to editor | New chat with this context
```

---

## 4. Entry Points — Command Registration

### 4.1 Commands in `package.json`

```json
{
  "contributes": {
    "commands": [
      {
        "command": "promptvault.runTemplate",
        "title": "PromptVault: Run Template",
        "icon": "$(play)"
      },
      {
        "command": "promptvault.runTemplateWithMode",
        "title": "PromptVault: Run Template (select mode)",
        "icon": "$(play-circle)"
      },
      {
        "command": "promptvault.runTemplateInsert",
        "title": "PromptVault: Insert to Chat"
      },
      {
        "command": "promptvault.runTemplateSend",
        "title": "PromptVault: Send to Chat"
      },
      {
        "command": "promptvault.runTemplateClipboard",
        "title": "PromptVault: Copy to Clipboard"
      }
    ],
    "keybindings": [
      {
        "command": "promptvault.runTemplate",
        "key": "ctrl+shift+enter",
        "mac": "cmd+shift+enter",
        "when": "focusedView == promptvault.promptList"
      }
    ],
    "menus": {
      "view/item/context": [
        {
          "command": "promptvault.runTemplate",
          "when": "viewItem == promptEntry",
          "group": "1_run@1"
        },
        {
          "command": "promptvault.runTemplateWithMode",
          "when": "viewItem == promptEntry",
          "group": "1_run@2"
        },
        {
          "command": "promptvault.runTemplateClipboard",
          "when": "viewItem == promptEntry",
          "group": "1_run@3"
        }
      ]
    }
  }
}
```

### 4.2 Registration in `extension.ts`

```typescript
export function activate(context: vscode.ExtensionContext) {
  // ... service initialization ...

  const runTemplateService = new RunTemplateService(
    promptService,
    contextService,
    new InputCollectorView(),
    {
      copilot: new CopilotChatAdapter(),
      lmApi: new LMApiAdapter(new ResponsePanelManager(context)),
      clipboard: new ClipboardAdapter(),
    },
  );

  const runModeQuickPick = new RunModeQuickPick();

  // Default run (insert to chat, ask mode)
  context.subscriptions.push(
    vscode.commands.registerCommand('promptvault.runTemplate', async (item: PromptTreeItem) => {
      await runTemplateService.execute({
        promptId: item.promptId,
        runMode: 'copilot-insert',
        chatMode: 'ask',
        skipModeSelection: true,
      });
    }),
  );

  // Run with mode selection
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'promptvault.runTemplateWithMode',
      async (item: PromptTreeItem) => {
        const mode = await runModeQuickPick.show();
        if (!mode) return;
        await runTemplateService.execute({
          promptId: item.promptId,
          runMode: mode.runMode,
          chatMode: mode.chatMode,
        });
      },
    ),
  );

  // ... remaining commands ...
}
```

---

## 5. Configuration Settings

Registered under `package.json → contributes.configuration`:

```json
{
  "promptvault.runTemplate.defaultMode": {
    "type": "string",
    "enum": ["copilot-insert", "copilot-send", "lm-api", "clipboard"],
    "default": "copilot-insert",
    "description": "Default run mode (used when clicking ▶ without selecting a mode)"
  },
  "promptvault.runTemplate.defaultChatMode": {
    "type": "string",
    "enum": ["ask", "edit", "agent"],
    "default": "ask",
    "description": "Default Copilot Chat mode (ask / edit / agent)"
  },
  "promptvault.runTemplate.showModeDropdown": {
    "type": "boolean",
    "default": false,
    "description": "Always show the mode selection dropdown before running a prompt"
  },
  "promptvault.runTemplate.preferredModel": {
    "type": "string",
    "default": "gpt-4o",
    "description": "Preferred model for 'Run in panel' mode (Language Model API)"
  },
  "promptvault.runTemplate.autoResolveContext": {
    "type": "boolean",
    "default": true,
    "description": "Automatically fill context variables (selectedText, fileName, etc.)"
  }
}
```

---

## 6. Error Handling and Edge Cases

| Scenario                                            | Behavior                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| Copilot Chat is not installed                       | `showErrorMessage` with marketplace link; fallback to clipboard        |
| `{{selectedText}}` — nothing selected               | Value = `""` + optional `showWarningMessage` asking whether to proceed |
| `{{gitBranch}}` — no git repository                 | Value = `"(no git)"` — no error, no blocking                           |
| User cancels InputCollector (Escape)                | `execute()` aborts silently, no messages shown                         |
| Language Model API — no Copilot subscription        | `showErrorMessage` with instructions; offer switch to clipboard        |
| Language Model API — rate limit exceeded            | `showWarningMessage` + retry after 5s (max 3 attempts)                 |
| Prompt with only auto variables (no input required) | Execute directly, no QuickInput — zero friction                        |
| `workbench.action.chat.open` throws an exception    | Catch + fallback to clipboard + `showWarningMessage`                   |

---

## 7. Tests

### 7.1 Unit Tests (`vitest`)

| Test file                    | What it tests                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `ContextService.test.ts`     | Variable parsing, resolving each variable type, edge cases (no editor, no git)   |
| `RunTemplateService.test.ts` | Flow orchestration, correct adapter invocation, cancellation handling            |
| `InputCollectorView.test.ts` | Mocking VS Code QuickInput, cancellation scenario                                |
| `CopilotChatAdapter.test.ts` | Mock `vscode.commands.executeCommand`, verify `isPartialQuery` and `mode` params |
| `variableParser.test.ts`     | Regex parsing of all variable types, edge cases in prompt body                   |

### 7.2 Integration Tests (`@vscode/test-electron`)

| Test                               | Scenario                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `runTemplate.integration.ts`       | End-to-end: open TS file with selection → run template → verify Copilot Chat received correct text |
| `contextResolution.integration.ts` | Actual context reading from an open file in VS Code                                                |

### 7.3 VS Code API Mock Scaffold

```typescript
// __mocks__/vscode.ts — unit test mock skeleton
const vscode = {
  commands: {
    executeCommand: vi.fn(),
    getCommands: vi.fn().mockResolvedValue(['workbench.action.chat.open']),
  },
  window: {
    activeTextEditor: {
      document: { getText: vi.fn(), languageId: 'typescript', fileName: 'test.ts', uri: {} },
      selection: { isEmpty: false },
    },
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    createInputBox: vi.fn(),
  },
  env: { clipboard: { writeText: vi.fn() } },
  workspace: { workspaceFolders: [{ name: 'test-project', uri: { fsPath: '/test' } }] },
  lm: { selectChatModels: vi.fn() },
  LanguageModelChatMessage: { User: vi.fn() },
};
```

---

## 8. Dependencies and Compatibility

### 8.1 npm Dependencies (new relative to MVP)

```json
{
  "dependencies": {
    // No new external dependencies for core Run Template.
    // Everything uses VS Code API or libraries already included in the MVP.
  },
  "devDependencies": {
    "@vscode/test-electron": "^2.4.0",
    "vitest": "^1.6.0"
  }
}
```

### 8.2 Minimum VS Code Version per Feature

| Feature                           | Min. VS Code version |
| --------------------------------- | -------------------- |
| `workbench.action.chat.open`      | 1.90                 |
| `isPartialQuery`                  | 1.96 (January 2025)  |
| `mode` parameter (ask/edit/agent) | 1.100 (April 2025)   |
| Language Model API (`vscode.lm`)  | 1.90                 |
| Chat Participant API              | 1.90                 |

**Recommended engine in `package.json`:**

```json
{ "engines": { "vscode": "^1.100.0" } }
```

### 8.3 Required Permissions in `package.json`

```json
{
  "extensionDependencies": [],
  "activationEvents": ["onCommand:promptvault.runTemplate", "onView:promptvault.promptList"]
}
```

> No `extensionDependencies` on Copilot required — integration is graceful (availability checked via `getCommands()`).

---

## 9. Implementation Plan (Suggested Tasks)

The tasks below represent a recommended implementation order. Each is independently testable.

| #    | Task                                                                | Dependencies           | Estimate |
| ---- | ------------------------------------------------------------------- | ---------------------- | -------- |
| T-01 | Variable parser (`extractVariables`, `applyInputVariables`) + tests | —                      | 2h       |
| T-02 | `ContextService` — auto variables: editor, workspace + tests        | T-01                   | 3h       |
| T-03 | `ContextService` — git, package.json, diagnostics + tests           | T-02                   | 2h       |
| T-04 | `InputCollectorView` (multi-step QuickInput) + tests                | —                      | 2h       |
| T-05 | `CopilotChatAdapter` + tests (mock executeCommand)                  | —                      | 1h       |
| T-06 | `ClipboardAdapter` + tests                                          | —                      | 1h       |
| T-07 | `RunTemplateService` (orchestration) + tests                        | T-02, T-04, T-05, T-06 | 3h       |
| T-08 | `RunModeQuickPick`                                                  | —                      | 1h       |
| T-09 | Command registration in `extension.ts` + `package.json`             | T-07, T-08             | 1h       |
| T-10 | UI: `[▶ Run]` button in TreeView Sidebar                            | T-09                   | 2h       |
| T-11 | UI: `[▶ Run]` button in Webview panel                               | T-09                   | 2h       |
| T-12 | `LMApiAdapter` (streaming)                                          | T-07                   | 3h       |
| T-13 | `ResponsePanelManager` + Webview HTML                               | T-12                   | 4h       |
| T-14 | End-to-end integration tests                                        | T-09                   | 3h       |
| T-15 | Configuration settings (`contributes.configuration`)                | T-07                   | 1h       |

**MVP total (T-01 to T-11, T-15): ~18h**
**v1.1 total (add T-12, T-13, T-14): +10h**

---

## 10. Open Questions / Decisions Required

1. **Default `[▶ Run]` behavior** — `copilot-insert` (insert without submitting) or `copilot-send` (auto-submit)? Recommendation: `insert` as default (lower risk of unintended submissions).

2. **Last-used mode persistence** — remember per-prompt or globally? Recommendation: globally (per session), simpler UX.

3. **Inline form vs. QuickInput** — collect `{{input:X}}` variables via QuickInput (simpler) or Webview form (better UX)? Recommendation: QuickInput for MVP, Webview form in v1.1.

4. **Claude Code fallback** — verify whether Claude Code exposes a `claude.openChat` command. Required before implementing T-06.

5. **Stability of `mode` parameter in `workbench.action.chat.open`** — marked as experimental in some versions; needs verification against VS Code 1.100+. If unsupported — gracefully fall back to `ask` mode only.
