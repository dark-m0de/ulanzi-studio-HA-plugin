// HA Service Call key (US6): calls any configured service.
import { KeyAction } from './key-action.js';
import { parseServiceCall } from '../../domain/service-call.js';
import { serviceModel } from '../../domain/render/key-model.js';

export class ServiceAction extends KeyAction {
  get call() {
    const { domain, service, target, data } = this.settings;
    return parseServiceCall({ domain, service, target, data });
  }

  model() {
    return serviceModel(this.settings, {
      t: this.app.t,
      connected: this.connected,
      valid: this.call !== null,
      confirming: this.confirming,
      icon: this.resolveIcon('service'),
    });
  }

  onRun() {
    return this.invoke(this.call, 'service');
  }
}

export const createService = (ctx) => new ServiceAction(ctx);
