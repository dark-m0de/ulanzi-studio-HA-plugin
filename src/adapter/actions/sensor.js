// HA Sensor key (US6): read-only display of a sensor value with optional warn thresholds.
import { KeyAction } from './key-action.js';
import { sensorModel } from '../../domain/render/key-model.js';

export class SensorAction extends KeyAction {
  model() {
    return sensorModel(this.entity, this.settings, { t: this.app.t, connected: this.connected, icon: this.resolveIcon('sensor') });
  }
}

export const createSensor = (ctx) => new SensorAction(ctx);
