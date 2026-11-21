// HA Trigger key (US6): activates a scene or script, or triggers an automation.
import { KeyAction } from './key-action.js';
import { pressActionFor } from '../../domain/press-actions.js';
import { triggerModel } from '../../domain/render/key-model.js';

const TRIGGER_DOMAINS = new Set(['scene', 'script', 'automation']);

export class TriggerAction extends KeyAction {
  model() {
    return triggerModel(this.entity, this.settings, {
      t: this.app.t,
      connected: this.connected,
      confirming: this.confirming,
      icon: this.resolveIcon('trigger'),
    });
  }

  onRun() {
    const entity = this.entity;
    const call = entity && TRIGGER_DOMAINS.has(entity.domain) ? pressActionFor(entity) : null;
    return this.invoke(call, 'trigger');
  }
}

export const createTrigger = (ctx) => new TriggerAction(ctx);
