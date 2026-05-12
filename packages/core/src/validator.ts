import type { PlaceholderDelimiters } from './placeholders.js';
import type {
  NormalizedInputDefinition,
  PlaceholderDefinition,
  Template,
  TemplateInputNormalizationResult,
  ValidationIssue,
  ValidationResult,
} from './types.js';

// Validation logic for templates and placeholder definitions.
import { DEFAULT_PLACEHOLDER_DELIMITERS, extractTemplateBodyTokens } from './placeholders.js';

// ── Regex constants ────────────────────────────────────
// Architecture §3.4
const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SNAKE_CASE_RE = /^[a-z0-9]+(_[a-z0-9]+)*$/;

// ── Public API ────────────────────────────────────────

/**
 * Validates a fully parsed Template against all 10 rules (V1–V10).
 *
 * Returns a ValidationResult with:
 *   - valid: true  → no Error-severity issues (warnings are allowed)
 *   - valid: false → at least one Error-severity issue exists
 */
export function validateTemplate(
  template: Template,
  options: { delimiters?: PlaceholderDelimiters } = {},
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const { frontmatter } = template;
  const delimiters = options.delimiters ?? DEFAULT_PLACEHOLDER_DELIMITERS;
  const normalization = normalizeTemplateInputs(template, { delimiters });

  // ── V1: name present ──────────────────────────────────
  if (!frontmatter.name || frontmatter.name.trim() === '') {
    issues.push({
      field: 'name',
      message: 'Template name is required',
      severity: 'error',
    });
  } else if (!KEBAB_CASE_RE.test(frontmatter.name)) {
    // ── V2: name is kebab-case ───────────────────────────
    issues.push({
      field: 'name',
      message: `Template name must be kebab-case (e.g. "my-template"), got: "${frontmatter.name}"`,
      severity: 'error',
    });
  }

  // ── V3: description present ───────────────────────────
  if (!frontmatter.description || frontmatter.description.trim() === '') {
    issues.push({
      field: 'description',
      message: 'Template description is required',
      severity: 'error',
    });
  }

  // ── V4: version is positive integer ──────────────────
  if (!Number.isInteger(frontmatter.version) || frontmatter.version < 1) {
    issues.push({
      field: 'version',
      message: `Template version must be a positive integer, got: ${frontmatter.version}`,
      severity: 'error',
    });
  }

  const placeholders = frontmatter.placeholders ?? [];
  const seenNames = new Set<string>();

  placeholders.forEach((p, i) => {
    // ── V5: placeholder name is snake_case ───────────────
    if (!p.name || p.name.trim() === '' || !SNAKE_CASE_RE.test(p.name)) {
      issues.push({
        field: `placeholders[${i}].name`,
        message: `Placeholder name must be snake_case (e.g. "entity_name"), got: "${p.name}"`,
        severity: 'error',
      });
    }

    // ── V6: placeholder description present ──────────────
    if (!p.description || p.description.trim() === '') {
      issues.push({
        field: `placeholders[${i}].description`,
        message: `Placeholder "${p.name}" is missing a description`,
        severity: 'error',
      });
    }

    // ── V7: no duplicate placeholder names ───────────────
    if (p.name) {
      if (seenNames.has(p.name)) {
        issues.push({
          field: `placeholders[${i}].name`,
          message: `Duplicate placeholder name: "${p.name}"`,
          severity: 'error',
        });
      } else {
        seenNames.add(p.name);
      }
    }
  });

  issues.push(...normalization.issues);

  return {
    issues,
    valid: issues.every((issue) => issue.severity !== 'error'),
  };
}

export function normalizeTemplateInputs(
  template: Template,
  options: { delimiters?: PlaceholderDelimiters } = {},
): TemplateInputNormalizationResult {
  const delimiters = options.delimiters ?? DEFAULT_PLACEHOLDER_DELIMITERS;
  const bodyTokens = extractTemplateBodyTokens(template.body, delimiters);
  const placeholders = template.frontmatter.placeholders ?? [];
  const issues: ValidationIssue[] = [];
  const normalizedByName = new Map<string, MutableNormalizedInputDefinition>();
  const frontmatterByName = new Map(
    placeholders.map((placeholder) => [placeholder.name, placeholder]),
  );
  const legacyNamesInBody = new Set<string>();

  for (const bodyToken of bodyTokens) {
    switch (bodyToken.kind) {
      case 'context':
        continue;
      case 'invalid-inline-input':
        issues.push({
          message: `Body contains invalid inline input token: "${renderPlaceholderToken(bodyToken.token, delimiters)}"`,
          severity: 'error',
        });
        continue;
      case 'inline-input': {
        const existing = normalizedByName.get(bodyToken.inputName);
        if (existing === undefined) {
          normalizedByName.set(
            bodyToken.inputName,
            createNormalizedInputDefinition(bodyToken.inputName, bodyToken.defaultValue, 'inline'),
          );
          continue;
        }

        addSource(existing, 'inline');
        if (bodyToken.defaultValue === undefined) {
          continue;
        }

        if (existing.inlineDefaultValue === undefined) {
          existing.inlineDefaultValue = bodyToken.defaultValue;
          if (existing.defaultValue === undefined || existing.defaultSource === 'frontmatter') {
            existing.defaultValue = bodyToken.defaultValue;
            existing.defaultSource = 'inline';
          }
          continue;
        }

        if (existing.inlineDefaultValue !== bodyToken.defaultValue) {
          issues.push({
            message: `Input "${bodyToken.inputName}" has conflicting inline defaults: "${existing.inlineDefaultValue}" and "${bodyToken.defaultValue}"`,
            severity: 'error',
          });
        }
        continue;
      }
      case 'legacy-placeholder': {
        legacyNamesInBody.add(bodyToken.placeholderName);
        const frontmatterPlaceholder = frontmatterByName.get(bodyToken.placeholderName);
        if (
          frontmatterPlaceholder === undefined &&
          !normalizedByName.has(bodyToken.placeholderName)
        ) {
          issues.push({
            message: `Body references undeclared placeholder: "${renderPlaceholderToken(bodyToken.placeholderName, delimiters)}"`,
            severity: 'warning',
          });
          continue;
        }

        const existing = normalizedByName.get(bodyToken.placeholderName);
        if (existing !== undefined) {
          addSource(existing, 'legacy');
        } else {
          normalizedByName.set(
            bodyToken.placeholderName,
            createNormalizedInputDefinition(bodyToken.placeholderName, undefined, 'legacy'),
          );
        }
      }
    }
  }

  for (const placeholder of placeholders) {
    const existing = normalizedByName.get(placeholder.name);
    if (existing === undefined) {
      normalizedByName.set(
        placeholder.name,
        createNormalizedInputDefinition(
          placeholder.name,
          placeholder.default,
          'frontmatter',
          placeholder,
        ),
      );
      continue;
    }

    addSource(existing, 'frontmatter');
    applyFrontmatterMetadata(existing, placeholder);
  }

  const normalizedInputs = [...normalizedByName.values()].map((input) =>
    finalizeNormalizedInputDefinition(input),
  );

  for (const input of normalizedInputs) {
    if (input.sources.includes('inline') && input.sources.includes('legacy')) {
      issues.push({
        message: `Input "${input.name}" mixes inline "{{input:${input.name}}}" and legacy "{{${input.name}}}" syntax`,
        severity: 'warning',
      });
    }

    if (
      input.sources.length === 1 &&
      input.sources[0] === 'frontmatter' &&
      !legacyNamesInBody.has(input.name)
    ) {
      issues.push({
        field: 'placeholders',
        message: `Placeholder "${input.name}" is declared but not referenced in the body`,
        severity: 'warning',
      });
    }

    const frontmatterPlaceholder = frontmatterByName.get(input.name);
    if (frontmatterPlaceholder?.required === true && input.defaultValue !== undefined) {
      issues.push({
        field: `placeholders[${placeholders.indexOf(frontmatterPlaceholder)}]`,
        message: `Placeholder "${input.name}" is marked required but has a default value (effectively optional)`,
        severity: 'warning',
      });
    }
  }

  return {
    inputs: normalizedInputs,
    issues: dedupeValidationIssues(issues),
  };
}

/**
 * Validates raw (pre-parse) frontmatter data.
 * Accepts an unknown value (the result of YAML.parse) and checks it
 * against frontmatter-only rules V1–V7 and V10.
 * Rules V8 and V9 require the template body and are not checked here.
 */
export function validateFrontmatter(raw: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    issues.push({
      message: 'Frontmatter must be a YAML mapping (key-value object)',
      severity: 'error',
    });
    return { issues, valid: false };
  }

  const fm = raw as Record<string, unknown>;

  // ── V1: name present ──────────────────────────────────
  if (!fm['name'] || typeof fm['name'] !== 'string' || fm['name'].trim() === '') {
    issues.push({
      field: 'name',
      message: 'Template name is required',
      severity: 'error',
    });
  } else if (!KEBAB_CASE_RE.test(fm['name'])) {
    // ── V2: name is kebab-case ───────────────────────────
    issues.push({
      field: 'name',
      message: `Template name must be kebab-case (e.g. "my-template"), got: "${fm['name']}"`,
      severity: 'error',
    });
  }

  // ── V3: description present ───────────────────────────
  if (
    !fm['description'] ||
    typeof fm['description'] !== 'string' ||
    fm['description'].trim() === ''
  ) {
    issues.push({
      field: 'description',
      message: 'Template description is required',
      severity: 'error',
    });
  }

  // ── V4: version is positive integer ──────────────────
  if (!Number.isInteger(fm['version']) || (fm['version'] as number) < 1) {
    issues.push({
      field: 'version',
      message: `Template version must be a positive integer, got: ${fm['version'] as number}`,
      severity: 'error',
    });
  }

  // ── Placeholder rules V5, V6, V7, V10 ────────────────
  if (Array.isArray(fm['placeholders'])) {
    const seenNames = new Set<string>();

    for (let i = 0; i < fm['placeholders'].length; i++) {
      const p = fm['placeholders'][i];

      if (!p || typeof p !== 'object' || Array.isArray(p)) {
        issues.push({
          field: `placeholders[${i}]`,
          message: `Placeholder at index ${i} must be an object`,
          severity: 'error',
        });
        continue;
      }

      const placeholder = p as Record<string, unknown>;
      const pName = typeof placeholder['name'] === 'string' ? placeholder['name'] : '';

      // V5
      if (!pName || !SNAKE_CASE_RE.test(pName)) {
        issues.push({
          field: `placeholders[${i}].name`,
          message: `Placeholder name must be snake_case (e.g. "entity_name"), got: "${pName}"`,
          severity: 'error',
        });
      }

      // V6
      if (
        !placeholder['description'] ||
        typeof placeholder['description'] !== 'string' ||
        placeholder['description'].trim() === ''
      ) {
        issues.push({
          field: `placeholders[${i}].description`,
          message: `Placeholder "${pName}" is missing a description`,
          severity: 'error',
        });
      }

      // V7
      if (pName) {
        if (seenNames.has(pName)) {
          issues.push({
            field: `placeholders[${i}].name`,
            message: `Duplicate placeholder name: "${pName}"`,
            severity: 'error',
          });
        } else {
          seenNames.add(pName);
        }
      }

      // V10
      if (placeholder['required'] === true && placeholder['default'] !== undefined) {
        issues.push({
          field: `placeholders[${i}]`,
          message: `Placeholder "${pName}" is marked required but has a default value (effectively optional)`,
          severity: 'warning',
        });
      }
    }
  }

  return {
    issues,
    valid: issues.every((issue) => issue.severity !== 'error'),
  };
}

// ── Internal helpers ──────────────────────────────────

function renderPlaceholderToken(token: string, delimiters: PlaceholderDelimiters): string {
  return `${delimiters.start}${token}${delimiters.end}`;
}

type MutableNormalizedInputDefinition = NormalizedInputDefinition & {
  defaultSource?: 'frontmatter' | 'inline';
  inlineDefaultValue?: string;
  sourceSet: Set<'frontmatter' | 'inline' | 'legacy'>;
};

function createNormalizedInputDefinition(
  name: string,
  defaultValue: string | undefined,
  source: 'frontmatter' | 'inline' | 'legacy',
  placeholder?: PlaceholderDefinition,
): MutableNormalizedInputDefinition {
  const sourceSet = new Set<'frontmatter' | 'inline' | 'legacy'>([source]);
  const normalized: MutableNormalizedInputDefinition = {
    name,
    required: placeholder?.required ?? defaultValue === undefined,
    sources: [...sourceSet],
    sourceSet,
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(placeholder?.description !== undefined ? { description: placeholder.description } : {}),
    ...(placeholder?.options !== undefined ? { options: placeholder.options } : {}),
    ...(placeholder?.type !== undefined ? { type: placeholder.type } : {}),
    ...(defaultValue !== undefined
      ? { defaultSource: source === 'frontmatter' ? 'frontmatter' : 'inline' }
      : {}),
  };

  if (source === 'inline' && defaultValue !== undefined) {
    normalized.inlineDefaultValue = defaultValue;
  }

  return normalized;
}

function applyFrontmatterMetadata(
  input: MutableNormalizedInputDefinition,
  placeholder: PlaceholderDefinition,
): void {
  if (placeholder.description.trim().length > 0) {
    input.description = placeholder.description;
  }

  if (placeholder.options !== undefined) {
    input.options = placeholder.options;
  }

  if (placeholder.type !== undefined) {
    input.type = placeholder.type;
  }

  if (input.defaultValue === undefined && placeholder.default !== undefined) {
    input.defaultValue = placeholder.default;
    input.defaultSource = 'frontmatter';
  }

  input.required = input.defaultValue === undefined ? placeholder.required !== false : false;
}

function finalizeNormalizedInputDefinition(
  input: MutableNormalizedInputDefinition,
): NormalizedInputDefinition {
  const {
    defaultSource: _defaultSource,
    inlineDefaultValue: _inlineDefaultValue,
    sourceSet,
    ...rest
  } = input;

  return {
    ...rest,
    required: rest.defaultValue === undefined ? rest.required : false,
    sources: [...sourceSet],
  };
}

function addSource(
  input: MutableNormalizedInputDefinition,
  source: 'frontmatter' | 'inline' | 'legacy',
): void {
  input.sourceSet.add(source);
  input.sources = [...input.sourceSet];
}

function dedupeValidationIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();

  return issues.filter((issue) => {
    const key = [issue.severity, issue.field ?? '', issue.line ?? '', issue.message].join('\u0000');
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
