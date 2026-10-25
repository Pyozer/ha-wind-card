import { resolveSources, readSpeed, type SourceRef } from '../reading';
import type { LocalizeKey } from '../localize/localize';
import type { HomeAssistant, LiveWindCardConfig } from '../types';

/** Checks shown by the editor: what the card would read but cannot. */

export type WindIssue =
  | { kind: 'no_source' }
  | { kind: 'missing_entity'; entity: string }
  | { kind: 'missing_attribute'; entity: string; attribute: string }
  | { kind: 'no_value'; entity: string };

export function windIssues(config: LiveWindCardConfig, hass: HomeAssistant | undefined): WindIssue[] {
  const sources = resolveSources(config);
  if (!sources.speed) return [{ kind: 'no_source' }];
  if (!hass) return [];

  const issues: WindIssue[] = [];
  const check = (ref: SourceRef | undefined) => {
    if (!ref) return;
    const entity = hass.states[ref.entity];
    if (!entity) issues.push({ kind: 'missing_entity', entity: ref.entity });
    else if (ref.attribute && entity.attributes?.[ref.attribute] === undefined) {
      issues.push({ kind: 'missing_attribute', entity: ref.entity, attribute: ref.attribute });
    }
  };
  // The same entity may be read three times (a weather entity): report it once per problem.
  [sources.speed, sources.gust, sources.direction].forEach(check);
  if (
    readSpeed(hass.states, sources.speed) === null &&
    !issues.some((i) => 'entity' in i && i.entity === sources.speed!.entity)
  ) {
    issues.push({ kind: 'no_value', entity: sources.speed.entity });
  }
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = JSON.stringify(issue);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function describeIssue(
  issue: WindIssue,
  t: (key: LocalizeKey, vars?: Record<string, string>) => string,
): string {
  switch (issue.kind) {
    case 'no_source':
      return t('editor.issue.no_source');
    case 'missing_entity':
      return t('editor.issue.missing_entity', { entity: issue.entity });
    case 'missing_attribute':
      return t('editor.issue.missing_attribute', { entity: issue.entity, attribute: issue.attribute });
    case 'no_value':
      return t('editor.issue.no_value', { entity: issue.entity });
  }
}
