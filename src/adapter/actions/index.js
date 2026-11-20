// Action factories keyed by action UUID suffix (contracts/plugin-actions.md).
import { createToggle } from './toggle.js';
import { createDial } from './dial.js';
import { createDynamicDial } from './dynamic-dial.js';
import { createTrigger } from './scene.js';
import { createSensor } from './sensor.js';
import { createService } from './service.js';

export const ACTION_TYPES = {
  toggle: createToggle,
  dial: createDial,
  dynamicdial: createDynamicDial,
  scene: createTrigger,
  sensor: createSensor,
  service: createService,
};
