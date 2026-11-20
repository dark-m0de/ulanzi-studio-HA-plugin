/* Shared Property Inspector code for all HA Deck actions (contracts/pi-messages.md).
 * Classic script: loaded after libs/common-html/js/*.js, exposes window.HADeck. */
/* global $UD, Utils */
(function () {
  'use strict';

  const ACTION_PREFIX = 'com.ulanzi.ulanzistudio.hadeck.';
  const pending = new Map();
  const pushListeners = new Map();
  let nextId = 1;

  function t(key, params) {
    let text = ($UD.t && $UD.t(key)) || key;
    if (params) text = text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
    return text;
  }

  // --- request/reply over sendToPlugin -----------------------------------------------------

  function request(type, payload, timeoutMs) {
    const id = 'r' + nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject({ key: 'error.timeout' });
      }, timeoutMs || 10000);
      pending.set(id, { resolve, reject, timer });
      $UD.sendToPlugin({ v: 1, type, id, payload: payload || {} });
    });
  }

  function onPush(type, fn) {
    if (!pushListeners.has(type)) pushListeners.set(type, []);
    pushListeners.get(type).push(fn);
  }

  $UD.onSendToPropertyInspector((message) => {
    const env = message && message.payload;
    if (!env || env.v !== 1) return;
    if (env.id && pending.has(env.id)) {
      const p = pending.get(env.id);
      pending.delete(env.id);
      clearTimeout(p.timer);
      if (env.error) p.reject(env.error);
      else p.resolve(env.payload);
      return;
    }
    (pushListeners.get(env.type) || []).forEach((fn) => fn(env.payload));
  });

  // --- per-action settings form ------------------------------------------------------------

  /**
   * Populates the form from saved settings and saves changes (debounced 300 ms).
   * The connection block lives outside this form, so the token is never part of action settings.
   */
  function bindForm(formSelector, options) {
    const opts = options || {};
    const form = document.querySelector(formSelector);
    let timer = null;
    const load = (msg) => {
      const settings = (msg && (msg.param || msg.settings)) || {};
      Utils.setFormValue(settings, form);
      if (opts.onLoad) opts.onLoad(settings);
    };
    $UD.onAdd(load);
    $UD.onParamFromApp(load);
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const values = Utils.getFormValue(form);
        if (opts.beforeSave) opts.beforeSave(values);
        $UD.sendParamFromPlugin(values);
      }, 300);
    };
    form.addEventListener('input', save);
    form.addEventListener('change', save);
    return { form, save };
  }

  // --- connection block (FR-002, FR-003, research R-08) ------------------------------------

  const CONNECTION_MARKUP =
    '<div class="uspi-heading" data-localize>pi.connection.heading</div>' +
    '<div class="uspi-item"><div class="uspi-item-label" data-localize>pi.connection.url</div>' +
    '<input class="uspi-item-value" id="hadeck-url" type="url" autocomplete="off" spellcheck="false" placeholder="http://homeassistant.local:8123"></div>' +
    '<div class="uspi-item"><div class="uspi-item-label" data-localize>pi.connection.token</div>' +
    '<input class="uspi-item-value" id="hadeck-token" type="password" autocomplete="off" spellcheck="false"></div>' +
    '<div class="uspi-item hadeck-buttons"><div class="uspi-item-label empty"></div>' +
    '<button type="button" class="primary" id="hadeck-test" data-localize>pi.connection.test</button>' +
    '<button type="button" class="default hidden" id="hadeck-save-anyway" data-localize>pi.connection.saveAnyway</button></div>' +
    '<div class="tip info hidden" id="hadeck-status"></div>';

  function mountConnectionBlock(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    container.innerHTML = CONNECTION_MARKUP;
    const url = container.querySelector('#hadeck-url');
    const token = container.querySelector('#hadeck-token');
    const testBtn = container.querySelector('#hadeck-test');
    const saveAnywayBtn = container.querySelector('#hadeck-save-anyway');
    const statusEl = container.querySelector('#hadeck-status');

    function show(kind, text) {
      statusEl.className = 'tip ' + kind;
      statusEl.textContent = text;
    }

    function renderStatus(s) {
      if (!s) return;
      if (s.haUrl && !url.value) url.value = s.haUrl;
      token.placeholder = s.hasToken ? t('pi.connection.tokenStored') : t('pi.connection.tokenPlaceholder');
      const kind = s.status === 'connected' ? 'success' : s.status === 'auth_failed' ? 'error' : s.status === 'unconfigured' ? 'info' : 'warn';
      show(kind, t('status.connection.' + s.status));
    }

    const credentials = () => ({ haUrl: url.value.trim(), haToken: token.value ? token.value.trim() : null });

    function saved(message) {
      token.value = '';
      token.placeholder = t('pi.connection.tokenStored');
      saveAnywayBtn.classList.add('hidden');
      show('success', message);
    }

    testBtn.addEventListener('click', () => {
      saveAnywayBtn.classList.add('hidden');
      show('info', t('pi.connection.testing'));
      const creds = credentials();
      request('connection.test', creds, 15000)
        .then((result) => request('connection.save', creds).then(() => saved(t('pi.connection.ok', { count: result.entityCount }))))
        .catch((err) => {
          const key = (err && err.key) || 'error.unreachable';
          show('error', t(key));
          if (key === 'error.unreachable' || key === 'error.timeout') saveAnywayBtn.classList.remove('hidden');
        });
    });

    saveAnywayBtn.addEventListener('click', () => {
      request('connection.save', credentials())
        .then(() => saved(t('pi.connection.savedOffline')))
        .catch((err) => show('error', t((err && err.key) || 'error.internal')));
    });

    onPush('connection.changed', renderStatus);
    $UD.onConnected(() => {
      request('connection.status').then(renderStatus).catch(() => {});
    });
  }

  // --- entity picker (FR-013) ----------------------------------------------------------------

  /**
   * Turns a text input into a searchable entity picker backed by `entities.list`.
   * @param {HTMLInputElement} input the input holding the entity id (part of the settings form)
   * @param {{ domains?: string[] }} [options]
   */
  function mountEntityPicker(input, options) {
    const opts = options || {};
    const list = document.createElement('div');
    list.className = 'hadeck-picker hidden';
    input.insertAdjacentElement('afterend', list);
    let timer = null;
    let seq = 0;

    function choose(entityId) {
      input.value = entityId;
      list.classList.add('hidden');
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function search() {
      const mySeq = ++seq;
      request('entities.list', { domains: opts.domains || null, query: input.value.trim() || null, limit: 30 })
        .then((res) => {
          if (mySeq !== seq) return;
          list.innerHTML = '';
          const entities = (res && res.entities) || [];
          if (!entities.length) {
            const empty = document.createElement('div');
            empty.className = 'hadeck-picker-empty';
            empty.textContent = t('pi.entity.none');
            list.appendChild(empty);
          }
          entities.forEach((e) => {
            const row = document.createElement('div');
            row.className = 'hadeck-picker-row';
            const name = document.createElement('span');
            name.textContent = e.friendlyName;
            const id = document.createElement('small');
            id.textContent = e.entityId;
            row.append(name, id);
            row.addEventListener('mousedown', (ev) => {
              ev.preventDefault();
              choose(e.entityId);
            });
            list.appendChild(row);
          });
          list.classList.remove('hidden');
        })
        .catch(() => list.classList.add('hidden'));
    }

    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(search, 200);
    });
    input.addEventListener('focus', search);
    input.addEventListener('blur', () => setTimeout(() => list.classList.add('hidden'), 150));
  }

  window.HADeck = { ACTION_PREFIX, t, request, onPush, bindForm, mountConnectionBlock, mountEntityPicker };
})();
