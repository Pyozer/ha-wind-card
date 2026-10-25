import { ARROWS, COLOR_MODES, COMPASS_OPTIONS, HISTORY_WINDOWS, LAYOUTS, UNITS } from '../config';
import { entitySelector } from '../entities';
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, type LocalizeKey } from '../localize/localize';
import type { HomeAssistant, LiveWindCardConfig } from '../types';

/** `ha-form` schema of the visual editor. */

export type Schema = Record<string, unknown>;
export type Translate = (key: LocalizeKey, vars?: Record<string, string>) => string;

const grid = (schema: Schema[]): Schema => ({ type: 'grid', name: '', schema });

const booleans = (names: readonly string[]): Schema[] =>
  names.map((name) => ({ name, selector: { boolean: {} } }));

const text = (name: string): Schema => ({ name, selector: { text: {} } });

/** Key of the label of an option: the history windows are `h3`, `h12`, `h24`. */
const optionKey = (field: string, value: string | number): LocalizeKey =>
  `editor.option.${field.startsWith('history_') ? 'history_hours' : field}.${field.startsWith('history_') ? `h${value}` : value}` as LocalizeKey;

export class EditorSchema {
  constructor(
    private readonly t: Translate,
    private readonly hass: HomeAssistant | undefined,
  ) {}

  private select(field: string, values: readonly (string | number)[], multiple = false): Schema {
    return {
      name: field,
      selector: {
        select: {
          // Several choices are checkboxes: they are all in sight, and ticked or not.
          ...(multiple ? { multiple: true, mode: 'list' } : { mode: 'dropdown' }),
          options: values.map((value) => ({ value: String(value), label: this.t(optionKey(field, value)) })),
        },
      },
    };
  }

  private languages(): Schema {
    return {
      name: 'language',
      selector: {
        select: {
          mode: 'dropdown',
          options: [
            { value: 'auto', label: this.t('editor.option.language.auto') },
            ...SUPPORTED_LANGUAGES.map((value) => ({ value, label: LANGUAGE_NAMES[value] })),
          ],
        },
      },
    };
  }

  /** An entity and the attribute to read on it. */
  private source(kind: 'speed' | 'direction', prefix: string, config: LiveWindCardConfig): Schema[] {
    const entity = `${prefix}_entity` as keyof LiveWindCardConfig;
    return [
      { name: entity, selector: entitySelector(this.hass, kind, [config[entity] as string | undefined]) },
      { name: `${prefix}_attribute`, selector: { attribute: {} }, context: { filter_entity: entity } },
    ];
  }

  card(config: LiveWindCardConfig): Schema[] {
    const t = this.t;
    return [
      { name: 'weather_entity', selector: { entity: { filter: [{ domain: 'weather' }] } } },
      {
        type: 'expandable',
        name: '',
        flatten: true,
        title: t('editor.section.custom'),
        icon: 'mdi:tune-variant',
        schema: [
          ...this.source('speed', 'speed', config),
          ...this.source('speed', 'gust', config),
          ...this.source('direction', 'direction', config),
        ],
      },
      {
        type: 'expandable',
        name: '',
        flatten: true,
        expanded: true,
        title: t('editor.section.display'),
        icon: 'mdi:palette-outline',
        schema: [
          grid([text('name'), text('subtitle')]),
          grid([this.select('unit', UNITS), this.select('arrow', ARROWS)]),
          grid([this.select('compass_letters', COMPASS_OPTIONS), this.select('colors', COLOR_MODES)]),
          grid([this.select('layout', LAYOUTS), this.select('history_hours', HISTORY_WINDOWS)]),
          this.select('history_windows', HISTORY_WINDOWS, true),
          {
            name: 'max_speed',
            selector: { number: { min: 10, max: 300, step: 5, mode: 'box', unit_of_measurement: 'km/h' } },
          },
          this.languages(),
        ],
      },
      {
        type: 'expandable',
        name: '',
        flatten: true,
        title: t('editor.section.elements'),
        icon: 'mdi:view-dashboard-outline',
        schema: booleans([
          'show_gust',
          'show_stats',
          'show_beaufort',
          'show_history',
          'show_history_arrows',
          'show_updated',
          'animations',
        ]),
      },
      {
        type: 'expandable',
        name: '',
        flatten: true,
        title: t('editor.section.actions'),
        icon: 'mdi:gesture-tap',
        schema: [
          { name: 'tap_action', selector: { ui_action: {} } },
          { name: 'hold_action', selector: { ui_action: {} } },
          { name: 'double_tap_action', selector: { ui_action: {} } },
        ],
      },
    ];
  }
}

/** Label of a field: `editor.field.<name>`, or the raw name when there is no translation. */
export function fieldLabel(t: Translate, name: string): string {
  if (!name) return '';
  const key = `editor.field.${name}` as LocalizeKey;
  const text = t(key);
  return text === key ? name : text;
}

/** Help text under a field: `editor.helper.<name>`, empty when there is none. */
export function fieldHelper(t: Translate, name: string): string {
  const key = `editor.helper.${name}` as LocalizeKey;
  const text = t(key);
  return text === key ? '' : text;
}

/** Every field of the form, for the tests that check they are all labelled. */
export function schemaFields(schema: Schema[]): string[] {
  return schema.flatMap((item) => {
    const nested = item.schema as Schema[] | undefined;
    if (nested) return schemaFields(nested);
    return typeof item.name === 'string' && item.name ? [item.name] : [];
  });
}
