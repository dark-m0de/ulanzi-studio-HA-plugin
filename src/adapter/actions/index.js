// Action factories keyed by action UUID suffix (contracts/plugin-actions.md).
import { createToggle } from './toggle.js';
import { createDial } from './dial.js';
import { createDynamicDial } from './dynamic-dial.js';

export const ACTION_TYPES = {
  toggle: createToggle,
  dial: createDial,
  dynamicdial: createDynamicDial,
};
