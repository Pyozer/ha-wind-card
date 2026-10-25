/** Configuration of the card and the minimal Home Assistant types it relies on. */

/** Speed units a value can be displayed in. `bft` is the Beaufort force (0 to 12). */
export type SpeedUnit = 'kmh' | 'ms' | 'kn' | 'mph' | 'bft';

export type CompassLetters = 'NESO' | 'NESW';
export type ColorMode = 'beaufort' | 'accent';
export type Layout = 'full' | 'compact';
export type ArrowMode = 'to' | 'from';
/** Durations the history can show, in hours (48 and 72 are written as 2 and 3 days). */
export type HistoryHours = 3 | 6 | 12 | 24 | 48 | 72;

/** A Home Assistant action (`tap_action`…), as handled by the frontend's `hass-action` event. */
export interface ActionConfig {
  action: string;
  entity?: string;
  navigation_path?: string;
  url_path?: string;
  perform_action?: string;
  target?: Record<string, unknown>;
  data?: Record<string, unknown>;
  confirmation?: unknown;
}

export interface CardActions {
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}

export interface LiveWindCardConfig extends CardActions {
  type: string;
  /** Title of the card. */
  name?: string;
  /** Text under the title (a place, for instance). */
  subtitle?: string;

  /** A `weather.*` entity: gives the speed, the gusts and the direction at once. */
  weather_entity?: string;
  /** Dedicated entities, which win over the weather entity. An attribute reads it instead of the state. */
  speed_entity?: string;
  speed_attribute?: string;
  gust_entity?: string;
  gust_attribute?: string;
  direction_entity?: string;
  direction_attribute?: string;

  /** Display unit; `auto` follows the unit system of Home Assistant. */
  unit?: 'auto' | SpeedUnit;
  /** `to`: the arrow shows where the wind blows to. `from`: where it comes from. */
  arrow?: ArrowMode;
  /** Letters of the compass; `auto` follows the language. */
  compass_letters?: 'auto' | CompassLetters;
  colors?: ColorMode;
  /** Speed (km/h) at which the arc of the dial is full. */
  max_speed?: number;
  layout?: Layout;
  /** History window shown at first (the closest selectable one when it is not among the windows). */
  history_hours?: HistoryHours;
  /** History windows the reader can switch between; one alone hides the switch. */
  history_windows?: HistoryHours[];

  show_gust?: boolean;
  show_stats?: boolean;
  show_beaufort?: boolean;
  show_history?: boolean;
  show_history_arrows?: boolean;
  show_updated?: boolean;
  /** Animated wind streaks in the dial. */
  animations?: boolean;

  /** `auto` follows the Home Assistant user. */
  language?: string;
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  language?: string;
  locale?: { language: string; number_format?: string };
  themes?: { darkMode?: boolean };
  config?: { unit_system?: { wind_speed?: string; length?: string } };
  callWS?: <T>(msg: Record<string, unknown>) => Promise<T>;
}
