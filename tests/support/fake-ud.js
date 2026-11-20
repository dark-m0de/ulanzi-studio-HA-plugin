// A fake of the common-node `$UD` API (ulanzideck-api). Records every command the plugin
// sends to Ulanzi Studio and lets tests emit Studio events.
import { EventEmitter } from 'node:events';

const COMMANDS = [
  'setBaseDataIcon',
  'setPathIcon',
  'setStateIcon',
  'setFeedbackLayout',
  'setFeedback',
  'showAlert',
  'toast',
  'sendToPropertyInspector',
  'setGlobalSettings',
  'getGlobalSettings',
  'setSettings',
  'getSettings',
  'logMessage',
];

const EVENT_HANDLERS = {
  onConnected: 'connected',
  onClose: 'close',
  onError: 'error',
  onAdd: 'add',
  onRun: 'run',
  onParamFromApp: 'paramfromapp',
  onParamFromPlugin: 'paramfromplugin',
  onSetActive: 'setactive',
  onClear: 'clear',
  onDidReceiveSettings: 'didReceiveSettings',
  onDidReceiveGlobalSettings: 'didReceiveGlobalSettings',
  onSendToPlugin: 'sendToPlugin',
  onKeyDown: 'keydown',
  onKeyUp: 'keyup',
  onDialDown: 'dialdown',
  onDialUp: 'dialup',
  onDialRotate: 'dialrotate',
};

export const PLUGIN_UUID = 'com.ulanzi.ulanzistudio.hadeck';

export class FakeUD extends EventEmitter {
  constructor({ language = 'en' } = {}) {
    super();
    this.language = language;
    this.uuid = '';
    /** @type {{ method: string, args: any[] }[]} */
    this.calls = [];
    for (const name of COMMANDS) {
      this[name] = (...args) => {
        this.calls.push({ method: name, args });
      };
    }
    for (const [handler, cmd] of Object.entries(EVENT_HANDLERS)) {
      this[handler] = (fn) => {
        this.on(cmd, fn);
        return this;
      };
    }
  }

  connect(uuid) {
    this.uuid = uuid;
  }

  encodeContext(jsn) {
    return `${jsn.uuid}___${jsn.key}___${jsn.actionid}`;
  }

  decodeContext(context) {
    const [uuid, key, actionid] = context.split('___');
    return { uuid, key, actionid };
  }

  /** Builds the context string for an action instance. */
  contextFor(action, key = '0_0', actionid = `id-${action}-${key}`) {
    return this.encodeContext({ uuid: `${PLUGIN_UUID}.${action}`, key, actionid });
  }

  /**
   * Emits a Studio event for an action instance the way common-node does
   * (adds `context`, for `clear` per param item).
   */
  emitAction(cmd, action, { key = '0_0', actionid, ...rest } = {}) {
    const msg = { cmd, uuid: `${PLUGIN_UUID}.${action}`, key, actionid: actionid ?? `id-${action}-${key}`, ...rest };
    msg.context = this.encodeContext(msg);
    this.emit(cmd, msg);
    return msg.context;
  }

  emitClear(items) {
    const param = items.map(({ action, key = '0_0', actionid }) => {
      const p = { uuid: `${PLUGIN_UUID}.${action}`, key, actionid: actionid ?? `id-${action}-${key}` };
      p.context = this.encodeContext(p);
      return p;
    });
    this.emit('clear', { cmd: 'clear', param });
  }

  /** Recorded calls of one command, optionally filtered by first argument (context). */
  callsOf(method, context) {
    return this.calls.filter((c) => c.method === method && (context === undefined || c.args[0] === context));
  }

  lastCall(method, context) {
    const all = this.callsOf(method, context);
    return all[all.length - 1];
  }

  clearCalls() {
    this.calls.length = 0;
  }
}
