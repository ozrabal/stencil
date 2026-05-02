import type { PlaceholderDelimiters } from './placeholders.js';
import type { Template, ValidationIssue, ValidationResult } from './types.js';

// Validation logic for templates and placeholder definitions.
import { DEFAULT_PLACEHOLDER_DELIMITERS, extractPlaceholderTokens } from './placeholders.js';

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
  const { body, frontmatter } = template;
  const delimiters = options.delimiters ?? DEFAULT_PLACEHOLDER_DELIMITERS;

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

    // ── V10: required placeholder has default ─────────────
    if (p.required === true && p.default !== undefined) {
      issues.push({
        field: `placeholders[${i}]`,
        message: `Placeholder "${p.name}" is marked required but has a default value (effectively optional)`,
        severity: 'warning',
      });
    }
  });

  // ── Body cross-checks (V8 and V9) ─────────────────────
  const bodyTokens = extractPlaceholderTokens(body, delimiters);
  const declaredNames = new Set(placeholders.map((p) => p.name).filter(Boolean));

  // V8: body references undeclared placeholder (ignore $ctx.*)
  for (const token of bodyTokens) {
    if (token.startsWith('$ctx.')) continue;
    if (!declaredNames.has(token)) {
      issues.push({
        message: `Body references undeclared placeholder: "${renderPlaceholderToken(token, delimiters)}"`,
        severity: 'warning',
      });
    }
  }

  // V9: declared placeholder not used in body
  for (const p of placeholders) {
    if (p.name && !bodyTokens.has(p.name)) {
      issues.push({
        field: 'placeholders',
        message: `Placeholder "${p.name}" is declared but not referenced in the body`,
        severity: 'warning',
      });
    }
  }

  return {
    issues,
    valid: issues.every((issue) => issue.severity !== 'error'),
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
