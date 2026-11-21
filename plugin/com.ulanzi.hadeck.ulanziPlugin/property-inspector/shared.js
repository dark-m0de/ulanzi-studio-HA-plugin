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
        // No reply at all means the plugin's main service is not running (HA timeouts are
        // reported by the main service itself as error.timeout).
        reject({ key: 'error.noPlugin' });
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
      // Boolean checkboxes (feature 003): setFormValue only ever checks them, and a missing value
      // means the default from data-default.
      form.querySelectorAll('input[type="checkbox"].hadeck-bool').forEach((el) => {
        const value = settings[el.name];
        el.checked = value === undefined || value === null ? el.dataset.default === 'true' : value !== false && value !== 'false';
      });
      form.dispatchEvent(new CustomEvent('hadeck:load', { detail: settings }));
      if (opts.onLoad) opts.onLoad(settings);
    };
    $UD.onAdd(load);
    $UD.onParamFromApp(load);
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const values = Utils.getFormValue(form);
        form.querySelectorAll('input[type="checkbox"].hadeck-bool').forEach((el) => {
          values[el.name] = el.checked;
        });
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
    '<div class="tip info hidden" id="hadeck-status"></div>' +
    '<div class="tip warn hidden" id="hadeck-icons" data-localize>pi.connection.iconsUnavailable</div>';

  function mountConnectionBlock(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    container.innerHTML = CONNECTION_MARKUP;
    const url = container.querySelector('#hadeck-url');
    const token = container.querySelector('#hadeck-token');
    const testBtn = container.querySelector('#hadeck-test');
    const saveAnywayBtn = container.querySelector('#hadeck-save-anyway');
    const statusEl = container.querySelector('#hadeck-status');
    const iconsEl = container.querySelector('#hadeck-icons');

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
      // Feature 003: HA icons not available → built-in icons are used (constitution Principle IV).
      iconsEl.textContent = t('pi.connection.iconsUnavailable');
      iconsEl.classList.toggle('hidden', s.iconsAvailable !== false);
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
      request('connection.status')
        .then(renderStatus)
        .catch((err) => show('error', t((err && err.key) || 'error.noPlugin')));
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

  // --- icon section (feature 003, contracts/key-icon-settings.md §2) -----------------------

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /** Draws a 24×24 icon path into `el` with DOM APIs only (no innerHTML with external data). */
  function drawIcon(el, path) {
    el.textContent = '';
    if (!path) return;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', path);
    p.setAttribute('fill', 'currentColor');
    svg.appendChild(p);
    el.appendChild(svg);
  }

  /**
   * Colour picker bound to a hidden settings field that stays '' until a colour is picked.
   * @param {HTMLInputElement} hidden the named settings field
   * @param {HTMLInputElement} picker the visible <input type="color">
   * @param {HTMLButtonElement} reset button that clears the colour
   * @param {string} defaultColor shown while no colour is set
   */
  function mountColorField(hidden, picker, reset, defaultColor) {
    const sync = () => {
      const isSet = /^#[0-9a-fA-F]{6}$/.test(hidden.value);
      picker.value = isSet ? hidden.value : defaultColor;
      picker.classList.toggle('hadeck-color-default', !isSet);
      reset.disabled = !isSet;
    };
    const commit = (value) => {
      hidden.value = value;
      sync();
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    };
    picker.addEventListener('input', () => commit(picker.value.toLowerCase()));
    reset.addEventListener('click', () => commit(''));
    hidden.form.addEventListener('hadeck:load', sync);
    sync();
  }

  /**
   * Live preview for the icon override field (debounced `icon.preview`). Shows the icon the
   * bound entity would get as placeholder and a hint for unknown names.
   */
  function mountIconField(input, previewEl, notFoundEl, entityInput) {
    let timer = null;
    let seq = 0;
    function update() {
      const mySeq = ++seq;
      const name = input.value.trim();
      const entityId = entityInput ? entityInput.value.trim() : '';
      const base = name ? Promise.resolve(null) : request('icon.preview', { name: null, entityId: entityId || null });
      const own = name ? request('icon.preview', { name, entityId: null }) : Promise.resolve(null);
      Promise.all([own, base])
        .then(([ownRes, baseRes]) => {
          if (mySeq !== seq) return;
          if (name) {
            drawIcon(previewEl, ownRes && ownRes.found ? ownRes.path : null);
            notFoundEl.classList.toggle('hidden', Boolean(ownRes && ownRes.found));
          } else {
            input.placeholder = baseRes && baseRes.found ? baseRes.name : 'mdi:…';
            drawIcon(previewEl, baseRes && baseRes.found ? baseRes.path : null);
            notFoundEl.classList.add('hidden');
          }
        })
        .catch(() => drawIcon(previewEl, null));
    }
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(update, 200);
    };
    input.addEventListener('input', later);
    if (entityInput) entityInput.addEventListener('change', later);
    input.form.addEventListener('hadeck:load', later);
    $UD.onConnected(later);
  }

  /**
   * Injects the "Icon" section into a placeholder inside the settings form. Must run before
   * bindForm's first load so the fields exist when the settings arrive.
   * @param {string} selector placeholder element inside the form
   * @param {{ showToggle?: boolean, offColor?: boolean, service?: boolean, defaultColor?: string, entityInput?: HTMLInputElement | null }} [options]
   */
  function mountIconSection(selector, options) {
    const opts = options || {};
    const root = document.querySelector(selector);
    if (!root) return;
    const LABELS = {
      onColor: '<div class="uspi-item-label" data-localize>pi.icon.onColor</div>',
      offColor: '<div class="uspi-item-label" data-localize>pi.icon.offColor</div>',
      color: '<div class="uspi-item-label" data-localize>pi.icon.color</div>',
    };
    const colorRow = (name, label) =>
      '<div class="uspi-item">' + label +
      '<input type="hidden" name="' + name + '">' +
      '<input type="color" class="hadeck-color-picker" data-for="' + name + '">' +
      '<button type="button" class="default hadeck-color-reset" data-for="' + name + '" data-localize>pi.icon.reset</button></div>';
    // Static markup only; no user or HA data is inserted here.
    root.innerHTML =
      '<div class="uspi-heading" data-localize>pi.icon.heading</div>' +
      (opts.showToggle
        ? '<div class="uspi-item"><div class="uspi-item-label" data-localize>pi.icon.show</div>' +
          '<input type="checkbox" class="hadeck-bool" name="showIcon" value="true" data-default="true"></div>'
        : '') +
      '<div class="hadeck-icon-fields">' +
      '<div class="uspi-item"><div class="uspi-item-label" data-localize>pi.icon.name</div>' +
      '<input class="uspi-item-value" type="text" name="icon" maxlength="64" spellcheck="false" placeholder="mdi:…">' +
      '<span class="hadeck-icon-preview"></span></div>' +
      '<div class="tip warn hidden hadeck-icon-notfound" data-localize>pi.icon.notFound</div>' +
      (opts.offColor ? colorRow('onColor', LABELS.onColor) + colorRow('offColor', LABELS.offColor) : colorRow('onColor', LABELS.color)) +
      (opts.service
        ? '<div class="hadeck-hint" data-localize>pi.icon.hintService</div>'
        : '<div class="hadeck-hint" data-localize>pi.icon.hint</div>') +
      '</div>';

    const defaults = { onColor: opts.offColor ? '#f59e0b' : '#a78bfa', offColor: '#94a3b8' };
    root.querySelectorAll('input.hadeck-color-picker').forEach((picker) => {
      const name = picker.dataset.for;
      mountColorField(
        root.querySelector('input[type="hidden"][name="' + name + '"]'),
        picker,
        root.querySelector('button.hadeck-color-reset[data-for="' + name + '"]'),
        opts.defaultColor || defaults[name],
      );
    });
    mountIconField(
      root.querySelector('input[name="icon"]'),
      root.querySelector('.hadeck-icon-preview'),
      root.querySelector('.hadeck-icon-notfound'),
      opts.entityInput || null,
    );

    const toggle = root.querySelector('input[name="showIcon"]');
    const fields = root.querySelector('.hadeck-icon-fields');
    if (toggle) {
      const showFields = () => fields.classList.toggle('hidden', !toggle.checked);
      toggle.addEventListener('change', showFields);
      toggle.form.addEventListener('hadeck:load', showFields);
      showFields();
    }
  }

  window.HADeck = {
    ACTION_PREFIX,
    t,
    request,
    onPush,
    bindForm,
    mountConnectionBlock,
    mountEntityPicker,
    mountColorField,
    mountIconField,
    mountIconSection,
  };
})();
