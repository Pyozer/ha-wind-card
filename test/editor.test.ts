import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../src/config';
import { fromFormData, toFormData } from '../src/editor/form';
import { EditorSchema, fieldHelper, fieldLabel, schemaFields, type Schema } from '../src/editor/schema';
import { describeIssue, windIssues } from '../src/editor/validation';
import { localize, type LocalizeKey } from '../src/localize/localize';
import type { HassEntity, HomeAssistant, LiveWindCardConfig } from '../src/types';

const entity = (id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity => ({
  entity_id: id,
  state,
  attributes,
});
const hass = (...list: HassEntity[]): HomeAssistant => ({
  states: Object.fromEntries(list.map((e) => [e.entity_id, e])),
});
const CONFIG: LiveWindCardConfig = { type: 'custom:live-wind-card', weather_entity: 'weather.home' };

describe('form data', () => {
  it('shows a value for every option with a default, and the history window as text', () => {
    const data = toFormData(CONFIG);
    for (const [key, value] of Object.entries(DEFAULTS)) {
      expect(data[key], key).toBe(key === 'history_hours' ? String(value) : value);
    }
    expect(data.weather_entity).toBe('weather.home');
    expect(data.history_windows).toEqual(['3', '12', '24']);
  });

  it('writes only what differs from the defaults', () => {
    const config = fromFormData(
      { ...toFormData(CONFIG), unit: 'ms', show_gust: false, name: 'Wind' },
      CONFIG,
    );
    expect(config).toEqual({
      type: 'custom:live-wind-card',
      weather_entity: 'weather.home',
      unit: 'ms',
      show_gust: false,
      name: 'Wind',
    });
  });

  it('writes an option back to its default by dropping it', () => {
    const changed = fromFormData({ ...toFormData(CONFIG), unit: 'ms' }, CONFIG);
    expect(fromFormData({ ...toFormData(changed), unit: 'auto' }, changed)).toEqual(CONFIG);
  });

  it('writes the beam when it is turned on and the rose when it is turned off', () => {
    expect(toFormData(CONFIG)).toMatchObject({ show_rose: true, show_beam: false });
    const config = fromFormData({ ...toFormData(CONFIG), show_rose: false, show_beam: true }, CONFIG);
    expect(config).toEqual({ ...CONFIG, show_rose: false, show_beam: true });
    expect(fromFormData(toFormData(config), config)).toEqual(config);
    expect(fromFormData({ ...toFormData(config), show_rose: true, show_beam: false }, config)).toEqual(
      CONFIG,
    );
  });

  it('writes a toggle that is on by default when it is turned off, and keeps it off', () => {
    const off = fromFormData({ ...toFormData(CONFIG), animations: false }, CONFIG);
    expect(off.animations).toBe(false);
    expect(fromFormData(toFormData(off), off).animations).toBe(false);
  });

  it('shows the windows chosen, shortest first, and writes them back as numbers', () => {
    const config: LiveWindCardConfig = { ...CONFIG, history_windows: [72, 3, 24] };
    expect(toFormData(config).history_windows).toEqual(['3', '24', '72']);
    expect(fromFormData(toFormData(config), config).history_windows).toEqual([3, 24, 72]);
    const picked = fromFormData({ ...toFormData(CONFIG), history_windows: ['24', '3', '6', '48'] }, CONFIG);
    expect(picked.history_windows).toEqual([3, 6, 24, 48]);
  });

  it('does not write the default windows, and brings them back when the list is emptied', () => {
    expect(fromFormData({ ...toFormData(CONFIG), history_windows: ['12', '24', '3'] }, CONFIG)).toEqual(
      CONFIG,
    );
    const config: LiveWindCardConfig = { ...CONFIG, history_windows: [24] };
    expect(fromFormData({ ...toFormData(config), history_windows: [] }, config)).toEqual(CONFIG);
    expect(fromFormData({ ...toFormData(config), history_windows: undefined }, config)).toEqual(CONFIG);
  });

  it('turns the history window back into a number', () => {
    expect(fromFormData({ ...toFormData(CONFIG), history_hours: '24' }, CONFIG).history_hours).toBe(24);
    expect(
      fromFormData({ ...toFormData(CONFIG), history_hours: '12' }, CONFIG).history_hours,
    ).toBeUndefined();
  });

  it('drops an entity or a text that was emptied', () => {
    const config: LiveWindCardConfig = { ...CONFIG, name: 'Wind', speed_entity: 'sensor.wind' };
    const out = fromFormData({ ...toFormData(config), name: '', speed_entity: undefined }, config);
    expect(out).toEqual(CONFIG);
  });

  it('keeps the actions, and the options the form does not know', () => {
    const config = {
      ...CONFIG,
      tap_action: { action: 'navigate', navigation_path: '/x' },
      card_mod: { style: 'x' },
    } as LiveWindCardConfig;
    expect(fromFormData(toFormData(config), config)).toEqual(config);
  });
});

describe('editor schema', () => {
  const en = (key: LocalizeKey, vars?: Record<string, string>) => localize('en', key, vars);
  const fr = (key: LocalizeKey, vars?: Record<string, string>) => localize('fr', key, vars);
  const schema = new EditorSchema(
    en,
    hass(entity('sensor.a', '1', { device_class: 'wind_speed' }), entity('weather.home', 'sunny')),
  ).card(CONFIG);
  const fields = schemaFields(schema);

  it('covers every option of the card that the form can set', () => {
    for (const key of Object.keys(DEFAULTS)) expect(fields, key).toContain(key);
    for (const key of [
      'weather_entity',
      'speed_entity',
      'gust_entity',
      'direction_entity',
      'name',
      'subtitle',
      'tap_action',
      'hold_action',
      'double_tap_action',
    ]) {
      expect(fields, key).toContain(key);
    }
  });

  it('labels every field in every language', () => {
    for (const field of fields) {
      for (const t of [en, fr]) expect(fieldLabel(t, field), field).not.toBe(field);
    }
    expect(fieldLabel(en, '')).toBe('');
    expect(fieldLabel(en, 'unknown_field')).toBe('unknown_field');
  });

  it('has help for the fields that need it, and none for the others', () => {
    expect(fieldHelper(en, 'weather_entity')).toMatch(/speed/);
    expect(fieldHelper(fr, 'weather_entity')).toMatch(/vitesse/);
    expect(fieldHelper(en, 'name')).toBe('');
  });

  it('labels every option of every choice, in every language', () => {
    const selects: { name: string; options: { value: string; label: string }[] }[] = [];
    const walk = (items: Schema[]) =>
      items.forEach((item) => {
        const select = (
          item.selector as { select?: { options: { value: string; label: string }[] } } | undefined
        )?.select;
        if (select) selects.push({ name: item.name as string, options: select.options });
        if (item.schema) walk(item.schema as Schema[]);
      });
    for (const t of [en, fr]) {
      selects.length = 0;
      walk(new EditorSchema(t, hass()).card(CONFIG));
      expect(selects.map((s) => s.name)).toEqual([
        'unit',
        'arrow',
        'compass_letters',
        'colors',
        'layout',
        'history_hours',
        'history_windows',
        'language',
      ]);
      for (const { name, options } of selects) {
        expect(options.length, name).toBeGreaterThan(1);
        for (const option of options)
          expect(option.label, `${name}.${option.value}`).not.toMatch(/^editor\./);
      }
    }
  });

  it('offers the wind entities, and keeps the one already chosen', () => {
    const withOdd = new EditorSchema(en, hass(entity('sensor.a', '1', { device_class: 'wind_speed' }))).card({
      ...CONFIG,
      speed_entity: 'sensor.odd',
    });
    const speed = JSON.stringify(withOdd);
    expect(speed).toContain('sensor.a');
    expect(speed).toContain('sensor.odd');
  });

  it('reads the attribute of the entity picked just above it', () => {
    const attribute = (
      JSON.stringify(schema).match(
        /"name":"(\w+)_attribute","selector":\{"attribute":\{\}\},"context":\{"filter_entity":"(\w+)"\}/g,
      ) ?? []
    ).length;
    expect(attribute).toBe(3);
  });
});

describe('issues', () => {
  const t = (key: LocalizeKey, vars?: Record<string, string>) => localize('en', key, vars);

  it('asks for an entity when there is none', () => {
    expect(windIssues({ type: 'x' }, hass())).toEqual([{ kind: 'no_source' }]);
    expect(describeIssue({ kind: 'no_source' }, t)).toMatch(/weather entity/);
  });

  it('is happy with a weather entity that reports a wind', () => {
    const h = hass(
      entity('weather.home', 'sunny', { wind_speed: 12, wind_gust_speed: 20, wind_bearing: 90 }),
    );
    expect(windIssues(CONFIG, h)).toEqual([]);
  });

  it('reports a missing entity once, even when it is read three times', () => {
    expect(windIssues(CONFIG, hass())).toEqual([{ kind: 'missing_entity', entity: 'weather.home' }]);
    expect(describeIssue({ kind: 'missing_entity', entity: 'weather.home' }, t)).toBe(
      'weather.home was not found.',
    );
  });

  it('reports the attributes a weather entity lacks', () => {
    const issues = windIssues(CONFIG, hass(entity('weather.home', 'sunny', { wind_speed: 12 })));
    expect(issues).toEqual([
      { kind: 'missing_attribute', entity: 'weather.home', attribute: 'wind_gust_speed' },
      { kind: 'missing_attribute', entity: 'weather.home', attribute: 'wind_bearing' },
    ]);
    expect(describeIssue(issues[0], t)).toBe('weather.home has no “wind_gust_speed” attribute.');
  });

  it('reports a speed sensor that has no usable value', () => {
    const issues = windIssues(
      { type: 'x', speed_entity: 'sensor.wind' },
      hass(entity('sensor.wind', 'unavailable')),
    );
    expect(issues).toEqual([{ kind: 'no_value', entity: 'sensor.wind' }]);
    expect(describeIssue(issues[0], t)).toBe('sensor.wind has no usable value.');
  });

  it('has nothing to check without Home Assistant', () => {
    expect(windIssues(CONFIG, undefined)).toEqual([]);
  });
});
