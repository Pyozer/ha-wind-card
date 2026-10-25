import { css } from 'lit';

export const editorStyles = css`
  :host {
    display: block;
  }

  .issues {
    margin-bottom: 16px;
    padding: 10px 14px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--warning-color, #ff9500) 12%, transparent);
    font-size: 13px;
  }

  .issues-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
  }

  .issues ha-svg-icon {
    color: var(--warning-color, #ff9500);
    flex: none;
  }

  .issues ul {
    margin: 6px 0 0;
    padding: 0 0 0 32px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
`;
