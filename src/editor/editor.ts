import { mdiAlertOutline } from '@mdi/js';
import { LitElement, html, nothing, type TemplateResult } from 'lit';
import { fireEvent } from '../actions';
import { localize, type LocalizeKey } from '../localize/localize';
import type { HomeAssistant, LiveWindCardConfig } from '../types';
import { fromFormData, toFormData } from './form';
import { EditorSchema, fieldHelper, fieldLabel } from './schema';
import { editorStyles } from './styles';
import { describeIssue, windIssues } from './validation';

export class LiveWindCardEditor extends LitElement {
  static override styles = editorStyles;

  static override properties = {
    hass: { attribute: false },
    _config: { state: true },
  };

  declare hass?: HomeAssistant;
  declare _config?: LiveWindCardConfig;

  setConfig(config: LiveWindCardConfig): void {
    this._config = config;
  }

  private _t = (key: LocalizeKey, vars?: Record<string, string>): string =>
    localize(this.hass?.locale?.language ?? this.hass?.language, key, vars);

  private _label = (schema: { name: string }): string => fieldLabel(this._t, schema.name);

  private _helper = (schema: { name: string }): string => fieldHelper(this._t, schema.name);

  private _valueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    if (!this._config) return;
    const next = fromFormData(ev.detail.value as Record<string, unknown>, this._config);
    // `type` first for readable YAML.
    const { type, ...rest } = next;
    this._config = { type, ...rest };
    fireEvent(this, 'config-changed', { config: this._config });
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const issues = windIssues(this._config, this.hass);
    return html`
      ${
        issues.length
          ? html`<div class="issues" role="status">
              <div class="issues-title">
                <ha-svg-icon .path=${mdiAlertOutline}></ha-svg-icon>
                ${this._t('editor.issues', { count: String(issues.length) })}
              </div>
              <ul>
                ${issues.map((issue) => html`<li>${describeIssue(issue, this._t)}</li>`)}
              </ul>
            </div>`
          : nothing
      }
      <ha-form
        .hass=${this.hass}
        .data=${toFormData(this._config)}
        .schema=${new EditorSchema(this._t, this.hass).card(this._config)}
        .computeLabel=${this._label}
        .computeHelper=${this._helper}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }
}

if (!customElements.get('live-wind-card-editor')) {
  customElements.define('live-wind-card-editor', LiveWindCardEditor);
}
