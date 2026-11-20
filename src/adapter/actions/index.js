// Action factories keyed by action UUID suffix (contracts/plugin-actions.md).
import { createToggle } from './toggle.js';

export const ACTION_TYPES = {
  toggle: createToggle,
};
