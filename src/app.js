/* Inkwell Resume Builder: app shell, dashboard, editor, live preview, assistant panel and plan limits. */
(function () {
  'use strict';
  const T = window.ResumeTemplates;
  const A = window.ResumeAssistant;
  const L = window.ResumeLicense;
  const CFG = window.InkwellConfig || {};

  const STORE_KEY = 'inkwell.resumes.v1';
  const PLANS = { free: { max: 3, label: 'Free' }, plus: { max: 20, label: 'Upgraded' } };
  const PRICE = CFG.price || '$10';
  const BACKUP_APP = 'inkwell-resumes';
  const SHEET = { letter: { w: 816, h: 1056, label: 'Letter' }, a4: { w: 794, h: 1123, label: 'A4' } };

  /* ------------------------------------------------------------ helpers */
  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = T.esc;
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const ICON = {
    grip: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="5.5" cy="3.5" r="1.3"/><circle cx="10.5" cy="3.5" r="1.3"/><circle cx="5.5" cy="8" r="1.3"/><circle cx="10.5" cy="8" r="1.3"/><circle cx="5.5" cy="12.5" r="1.3"/><circle cx="10.5" cy="12.5" r="1.3"/></svg>',
    up: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4-4 4 4"/></svg>',
    down: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>',
    eye: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2"/></svg>',
    eyeOff: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"/><path d="M2.5 13.5l11-11"/></svg>',
    trash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9"/></svg>',
    chev: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>',
    chevR: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  };
  function iconBtn(icon, label, onclick, disabled) {
    return h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, title: label, html: ICON[icon], onclick, disabled: !!disabled });
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function fmtDate(ts) {
    try { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; }
  }

  /* -------------------------------------------------------------- store */
  function defaultStore() { return { plan: 'free', resumes: [T.sampleResume()], lastId: null, license: '', testUnlock: false }; }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.resumes)) {
          if (!PLANS[d.plan]) d.plan = 'free';
          // Resumes saved before these settings existed keep their old look
          d.resumes.forEach((r) => { r.margin = r.margin || 'narrow'; r.textSize = r.textSize || 'normal'; r.format = r.format || 'chronological'; });
          return d;
        }
      }
    } catch (e) { /* storage unavailable */ }
    return defaultStore();
  }
  let store = load();
  // Orders this tab has finished with, so another tab's stale copy can't bring them back.
  const resolvedOrders = new Set();
  // Another tab may have bought the upgrade (or be finishing a payment) since this tab loaded. Keep that
  // instead of writing this tab's older plan over it. Returns true when something changed.
  function mergeEntitlement(d) {
    if (!d || typeof d !== 'object') return false;
    let changed = false;
    if (d.plan === 'plus' && d.license && d.license !== store.license && !(store.plan === 'plus' && store.license)) {
      store.license = d.license;
      store.plan = 'plus';
      store.testUnlock = false;
      if (!d.pendingOrder && store.pendingOrder) { resolvedOrders.add(store.pendingOrder); store.pendingOrder = ''; } // finished in that tab
      changed = true;
    }
    if (d.pendingOrder && !store.pendingOrder && !resolvedOrders.has(d.pendingOrder) && !(store.plan === 'plus' && store.license)) {
      store.pendingOrder = d.pendingOrder;
      changed = true;
    }
    return changed;
  }
  function readStored() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; }
  }
  function write() {
    try {
      mergeEntitlement(readStored());
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) { /* storage unavailable */ }
  }
  const persist = debounce(write, 250);
  function saveNow() { write(); }

  const counted = () => store.resumes.filter((r) => !r.isExample).length;
  const limit = () => PLANS[store.plan].max;
  const canCreate = () => counted() < limit();

  /* -------------------------------------------------------------- toast */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  /* -------------------------------------------------------------- modal */
  // opts.sticky: only the dialog's own buttons close it (no backdrop click or Escape).
  function openModal(build, opts) {
    closeModal();
    const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
    const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back && !back.dataset.sticky) closeModal(); } }, modal);
    if (opts && opts.sticky) back.dataset.sticky = '1';
    build(modal, closeModal);
    $('#modal-root').append(back);
    const f = modal.querySelector('button, input, textarea');
    if (f) f.focus();
  }
  function closeModal() { $('#modal-root').innerHTML = ''; }

  function openUpgrade(reason) {
    openModal((m, close) => {
      if (store.plan === 'plus') {
        const full = counted() >= limit();
        m.append(
          h('div', { class: 'eyebrow', text: 'Upgraded plan' }),
          h('h2', { text: full ? `You’ve reached ${limit()} resumes` : `You can keep up to ${limit()} resumes` }),
          h('p', { class: 'muted', text: full ? 'Delete a resume you no longer need to make room for a new one.' : `You’re using ${counted()} of ${limit()}. No subscription, nothing renews.` }),
          store.license ? h('div', { class: 'field' }, h('label', { for: 'license-saved', text: 'Your license key' }), ...keyPanel(store.license), h('div', { class: 'hint', text: 'Paste it into the upgrade window on another browser or device. It’s also saved in backups.' })) : null,
          h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-primary', type: 'button', text: 'Done', onclick: close })),
        );
        return;
      }
      const note = h('div', { class: 'note warn', hidden: true });
      const actions = h('div', { class: 'modal-actions' });
      let pay = null;
      let paypalBox = null;
      let pendingBox = null;
      if (CFG.paypalClientId) {
        // PayPal's own buttons (PayPal account or card) render here; the server sets the price.
        paypalBox = h('div', { class: 'paypal-box', id: 'paypal-buttons' }, h('p', { class: 'hint', text: 'Loading PayPal…' }));
        if (store.pendingOrder) {
          // A payment from earlier hasn't finished unlocking. Offer to finish it, not to pay again.
          const orderID = store.pendingOrder;
          paypalBox.hidden = true;
          const again = h('button', { class: 'linkish', type: 'button', text: 'I wasn’t charged. Start a new payment', onclick: () => { again.hidden = true; paypalBox.hidden = false; mountPayPal(paypalBox, note, close, m); } });
          pendingBox = h('div', { class: 'note' },
            h('p', { style: 'margin:0 0 10px', text: 'You approved a PayPal payment earlier that hasn’t finished unlocking.' }),
            h('div', { class: 'add-row' }, h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'Finish unlocking', onclick: async (e) => {
              e.target.disabled = true;
              e.target.textContent = 'Checking…';
              const res = await claimOrder(orderID);
              close();
              await finishPurchase(orderID, res);
            } }), again));
        } else {
          mountPayPal(paypalBox, note, close, m);
        }
      } else {
        pay = h('button', { class: 'btn btn-primary', type: 'button', text: `Pay ${PRICE} once`, onclick: () => {
          note.hidden = false;
          note.textContent = 'Checkout isn’t connected yet. You can unlock the upgrade on this device to try the 20-resume plan.';
          pay.replaceWith(h('button', { class: 'btn btn-primary', type: 'button', text: 'Unlock for testing', onclick: () => {
            store.plan = 'plus';
            store.testUnlock = true;
            saveNow();
            close();
            afterPlanChange();
            toast('Upgraded. You can now keep up to 20 resumes.');
          } }));
        } });
      }
      actions.append(h('button', { class: 'btn', type: 'button', text: 'Not now', 'data-dismiss': '1', onclick: close }));
      if (pay) actions.append(pay);

      // Already paid: paste a license key (for a new browser or device)
      const keyMsg = h('div', { class: 'hint', 'aria-live': 'polite' });
      const keyInput = h('textarea', { class: 'input', id: 'license-input', rows: 2, placeholder: 'INK1.…', spellcheck: 'false', style: 'font-family:var(--font-mono);font-size:12.5px;resize:vertical' });
      const keyBox = h('div', { class: 'field', hidden: true },
        h('label', { for: 'license-input', text: 'License key' }), keyInput,
        h('div', { class: 'add-row' }, h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'Unlock', onclick: async () => {
          keyMsg.textContent = 'Checking…';
          keyMsg.style.color = '';
          const res = await applyLicense(keyInput.value);
          if (res.ok) { close(); toast('Upgrade unlocked on this browser'); return; }
          keyMsg.style.color = 'var(--pencil)';
          keyMsg.textContent = licenseError(res.reason);
        } })), keyMsg);
      const keyToggle = h('button', { class: 'linkish', type: 'button', text: 'Already paid? Enter your license key', onclick: () => { keyBox.hidden = false; keyToggle.hidden = true; keyInput.focus(); } });

      m.append(...[
        h('div', { class: 'eyebrow', text: reason === 'limit' ? `You’ve used your ${PLANS.free.max} free resumes` : 'One-time upgrade' }),
        h('h2', { text: `Upgrade once for ${PRICE}. Keep up to 20 resumes.` }),
        h('ul', {}, h('li', { text: '20 resumes instead of 3' }), h('li', { text: 'Every template, preset and assistant feature (you already have these)' }), h('li', { text: 'No subscription. You pay once and nothing renews.' })),
        pendingBox,
        paypalBox,
        note,
        actions,
        h('div', {}, keyToggle),
        keyBox,
      ].filter(Boolean));
    });
  }

  function licenseError(reason) {
    if (reason === 'nokey') return 'License keys can’t be checked in this preview yet.';
    if (reason === 'unsupported') return 'This browser can’t check license keys. Update it, or try Chrome, Safari, Edge or Firefox.';
    if (reason === 'format') return 'That doesn’t look like a complete license key. Paste the whole key, starting with INK1.';
    return 'That key isn’t valid. Check that you pasted the whole key.';
  }

  async function applyLicense(key) {
    const res = await L.verify(key, CFG.licensePublicKey);
    if (res.ok) {
      store.license = L.normalize(key);
      store.plan = 'plus';
      store.testUnlock = false;
      saveNow();
      afterPlanChange();
    }
    return res;
  }

  function afterPlanChange() {
    refreshPlan();
    if (!$('#view-dashboard').hidden) renderDashboard();
  }

  // The stored plan only counts if a valid key backs it (or the preview's testing unlock).
  async function checkStoredPlan() {
    if (store.plan !== 'plus') return;
    if (store.license) {
      const res = await L.verify(store.license, CFG.licensePublicKey);
      if (res.ok || res.reason === 'unsupported') return;
    } else if (store.testUnlock && !CFG.paypalClientId) {
      return;
    }
    store.plan = 'free';
    store.testUnlock = false;
    saveNow();
    afterPlanChange();
  }

  /* ------------------------------------------------------------ PayPal */
  const PAY_API = () => (CFG.paymentApi || '/api/paypal').replace(/\/$/, '');
  let paypalSdk = null;
  function loadPayPal() {
    if (window.paypal && window.paypal.Buttons) return Promise.resolve(window.paypal);
    if (!paypalSdk) {
      paypalSdk = new Promise((resolve, reject) => {
        const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CFG.paypalClientId)}&currency=USD&intent=capture&components=buttons`;
        const tag = h('script', { src, 'data-namespace': 'paypal' });
        tag.onload = () => (window.paypal && window.paypal.Buttons ? resolve(window.paypal) : reject(new Error('sdk')));
        tag.onerror = () => reject(new Error('sdk'));
        document.head.append(tag);
      });
      paypalSdk.catch(() => { paypalSdk = null; });
    }
    return paypalSdk;
  }

  async function postJson(path, body) {
    const r = await fetch(PAY_API() + path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body || {}) });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, data };
  }

  // Ask the server to take the approved payment and hand back this order's license key.
  async function claimOrder(orderID) {
    try {
      const { ok, data } = await postJson('/capture', { orderID });
      if (ok && data.key) return { key: data.key };
      return { error: data.error || 'unknown' };
    } catch (e) {
      return { error: 'network' };
    }
  }

  function mountPayPal(box, note, close, modal) {
    const say = (msg, warn) => { note.hidden = false; note.className = warn === false ? 'note' : 'note warn'; note.textContent = msg; };
    const fail = (msg) => say(msg);
    loadPayPal().then((paypal) => {
      if (!box.isConnected) return;
      box.innerHTML = '';
      paypal.Buttons({
        style: { layout: 'vertical', shape: 'rect', label: 'pay', height: 45 },
        createOrder: async () => {
          note.hidden = true;
          const { ok, data } = await postJson('/order');
          if (!ok || !data.id) throw new Error(data.error || 'order');
          return data.id;
        },
        onApprove: async (data, actions) => {
          // Remember the order first, so a closed tab or dropped connection can finish unlocking on the next visit.
          store.pendingOrder = data.orderID;
          resolvedOrders.delete(data.orderID);
          saveNow();
          // Keep the window open while the payment completes.
          const back = modal && modal.parentElement;
          if (back) back.dataset.sticky = '1';
          const dismiss = modal && modal.querySelector('[data-dismiss]');
          if (dismiss) dismiss.disabled = true;
          box.hidden = true;
          say('Finishing your payment… Keep this window open.', false);
          const res = await claimOrder(data.orderID);
          const stillOpen = box.isConnected;
          if (res.error === 'declined' && stillOpen && actions && actions.restart) {
            clearPending(data.orderID);
            if (back) delete back.dataset.sticky;
            if (dismiss) dismiss.disabled = false;
            box.hidden = false;
            say('PayPal declined that payment, so you haven’t been charged. Choose another way to pay.');
            return actions.restart();
          }
          if (stillOpen) close();
          await finishPurchase(data.orderID, res);
        },
        onCancel: () => fail('Payment cancelled. You haven’t been charged.'),
        onError: () => fail('PayPal couldn’t start the payment. Try again in a moment.'),
      }).render(box).catch(() => fail('PayPal couldn’t load. Try again in a moment.'));
    }).catch(() => {
      box.innerHTML = '';
      fail('PayPal couldn’t load. Check your connection, or turn off any blocker for paypal.com, then reopen this window.');
    });
  }

  // Errors that retrying this order won't fix: stop remembering it.
  const FINAL_ERRORS = new Set(['missing_order', 'not_found', 'wrong_product', 'not_approved', 'refunded', 'declined', 'failed', 'not_paid']);

  function clearPending(orderID) {
    if (orderID) resolvedOrders.add(orderID);
    if (!orderID || store.pendingOrder === orderID) store.pendingOrder = '';
    saveNow();
  }

  // Read-only key box with a copy button
  function keyPanel(key) {
    const ta = h('textarea', { class: 'input', id: 'license-saved', rows: 3, readonly: true, style: 'font-family:var(--font-mono);font-size:12.5px' });
    ta.value = key;
    const copy = h('button', { class: 'btn btn-sm', type: 'button', text: 'Copy key', onclick: () => {
      try { navigator.clipboard.writeText(key).then(() => toast('Key copied'), () => ta.select()); } catch (e) { ta.select(); }
    } });
    return [ta, h('div', { class: 'add-row' }, copy)];
  }

  async function finishPurchase(orderID, res) {
    let lic = { ok: false };
    if (res.key) {
      lic = await applyLicense(res.key);
      if (!lic.ok) {
        // The server only signs keys for paid orders, so keep the key whatever this browser can check.
        store.license = L.normalize(res.key);
        if (lic.reason === 'unsupported') { store.plan = 'plus'; store.testUnlock = false; } // same rule as checkStoredPlan
        saveNow();
        afterPlanChange();
      }
    }
    if (res.key || FINAL_ERRORS.has(res.error)) clearPending(orderID);
    showPurchaseResult(orderID, res, lic.ok || lic.reason === 'unsupported', lic.reason);
  }

  function showPurchaseResult(orderID, res, unlocked, reason) {
    const key = res.key || '';
    const err = res.error || 'unknown';
    const help = CFG.supportEmail ? ` If you need help, email ${CFG.supportEmail} with your PayPal receipt.` : '';
    if (key) {
      openModal((m, close) => {
        m.append(...[
          h('div', { class: 'eyebrow', text: 'Payment received' }),
          h('h2', { text: unlocked ? 'You’re upgraded. Keep up to 20 resumes.' : 'Your payment went through' }),
          h('p', { class: 'muted', text: unlocked
            ? 'Save this license key. Paste it into the upgrade window to unlock on another browser or device. You can see it again from the plan button.'
            : 'Here is your license key, but this copy of the app couldn’t confirm it. Save the key and contact support so we can fix it.' + help }),
          ...keyPanel(key),
          h('div', { class: 'modal-actions' },
            unlocked
              ? h('button', { class: 'btn btn-primary', type: 'button', text: 'Start building', onclick: () => { close(); location.hash = 'resumes'; } })
              : h('button', { class: 'btn btn-primary', type: 'button', text: 'Close', onclick: close })),
        ]);
      }, { sticky: true });
      return;
    }
    const final = FINAL_ERRORS.has(err);
    const why = {
      pending: 'PayPal is still processing your payment. We’ll finish unlocking the next time you open the app, or you can check again now.',
      refunded: 'This payment was refunded, so it can’t unlock the upgrade.',
      not_approved: 'The payment wasn’t approved in PayPal, so you haven’t been charged.',
      declined: 'PayPal declined the payment, so you haven’t been charged. Open the upgrade window to try another way to pay.',
      failed: 'PayPal couldn’t complete this payment, so you haven’t been charged. Open the upgrade window to try again or pay another way.',
      not_paid: 'The payment didn’t go through, so you haven’t been charged. Open the upgrade window to try again.',
      wrong_product: 'This PayPal order can’t unlock the upgrade.' + help,
      not_found: 'PayPal couldn’t find this order.' + help,
      missing_order: 'Something went wrong with this order.' + help,
      not_configured: 'The payment server isn’t set up correctly yet. Try again later.' + help,
    }[err] || 'We couldn’t reach the payment server. If PayPal took your payment, it’s safe: try again to finish unlocking.' + help;
    openModal((m, close) => {
      m.append(
        h('div', { class: 'eyebrow', text: 'Payment' }),
        h('h2', { text: err === 'pending' ? 'Your payment is processing' : final ? 'The payment didn’t go through' : 'We couldn’t finish unlocking yet' }),
        h('p', { class: 'muted', text: why }),
        h('div', { class: 'modal-actions' },
          h('button', { class: 'btn', type: 'button', text: 'Close', onclick: close }),
          final ? null : h('button', { class: 'btn btn-primary', type: 'button', text: 'Try again', onclick: async (e) => {
            e.target.disabled = true;
            e.target.textContent = 'Checking…';
            const again = await claimOrder(orderID);
            close();
            await finishPurchase(orderID, again);
          } })));
    });
  }

  // A payment approved on an earlier visit that never finished unlocking (closed tab, lost connection).
  async function resumePendingOrder() {
    const id = store.pendingOrder;
    if (!id || !CFG.paypalClientId) return;
    const res = await claimOrder(id);
    if (!res.key && !FINAL_ERRORS.has(res.error)) {
      // Still can't finish: don't block the app with a dialog on every visit.
      toast(res.error === 'pending' ? 'Your PayPal payment is still processing.' : 'Your PayPal payment hasn’t finished unlocking. Open the upgrade window to try again.');
      return;
    }
    await finishPurchase(id, res);
  }

  /* ------------------------------------------------------------ backups */
  function exportBackup() {
    const data = { app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), license: store.license || '', resumes: store.resumes.filter((r) => !r.isExample) };
    const text = JSON.stringify(data, null, 2);
    const name = `inkwell-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (!framed()) {
      try {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const a = h('a', { href: url, download: name });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast(`Saved ${name}`);
        return;
      } catch (e) { /* fall through to copy */ }
    }
    openModal((m, close) => {
      const ta = h('textarea', { class: 'input', id: 'backup-text', rows: 10, readonly: true, style: 'font-family:var(--font-mono);font-size:12px' });
      ta.value = text;
      m.append(h('h2', { text: 'Back up your resumes' }),
        h('p', { class: 'muted', text: 'This preview can’t save files, so copy the backup and keep it somewhere safe. On the live site this downloads a file.' }), ta,
        h('div', { class: 'modal-actions' },
          h('button', { class: 'btn', type: 'button', text: 'Copy backup', onclick: () => { try { navigator.clipboard.writeText(text).then(() => toast('Backup copied'), () => ta.select()); } catch (e) { ta.select(); } } }),
          h('button', { class: 'btn btn-primary', type: 'button', text: 'Done', onclick: close })));
    });
  }

  async function restoreBackup(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return { error: 'That file isn’t a backup. Choose the .json file you saved from Inkwell.' }; }
    if (!data || data.app !== BACKUP_APP || !Array.isArray(data.resumes)) return { error: 'That file isn’t an Inkwell backup.' };
    if (data.license && store.plan !== 'plus') await applyLicense(data.license);
    const valid = data.resumes.filter((r) => r && typeof r === 'object' && Array.isArray(r.sections) && r.contact);
    let added = 0, skipped = 0, same = 0;
    for (const r of valid) {
      const existing = store.resumes.find((x) => x.id === r.id);
      if (existing && JSON.stringify(existing) === JSON.stringify(r)) { same++; continue; }
      if (!canCreate()) { skipped++; continue; }
      const copy = clone(r);
      if (existing) copy.id = T.uid('r');
      copy.isExample = false;
      store.resumes.unshift(copy);
      added++;
    }
    saveNow();
    afterPlanChange();
    return { added, skipped, same };
  }

  function openRestore() {
    openModal((m, close) => {
      const msg = h('div', { class: 'hint', 'aria-live': 'polite' });
      const file = h('input', { type: 'file', id: 'backup-file', accept: '.json,application/json', class: 'input' });
      const finish = (res) => {
        if (res.error) { msg.style.color = 'var(--pencil)'; msg.textContent = res.error; return; }
        close();
        let t = `Restored ${res.added} resume${res.added === 1 ? '' : 's'}`;
        if (res.same) t += `, ${res.same} already here`;
        if (res.skipped) t += `. ${res.skipped} didn’t fit your limit`;
        toast(t);
        if (res.skipped) openUpgrade('limit');
      };
      file.addEventListener('change', () => {
        const f = file.files && file.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = async () => finish(await restoreBackup(String(rd.result || '')));
        rd.onerror = () => finish({ error: 'That file couldn’t be read.' });
        rd.readAsText(f);
      });
      const paste = h('textarea', { class: 'input', id: 'backup-paste', rows: 4, placeholder: 'Or paste a copied backup here', style: 'font-family:var(--font-mono);font-size:12px' });
      m.append(h('h2', { text: 'Restore from a backup' }),
        h('p', { class: 'muted', text: 'Resumes in the backup are added next to the ones you have. Nothing here is deleted.' }),
        h('div', { class: 'field' }, h('label', { for: 'backup-file', text: 'Backup file' }), file),
        h('div', { class: 'field' }, h('label', { for: 'backup-paste', text: 'Pasted backup' }), paste),
        msg,
        h('div', { class: 'modal-actions' },
          h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: close }),
          h('button', { class: 'btn btn-primary', type: 'button', text: 'Restore pasted backup', onclick: async () => finish(await restoreBackup(paste.value)) })));
    });
  }

  /* -------------------------------------------------------------- plan pill */
  function refreshPlan() {
    const pill = $('#plan-pill');
    pill.classList.toggle('is-plus', store.plan === 'plus');
    $('#plan-label').textContent = PLANS[store.plan].label;
    $('#plan-count').textContent = `${counted()} of ${limit()}`;
    pill.title = `${counted()} of ${limit()} resumes used`;
  }

  /* -------------------------------------------------------------- resumes */
  let currentId = null;
  const current = () => store.resumes.find((r) => r.id === currentId) || null;

  function createResume(kind, design) {
    if (!canCreate()) { openUpgrade('limit'); return; }
    let r;
    if (kind === 'example') {
      r = T.sampleResume();
      r.isExample = false;
      r.name = 'My resume';
    } else {
      r = T.blankResume('Untitled resume');
    }
    r.id = T.uid('r');
    let format = 'chronological';
    if (typeof design === 'string') r.template = design;
    else if (design) { format = design.format || format; Object.assign(r, design); }
    T.applyFormat(r, format);
    store.resumes.unshift(r);
    saveNow();
    refreshPlan();
    openResume(r.id);
  }
  function duplicateResume(id) {
    if (!canCreate()) { openUpgrade('limit'); return; }
    const src = store.resumes.find((r) => r.id === id);
    const r = clone(src);
    r.id = T.uid('r');
    r.isExample = false;
    r.name = src.isExample ? 'My resume' : src.name + ' (copy)';
    r.updatedAt = Date.now();
    store.resumes.splice(store.resumes.indexOf(src), 0, r);
    saveNow();
    refreshPlan();
    renderDashboard();
    toast('Duplicated');
  }
  function deleteResume(id) {
    store.resumes = store.resumes.filter((r) => r.id !== id);
    saveNow();
    refreshPlan();
    renderDashboard();
    toast('Deleted');
  }
  function openResume(id) {
    currentId = id;
    store.lastId = id;
    persist();
    if (location.hash === '#edit') route();
    else location.hash = 'edit';
  }

  /* -------------------------------------------------------------- thumbs */
  const thumbRO = new ResizeObserver((entries) => {
    for (const e of entries) scaleThumb(e.target);
  });
  function scaleThumb(el) {
    const rs = el.firstElementChild;
    if (!rs || !el.clientWidth) return;
    rs.style.transform = `scale(${el.clientWidth / rs.offsetWidth})`;
  }
  function makeThumb(r) {
    const d = h('div', { class: 'thumb', 'aria-hidden': 'true' });
    d.innerHTML = T.renderResume(r);
    thumbRO.observe(d);
    requestAnimationFrame(() => scaleThumb(d));
    return d;
  }

  /* -------------------------------------------------------------- routing */
  const views = ['landing', 'dashboard', 'editor'];
  function show(view) {
    for (const v of views) $('#view-' + v).hidden = v !== view;
    document.body.classList.toggle('in-app', view !== 'landing');
    document.body.classList.toggle('in-editor', view === 'editor');
    document.body.style.overflow = view === 'editor' && window.innerWidth > 1000 ? 'hidden' : '';
    if (view !== 'editor') { closePicker(); $('#view-editor').classList.remove('preview-open', 'assist-open'); }
  }
  function route() {
    const hash = location.hash.replace(/^#/, '');
    if (hash === 'resumes') {
      currentId = null;
      show('dashboard');
      renderDashboard();
      window.scrollTo(0, 0);
    } else if (hash === 'edit') {
      if (!current()) {
        const last = store.resumes.find((r) => r.id === store.lastId);
        if (last) currentId = last.id;
      }
      if (!current()) { location.hash = 'resumes'; return; }
      show('editor');
      mountEditor();
    } else {
      currentId = null;
      show('landing');
      const target = hash && document.getElementById(hash);
      if (target && hash !== 'home') target.scrollIntoView();
      else window.scrollTo(0, 0);
    }
  }

  /* ============================================================ Landing */
  const DEMO_TEXT = 'Was responsible for managing a team of 5 reps in order to improve sales\nhelped build a new onboarding proces that was really usefull';
  const DEMO_CTX = { kind: 'bullets', tense: 'past' };

  function initLanding() {
    const sample = T.sampleResume();
    // Hero: two real renders of the example resume, plus what the score and assistant look like
    const art = $('#hero-art');
    const t1 = makeThumb(Object.assign(clone(sample), { template: 'sidebar', accent: '#0E6480', font: 'lato' }));
    t1.classList.add('a1');
    const t2 = makeThumb(Object.assign(clone(sample), { template: 'classic', accent: '#1F3A68', font: 'serif' }));
    t2.classList.add('a2');
    art.append(t1, t2,
      h('div', { class: 'float-chip c1' }, h('strong', { text: 'Resume score 92%' }), h('div', { class: 'meter' }, h('i'))),
      h('div', { class: 'float-chip c2', html: '<strong>Stronger verb</strong><span><s>Worked on</s> <ins>Delivered</ins> 30 renewals</span>' }));

    // Template rail
    const strip = $('#tpl-strip');
    T.TEMPLATES.forEach((t, i) => {
      const preset = T.PRESETS[i % T.PRESETS.length];
      const r = Object.assign(clone(sample), { template: t.id, accent: preset.accent, font: preset.font });
      strip.append(h('button', { class: 'tpl-card', type: 'button', onclick: () => startCreate({ template: t.id, accent: preset.accent, font: preset.font, preset: preset.id }) },
        makeThumb(r), h('span', { class: 'btn btn-primary use', text: 'Use this template' }), h('strong', { text: t.name }), h('span', { class: 'note', text: t.note })));
    });

    // Legend
    const legend = $('#mark-legend');
    Object.entries(A.TYPES).forEach(([k, v]) => legend.append(h('span', { class: `chip static t-${k}` }, h('i'), v.label)));

    // Demo
    const box = new MarkBox({ id: 'demo-input', value: DEMO_TEXT, rows: 3, placeholder: 'Type a resume bullet…', onInput: () => runDemo() });
    $('#demo-box').append(box.el);
    function runDemo() {
      const text = box.value;
      const sugs = A.analyze(text, DEMO_CTX);
      box.setSuggestions(sugs);
      const out = A.transform(text, 'polish', DEMO_CTX).text;
      $('#demo-after').innerHTML = diffHtml(text, out, true);
      const counts = {};
      sugs.forEach((s) => { counts[s.type] = (counts[s.type] || 0) + 1; });
      const chips = $('#demo-chips');
      chips.innerHTML = '';
      Object.entries(counts).forEach(([k, n]) => chips.append(h('span', { class: `chip static t-${k}` }, h('i'), A.TYPES[k].label, h('span', { class: 'n', text: String(n) }))));
      $('#demo-count').textContent = sugs.length ? `${sugs.length} suggestion${sugs.length === 1 ? '' : 's'}` : 'Looks clean';
      $('#demo-apply').disabled = out === text;
    }
    $('#demo-apply').onclick = () => { box.value = A.transform(box.value, 'polish', DEMO_CTX).text; runDemo(); };
    $('#demo-reset').onclick = () => { box.value = DEMO_TEXT; runDemo(); };
    requestAnimationFrame(() => { box.autosize(); runDemo(); });
    window.addEventListener('resize', debounce(() => { box.autosize(); box.paint(); }, 120));

    document.querySelectorAll('[data-upgrade]').forEach((b) => b.addEventListener('click', () => openUpgrade('pricing')));
    document.querySelectorAll('[data-create]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); startCreate(); }));
  }

  // "Create my resume": pick blank or example content (or hit the plan limit)
  function startCreate(design) {
    if (!canCreate()) { openUpgrade('limit'); return; }
    let format = 'chronological';
    openModal((m, close) => {
      const note = h('p', { class: 'format-note' });
      const opts = h('div', { class: 'format-grid', role: 'radiogroup', 'aria-label': 'Resume format' });
      const paint = () => {
        opts.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.f === format)));
        const f = T.FORMATS.find((x) => x.id === format);
        note.textContent = f.warn || '';
        note.hidden = !f.warn;
      };
      T.FORMATS.forEach((f) => opts.append(h('button', { class: 'format-opt', type: 'button', role: 'radio', 'data-f': f.id, onclick: () => { format = f.id; paint(); } },
        h('strong', { text: f.name }), h('span', { text: f.note }))));
      paint();
      const go = (kind) => { close(); createResume(kind, Object.assign({}, typeof design === 'string' ? { template: design } : design, { format })); };
      m.append(
        h('h2', { text: 'Pick a format' }),
        h('p', { class: 'muted', text: 'The format sets the order of your sections. You can switch later in Select template.' }),
        opts, note,
        h('h3', { class: 'modal-sub', text: 'How do you want to start?' }),
        h('div', { class: 'choice-grid' },
          h('button', { class: 'choice', type: 'button', onclick: () => go('blank') }, h('strong', { text: 'Start blank' }), h('span', { text: 'Empty sections ready for your details.' })),
          h('button', { class: 'choice', type: 'button', onclick: () => go('example') }, h('strong', { text: 'Start from an example' }), h('span', { text: 'A filled-in sales resume you can rewrite.' }))),
      );
    });
  }

  function diffHtml(a, b, onlyIns) {
    return A.diffWords(a, b).map((p) => {
      if (p.op === 'eq') return esc(p.text);
      if (p.op === 'ins') return `<ins>${esc(p.text)}</ins>`;
      return onlyIns ? '' : `<del>${esc(p.text)}</del>`;
    }).join('');
  }

  /* ------------------------------------------------------------ MarkBox
     A textarea with a mirrored layer behind it that draws the assistant's marks. */
  function MarkBox(opts) {
    const wrap = h('div', { class: 'mark-wrap' });
    const layer = h('div', { class: 'mark-layer', 'aria-hidden': 'true' });
    const ta = h('textarea', { id: opts.id, rows: opts.rows || 3, placeholder: opts.placeholder || '', spellcheck: 'false' });
    ta.value = opts.value || '';
    wrap.append(layer, ta);
    let sugs = [];
    let caret = -1;
    const self = this;
    this.el = wrap;
    this.ta = ta;
    Object.defineProperty(this, 'value', { get: () => ta.value, set: (v) => { ta.value = v; sugs = []; self.autosize(); self.paint(); } });
    this.autosize = () => {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    };
    this.setSuggestions = (list) => { sugs = list || []; self.paint(); };
    this.setCaret = (c) => { caret = c; self.paint(); };
    this.paint = () => {
      const text = ta.value;
      const fixes = sugs.filter((s) => s.end > s.start && s.end <= text.length && s.replacements.length);
      const adv = sugs.filter((s) => s.end > s.start && s.end <= text.length && !s.replacements.length && s.end - s.start <= 40);
      const chosen = [];
      for (const s of fixes.concat(adv)) {
        if (!chosen.some((c) => s.start < c.end && c.start < s.end)) chosen.push(s);
      }
      chosen.sort((a, b) => a.start - b.start);
      let html = '', i = 0;
      for (const s of chosen) {
        html += esc(text.slice(i, s.start));
        const on = caret >= s.start && caret <= s.end;
        html += `<mark class="t-${s.type}${s.replacements.length ? '' : ' adv'}${on ? ' on' : ''}">${esc(text.slice(s.start, s.end))}</mark>`;
        i = s.end;
      }
      html += esc(text.slice(i)) + '​';
      layer.innerHTML = html;
    };
    ta.addEventListener('input', () => {
      sugs = [];
      self.autosize();
      self.paint();
      if (opts.onInput) opts.onInput(ta.value);
    });
    const caretUpdate = () => { caret = ta.selectionStart; self.paint(); if (opts.onCaret) opts.onCaret(caret); };
    ta.addEventListener('keyup', caretUpdate);
    ta.addEventListener('click', caretUpdate);
    ta.addEventListener('focus', () => { if (opts.onFocus) opts.onFocus(); caretUpdate(); });
  }

  /* ============================================================ Dashboard */
  const DOC_ICON = {
    edit: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M13.5 3.5l3 3L7 16H4v-3Z"/></svg>',
    pdf: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v10M6 9l4 4 4-4M4 17h12"/></svg>',
    copy: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13H7"/></svg>',
    del: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.5h13M8 5.5V3.5h4v2M5.5 5.5l.8 11h7.4l.8-11"/></svg>',
  };
  function docAct(icon, label, onclick, cls) {
    return h('button', { class: 'doc-act' + (cls ? ' ' + cls : ''), type: 'button', onclick }, h('span', { html: DOC_ICON[icon], style: 'display:grid' }), label);
  }
  function fmtWhen(ts) {
    try { return new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); } catch (e) { return fmtDate(ts); }
  }

  function renderDashboard() {
    refreshPlan();
    const usage = $('#usage');
    usage.innerHTML = '';
    usage.append(
      h('span', { class: 'num' }, h('strong', { text: `${counted()} of ${limit()}` }), store.plan === 'plus' ? ' resumes used' : ' free resumes used'),
      h('span', { class: 'usage-bar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.min(100, (counted() / limit()) * 100)}%` })),
      store.plan === 'plus' ? h('span', { class: 'muted', text: 'Upgraded plan' }) : h('button', { class: 'linkish', type: 'button', text: `Upgrade once for ${PRICE} to keep up to 20`, onclick: () => openUpgrade('dash') }));

    const list = $('#dash-grid');
    list.innerHTML = '';
    for (const r of store.resumes) {
      const actions = h('div', { class: 'doc-actions' });
      const renderActions = () => {
        actions.innerHTML = '';
        actions.append(
          docAct('edit', 'Edit', () => openResume(r.id)),
          docAct('pdf', 'Download PDF', () => { openResume(r.id); setTimeout(exportPdf, 300); }),
          docAct('copy', 'Make a copy', () => duplicateResume(r.id)),
          docAct('del', 'Delete', () => {
            actions.innerHTML = '';
            actions.append(h('div', { class: 'confirm' }, h('span', { text: 'Delete this resume?' }),
              h('button', { class: 'btn btn-sm btn-danger', type: 'button', text: 'Delete', onclick: () => deleteResume(r.id) }),
              h('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: 'Cancel', onclick: renderActions })));
          }, 'danger'));
      };
      renderActions();
      list.append(h('div', { class: 'doc-row' },
        h('button', { class: 'thumb-btn', type: 'button', 'aria-label': `Edit ${r.name}`, onclick: () => openResume(r.id) }, makeThumb(r)),
        h('div', { class: 'doc-info' },
          h('h3', { title: r.name }, r.name, r.isExample ? h('span', { class: 'tag', text: 'Example' }) : null),
          h('div', { class: 'when', text: `Updated ${fmtWhen(r.updatedAt)}` }),
          actions)));
    }
    const full = !canCreate();
    list.append(h('button', { class: 'new-row', type: 'button', onclick: () => startCreate() },
      h('div', { class: 'new-tile', 'aria-hidden': 'true', text: '+' }),
      h('div', {}, h('h3', { text: full ? 'Resume limit reached' : 'New resume' }),
        h('p', { text: full ? (store.plan === 'plus' ? 'Delete a resume to make room for a new one.' : `Upgrade once for ${PRICE} to keep up to 20.`) : 'Create a tailored resume for each job you apply to.' }))));

    const foot = $('#dash-foot');
    foot.innerHTML = '';
    if (store.resumes.some((r) => r.isExample)) foot.append(h('span', { text: 'The example resume doesn’t count toward your limit.' }));
    foot.append(h('span', { text: 'Resumes are saved in this browser.' }),
      h('button', { class: 'linkish', type: 'button', text: 'Back up resumes', onclick: exportBackup }),
      h('button', { class: 'linkish', type: 'button', text: 'Restore from backup', onclick: openRestore }));
    if (store.plan === 'plus' && store.testUnlock) foot.append(h('button', { class: 'linkish', type: 'button', text: 'Reset to free plan (testing)', onclick: () => { store.plan = 'free'; store.testUnlock = false; saveNow(); renderDashboard(); toast('Back on the free plan'); } }));
  }

  /* ============================================================ Editor */
  const ed = {
    open: new Set(), // expanded entries (jobs, schools, projects)
    boxes: new Map(), // path -> MarkBox
    focusPath: null,
    caret: -1,
    scope: 'all',
    filter: null,
    proposal: null,
    analysis: {},
    ignored: new Set(),
    mountedId: null,
  };

  function fieldsOf(r) {
    const out = [];
    for (const s of r.sections) {
      if (s.hidden) continue;
      if (s.type === 'summary') out.push({ path: `s:${s.id}:text`, label: s.title, ctx: { kind: 'summary' } });
      else if (s.type === 'text') out.push({ path: `s:${s.id}:text`, label: s.title, ctx: { kind: 'plain' } });
      else if (s.type === 'list') out.push({ path: `s:${s.id}:text`, label: s.title, ctx: { kind: 'list' } });
      else if (s.type === 'skills') out.push({ path: `s:${s.id}:text`, label: s.title, ctx: { kind: 'skills' } });
      else if (s.items) {
        for (const it of s.items) {
          if (s.type === 'education') out.push({ path: `s:${s.id}:i:${it.id}:details`, label: `${it.school || it.degree || 'Education'} · details`, ctx: { kind: 'plain', lines: true } });
          else out.push({ path: `s:${s.id}:i:${it.id}:bullets`, label: `${(s.type === 'experience' ? it.role || it.org : it.name) || s.title} · bullets`, ctx: { kind: 'bullets', tense: it.current ? 'present' : 'past' } });
        }
      }
    }
    return out;
  }
  function resolve(path) {
    const r = current();
    const p = path.split(':');
    if (p[0] === 'c') return [r.contact, p[1]];
    const s = r.sections.find((x) => x.id === p[1]);
    if (!s) return [null, null];
    if (p[2] === 'i') return [(s.items || []).find((x) => x.id === p[3]) || null, p[4]];
    return [s, p[2]];
  }
  function getPath(path) { const [o, k] = resolve(path); return o ? (o[k] == null ? '' : o[k]) : ''; }
  function setPath(path, v) { const [o, k] = resolve(path); if (o) { o[k] = v; touch(); } }
  function fieldInfo(path) { return fieldsOf(current()).find((f) => f.path === path) || null; }

  function touch(structural) {
    const r = current();
    if (!r) return;
    r.updatedAt = Date.now();
    persist();
    schedulePreview();
    scheduleAnalysis();
    scheduleScore();
    if (structural) renderForm();
  }

  function mountEditor() {
    const r = current();
    if (ed.mountedId !== r.id) {
      ed.open = new Set();
      ed.focusPath = null;
      ed.proposal = null;
      ed.ignored = new Set();
      ed.scope = 'all';
      ed.filter = null;
      ed.mountedId = r.id;
    }
    const nameInput = $('#doc-name');
    nameInput.value = r.name;
    nameInput.oninput = () => { current().name = nameInput.value || 'Untitled resume'; persist(); };
    renderForm();
    renderPreview();
    runAnalysis();
    renderScore();
  }

  const marginOf = (r) => T.MARGINS[r.margin] || T.MARGINS.narrow;
  const textSizeOf = (r) => T.TEXT_SIZES[r.textSize] || T.TEXT_SIZES.normal;

  /* ---------------------------------------------------------- resume score */
  const scheduleScore = debounce(() => renderScore(), 300);
  function wordCount(t) { return String(t || '').split(/\s+/).filter(Boolean).length; }
  // Years from the earliest job start to the latest end (or today for a current job)
  function yearsOfExperience(jobs) {
    const now = new Date().getFullYear();
    let first = Infinity, last = -Infinity;
    jobs.forEach((j) => {
      const a = String(j.start || '').match(/(19|20)\d\d/);
      const b = j.current ? [String(now)] : String(j.end || '').match(/(19|20)\d\d/);
      if (a) first = Math.min(first, +a[0]);
      if (b) last = Math.max(last, +b[0]);
      else if (a) last = Math.max(last, +a[0]);
    });
    return first === Infinity ? 0 : Math.max(0, last - first);
  }
  // Section titles applicant tracking systems recognize, by section type
  const STANDARD_TITLES = {
    summary: /^(professional |career |executive )?(summary|profile|objective)$|^about( me)?$/i,
    experience: /^(work |professional |employment |relevant )?(experience|history)$|^employment$|^work history$/i,
    education: /^education( (and|&) training)?$|^academic background$/i,
    skills: /^(key |core |technical |professional )?(skills|competencies)$|^skills (and|&) (tools|expertise)$|^core competencies$/i,
    projects: /^(selected |key |relevant )?projects$/i,
    list: /^(licenses (and|&) )?certifications?( (and|&) licenses)?$|^awards?( (and|&) honors)?$|^honors$|^languages$|^publications$/i,
  };
  function oddTitles(secs) {
    return secs.filter((s) => STANDARD_TITLES[s.type] && !STANDARD_TITLES[s.type].test(String(s.title || '').trim()));
  }
  function computeScore(r) {
    const c = r.contact;
    const secs = r.sections.filter((s) => !s.hidden);
    const find = (type) => secs.find((s) => s.type === type);
    const exp = find('experience');
    const edu = find('education');
    const skills = find('skills');
    const summary = find('summary');
    const jobs = exp ? exp.items.filter((i) => i.role && i.org) : [];
    const fixes = Object.values(ed.analysis).reduce((n, l) => n + l.filter((x) => x.replacements.length).length, 0);
    const skillCount = skills ? String(skills.text || '').split(/[,\n]/).map((x) => x.replace(/^[^:]*:/, '').trim()).filter(Boolean).length : 0;
    const years = yearsOfExperience(jobs);
    const maxPages = years >= 10 ? 2 : 1;
    const pages = ed.pages || 1;
    const odd = oddTitles(secs);
    const items = [
      [4, !!(c.name || '').trim(), 'Add your name', () => focusInput('c:name')],
      [4, !!(c.headline || '').trim(), 'Add a job title', () => focusInput('c:headline')],
      [4, !!(c.email || '').trim(), 'Add your email', () => focusInput('c:email')],
      [4, !!(c.phone || '').trim(), 'Add a phone number', () => focusInput('c:phone')],
      [4, !!(c.location || '').trim(), 'Add your location', () => focusInput('c:location')],
      [4, !!((c.linkedin || '').trim() || (c.website || '').trim()), 'Add LinkedIn or a website', () => focusInput('c:linkedin')],
      [12, !!summary && wordCount(summary.text) >= 25, 'Write a profile summary', () => summary ? focusSection(summary) : addSection('summary')],
      [15, jobs.length > 0, 'Add employment history', () => exp ? openFirstEntry(exp) : addSection('experience')],
      [10, jobs.some((j) => String(j.bullets || '').split('\n').filter((l) => l.trim()).length >= 3), 'Add 3 achievements to a job', () => exp && openFirstEntry(exp)],
      [8, !!edu && edu.items.some((i) => i.degree || i.school), 'Add education', () => edu ? openFirstEntry(edu) : addSection('education')],
      [8, skillCount >= 4, 'List at least 4 skills', () => skills ? focusSection(skills) : addSection('skills')],
      [8, fixes <= 2, `Fix ${fixes} writing suggestion${fixes === 1 ? '' : 's'}`, () => { ed.scope = 'all'; ed.filter = null; renderAssist(); openAssistDrawer(); }],
      [5, pages <= maxPages, maxPages === 1 ? `Cut to 1 page (now ${pages})` : `Cut to 2 pages (now ${pages})`, () => lengthHelp(pages, maxPages, years)],
      [5, textSizeOf(r).pt >= 10.5 && textSizeOf(r).pt <= 12 && marginOf(r).px >= 72, textSizeOf(r).pt < 10.5 ? 'Use 10.5 pt text or larger' : 'Widen your margins', () => openPicker()],
      [5, odd.length === 0, odd.length ? `Rename “${odd[0].title}” to a standard heading` : '', () => odd[0] && focusTitle(odd[0])],
    ];
    const pct = items.reduce((n, [w, ok]) => n + (ok ? w : 0), 0);
    const tips = items.filter(([, ok]) => !ok).sort((a, b) => b[0] - a[0]);
    return { pct, tip: tips[0] || null };
  }
  function renderScore() {
    const r = current();
    if (!r) return;
    const { pct, tip } = computeScore(r);
    const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)';
    const el = $('#score');
    el.style.setProperty('--score', color);
    el.innerHTML = '';
    el.append(
      h('div', { class: 'score-row' },
        h('span', { class: 'score-pct num', text: `${pct}%` }), h('span', { class: 'lbl', text: 'Resume score' }),
        tip ? h('button', { class: 'score-tip', type: 'button', onclick: tip[3] }, h('b', { class: 'num', text: `+${tip[0]}%` }), h('span', { text: tip[2] })) : h('span', { class: 'score-tip', text: 'Looking complete' })),
      h('div', { class: 'score-bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Resume score' }, h('i', { style: `width:${pct}%` })));
  }
  function focusTitle(s) {
    const el = document.querySelector(`[data-sec="${s.id}"] .sec-title`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
    if (el.select) el.select();
    toast(`Screening software looks for headings like “${T.SECTION_TYPES[s.type].title}”.`);
  }
  function lengthHelp(pages, maxPages, years) {
    openModal((m, close) => m.append(
      h('h2', { text: `Your resume runs ${pages} pages` }),
      h('p', { class: 'muted', text: maxPages === 1
        ? `Keep it to one page unless you have 10 or more years of experience${years ? ` (we count about ${years})` : ''} or you're applying for an executive role.`
        : 'Two pages is the most recruiters expect, even for long careers.' }),
      h('ul', {},
        h('li', { text: 'Run “Make concise” on your longest bullets.' }),
        h('li', { text: 'Keep 3 to 5 bullets for recent jobs and 1 or 2 for older ones.' }),
        h('li', { text: 'Drop roles older than 10 to 15 years, or list them without bullets.' }),
        h('li', { text: 'Try Compact spacing in Select template.' })),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', text: 'Close', onclick: close }),
        h('button', { class: 'btn btn-primary', type: 'button', text: 'Make bullets concise', onclick: () => { close(); ed.scope = 'all'; ed.filter = null; renderAssist(); openAssistDrawer(); } }))));
  }
  function focusInput(path) {
    const el = document.getElementById('f-' + path.replace(/[^a-zA-Z0-9]/g, '-'));
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); }
  }
  function focusSection(s) {
    const el = document.querySelector(`[data-sec="${s.id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const f = el.querySelector('textarea, input:not(.sec-title)');
    if (f) f.focus({ preventScroll: true });
  }
  function openFirstEntry(s) {
    if (!s.items.length) s.items.push(T.blankItem(s.type));
    ed.open.add(s.items[0].id);
    renderForm();
    requestAnimationFrame(() => focusSection(s));
  }
  function addSection(type) {
    const s = T.blankSection(type);
    current().sections.push(s);
    if (s.items) ed.open.add(s.items[0].id);
    touch(true);
    requestAnimationFrame(() => focusSection(s));
  }

  /* ---------------------------------------------------------- form */
  const SECTION_HELP = {
    summary: 'Write 2 to 4 short sentences about who you are, what you’re great at and the results you bring.',
    experience: 'Show your relevant experience, newest first. Start each achievement with a verb and add a number where you can.',
    education: 'Your most recent or relevant degree is enough for most roles.',
    skills: 'List the skills that match the job. One group per line, like “Tools: Salesforce, HubSpot”.',
    projects: 'Side projects, launches or initiatives that show what you can do.',
    list: 'One per line: the certification, who issued it and the year. Rename the section for awards or languages.',
    text: 'Anything else worth a section: volunteering, languages, interests.',
  };
  const ADD_ICON = {
    summary: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 5h12M4 9h12M4 13h8"/></svg>',
    experience: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="6" width="14" height="10" rx="1.5"/><path d="M7.5 6V4.5h5V6"/></svg>',
    education: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M2.5 8 10 4.5 17.5 8 10 11.5Z"/><path d="M5.5 9.5V13c1.3 1.2 2.8 1.8 4.5 1.8s3.2-.6 4.5-1.8V9.5"/></svg>',
    skills: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M10 3l2 4.3 4.6.5-3.4 3.1 1 4.6L10 13.2 5.8 15.5l1-4.6L3.4 7.8 8 7.3Z"/></svg>',
    projects: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 6.5h5l1.5 2H17v7.5H3Z"/></svg>',
    list: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><circle cx="10" cy="8" r="4"/><path d="M7.5 11.5 6.5 17l3.5-2 3.5 2-1-5.5"/></svg>',
    text: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 3.5l3 3L7 16H4v-3Z"/></svg>',
  };

  function input(path, label, opts) {
    opts = opts || {};
    const id = 'f-' + path.replace(/[^a-zA-Z0-9]/g, '-');
    const el = h('input', { class: 'input', id, type: opts.type || 'text', placeholder: opts.placeholder || '', value: getPath(path), autocomplete: opts.autocomplete || 'off' });
    el.addEventListener('input', () => { setPath(path, el.value); if (opts.onInput) opts.onInput(el.value); });
    return h('div', { class: 'field' }, h('label', { for: id, text: label }), el, opts.hint || null);
  }
  function area(path, label, opts) {
    opts = opts || {};
    const id = 'f-' + path.replace(/[^a-zA-Z0-9]/g, '-');
    const box = new MarkBox({
      id, value: getPath(path), rows: opts.rows || 3, placeholder: opts.placeholder || '',
      onInput: (v) => { setPath(path, v); ed.caret = box.ta.selectionStart; },
      onFocus: () => { if (ed.focusPath !== path) { ed.focusPath = path; ed.scope = 'field'; ed.proposal = null; renderAssist(); } },
      onCaret: (c) => { ed.caret = c; highlightActive(); },
    });
    ed.boxes.set(path, box);
    // Assistant shortcuts under every text box
    const count = h('button', { class: 'tool tool-count', type: 'button', 'data-count-for': path, onclick: () => openAssistFor(path) });
    const tools = h('div', { class: 'field-tools' },
      h('button', { class: 'tool', type: 'button', onclick: () => quickFor(path, 'polish') }, h('span', { html: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3"/></svg>', style: 'display:grid' }), 'Polish'),
      h('button', { class: 'tool', type: 'button', onclick: () => quickFor(path, 'rephrase') }, 'Rephrase'),
      h('button', { class: 'tool', type: 'button', onclick: () => quickFor(path, 'concise') }, 'Make concise'),
      h('button', { class: 'tool', type: 'button', onclick: () => openAssistFor(path) }, 'More…'),
      count);
    return h('div', { class: 'field' }, h('label', { for: id, text: label }), box.el, opts.hint ? h('div', { class: 'hint', text: opts.hint }) : null, tools);
  }
  function openAssistFor(path) {
    ed.focusPath = path;
    ed.scope = 'field';
    ed.filter = null;
    renderAssist();
    openAssistDrawer();
  }
  function quickFor(path, mode) {
    const box = ed.boxes.get(path);
    if (ed.focusPath !== path) { ed.focusPath = path; ed.caret = box ? box.ta.selectionStart || 0 : 0; }
    ed.scope = 'field';
    runQuick(mode);
    openAssistDrawer();
  }
  function updateFieldCounts() {
    document.querySelectorAll('[data-count-for]').forEach((el) => {
      const n = (ed.analysis[el.dataset.countFor] || []).length;
      el.textContent = n ? `${n} suggestion${n === 1 ? '' : 's'}` : 'No suggestions';
      el.classList.toggle('has', n > 0);
    });
  }

  function renderForm() {
    const r = current();
    const body = $('#form-body');
    const scrollTop = $('#form-scroll').scrollTop;
    const winTop = window.scrollY;
    body.innerHTML = '';
    ed.boxes = new Map();

    // Personal details
    const emailHint = h('div', { class: 'hint' });
    const checkEmail = (v) => {
      const bad = v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
      emailHint.textContent = bad ? 'This email address looks incomplete.' : '';
      emailHint.style.color = bad ? 'var(--red)' : '';
    };
    checkEmail(r.contact.email);
    body.append(h('section', { class: 'sec' },
      h('div', { class: 'sec-head' }, h('span', { class: 'drag static', 'aria-hidden': 'true' }), h('h2', { class: 'sec-title', text: 'Personal details', style: 'cursor:default;background:none' })),
      h('div', { class: 'grid-2' },
        input('c:headline', 'Wanted job title', { placeholder: 'e.g. Account Executive' }),
        input('c:name', 'Full name', { autocomplete: 'name' }),
        input('c:email', 'Email', { type: 'email', autocomplete: 'email', onInput: checkEmail, hint: emailHint }),
        input('c:phone', 'Phone', { type: 'tel', autocomplete: 'tel' }),
        input('c:location', 'City, State', { placeholder: 'e.g. Austin, TX' }),
        input('c:linkedin', 'LinkedIn', { placeholder: 'linkedin.com/in/you' }),
        input('c:website', 'Website or portfolio'))));

    r.sections.forEach((s, idx) => body.append(sectionBlock(s, idx, r.sections.length)));

    // Add section
    const grid = h('div', { class: 'add-grid' });
    Object.entries(T.SECTION_TYPES).forEach(([type, def]) => {
      grid.append(h('button', { type: 'button', onclick: () => addSection(type) }, h('span', { class: 'ai', html: ADD_ICON[type] }), def.label));
    });
    body.append(h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('span', { class: 'drag static', 'aria-hidden': 'true' }), h('h2', { class: 'sec-title', text: 'Add section', style: 'cursor:default;background:none' })), grid));

    requestAnimationFrame(() => {
      ed.boxes.forEach((b) => b.autosize());
      paintAllMarks();
      updateFieldCounts();
      $('#form-scroll').scrollTop = scrollTop;
      if (window.innerWidth <= 1000) window.scrollTo(0, winTop);
    });
  }

  function moveSection(idx, dir) {
    const secs = current().sections;
    const j = idx + dir;
    if (j < 0 || j >= secs.length) return;
    [secs[idx], secs[j]] = [secs[j], secs[idx]];
    touch(true);
  }

  let dragId = null;
  function sectionBlock(s, idx, total) {
    const r = current();
    const grip = h('span', { class: 'drag', title: 'Drag to reorder', html: ICON.grip, 'aria-hidden': 'true' });
    const title = h('input', { class: 'sec-title', value: s.title, 'aria-label': 'Section title', id: 'sec-title-' + s.id });
    title.addEventListener('input', () => { s.title = title.value; touch(); });
    const removable = s.type === 'text' || s.type === 'list' || s.type === 'projects';
    const tools = h('div', { class: 'tools' },
      iconBtn('up', 'Move section up', () => moveSection(idx, -1), idx === 0),
      iconBtn('down', 'Move section down', () => moveSection(idx, 1), idx === total - 1),
      iconBtn(s.hidden ? 'eyeOff' : 'eye', s.hidden ? 'Show on resume' : 'Hide from resume', () => { s.hidden = !s.hidden; touch(true); }),
      removable ? iconBtn('trash', 'Remove section', () => confirmRemoveSection(s, block)) : null);
    const block = h('section', { class: 'sec' + (s.hidden ? ' is-hidden' : ''), 'data-sec': s.id },
      h('div', { class: 'sec-head' }, grip, title, tools),
      h('p', { class: 'sec-desc', text: s.hidden ? 'Hidden from your resume.' : SECTION_HELP[s.type] || '' }),
      sectionBody(s));

    // Drag to reorder (the handle arms dragging so text selection still works)
    grip.addEventListener('mousedown', () => { block.draggable = true; });
    block.addEventListener('dragstart', (e) => {
      dragId = s.id;
      block.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', s.id); e.dataTransfer.effectAllowed = 'move'; } catch (err) { /* ignore */ }
    });
    block.addEventListener('dragend', () => {
      block.draggable = false;
      block.classList.remove('dragging');
      document.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
      dragId = null;
    });
    block.addEventListener('dragover', (e) => {
      if (!dragId || dragId === s.id) return;
      e.preventDefault();
      const rect = block.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      block.classList.toggle('drop-after', after);
      block.classList.toggle('drop-before', !after);
    });
    block.addEventListener('dragleave', () => block.classList.remove('drop-before', 'drop-after'));
    block.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragId || dragId === s.id) return;
      const after = block.classList.contains('drop-after');
      const secs = r.sections;
      const from = secs.findIndex((x) => x.id === dragId);
      const [moved] = secs.splice(from, 1);
      let to = secs.findIndex((x) => x.id === s.id);
      if (after) to++;
      secs.splice(to, 0, moved);
      dragId = null;
      touch(true);
    });
    return block;
  }

  function confirmRemoveSection(s, block) {
    const desc = block.querySelector('.sec-desc');
    desc.replaceWith(h('div', { class: 'confirm-row' }, h('span', { text: `Remove “${s.title}” and its content?` }),
      h('button', { class: 'btn btn-sm btn-danger', type: 'button', text: 'Remove', onclick: () => { current().sections = current().sections.filter((x) => x.id !== s.id); touch(true); } }),
      h('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: 'Cancel', onclick: () => renderForm() })));
  }

  function sectionBody(s) {
    const base = `s:${s.id}`;
    if (s.type === 'summary') return area(`${base}:text`, 'Profile summary', { rows: 4, placeholder: 'e.g. Account executive with 7 years of B2B SaaS experience…' });
    if (s.type === 'text') return area(`${base}:text`, 'Description', { rows: 3 });
    if (s.type === 'skills') return area(`${base}:text`, 'Skills', { rows: 3, placeholder: 'Sales: Discovery, Negotiation\nTools: Salesforce, HubSpot' });
    if (s.type === 'list') return area(`${base}:text`, 'Items', { rows: 3 });
    const noun = s.type === 'experience' ? 'employment' : s.type === 'education' ? 'education' : 'project';
    const wrap = h('div', { style: 'display:grid;gap:12px;grid-template-columns:minmax(0,1fr)' });
    s.items.forEach((it, i) => wrap.append(entryCard(s, it, i)));
    wrap.append(h('button', { class: 'add-link', type: 'button', onclick: () => { const it = T.blankItem(s.type); s.items.push(it); ed.open.add(it.id); touch(true); } },
      '+ ', s.items.length ? `Add one more ${noun}` : `Add ${noun}`));
    return wrap;
  }

  function entrySummary(s, it) {
    if (s.type === 'experience') return [[it.role, it.org].filter(Boolean).join(' at '), [it.start, it.current ? 'Present' : it.end].filter(Boolean).join(' – ')];
    if (s.type === 'education') return [[it.degree, it.school].filter(Boolean).join(', '), [it.start, it.end].filter(Boolean).join(' – ')];
    return [it.name || '', [it.start, it.end].filter(Boolean).join(' – ')];
  }

  function entryCard(s, it, i) {
    const p = `s:${s.id}:i:${it.id}`;
    const open = ed.open.has(it.id);
    const move = (dir) => {
      const j = i + dir;
      if (j < 0 || j >= s.items.length) return;
      [s.items[i], s.items[j]] = [s.items[j], s.items[i]];
      touch(true);
    };
    const [title, sub] = entrySummary(s, it);
    const titleEl = h('strong', { class: title ? '' : 'empty', text: title || '(Not specified)' });
    const subEl = h('span', { text: sub });
    const refreshHead = () => {
      const [t2, s2] = entrySummary(s, it);
      titleEl.textContent = t2 || '(Not specified)';
      titleEl.className = t2 ? '' : 'empty';
      subEl.textContent = s2;
    };
    const card = h('div', { class: 'entry' + (open ? ' open' : '') });
    const head = h('button', { class: 'entry-head', type: 'button', 'aria-expanded': String(open), onclick: () => {
      const now = !card.classList.contains('open');
      card.classList.toggle('open', now);
      head.setAttribute('aria-expanded', String(now));
      if (now) { ed.open.add(it.id); requestAnimationFrame(() => card.querySelectorAll('textarea').forEach((t) => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; })); ed.boxes.forEach((b) => b.paint()); }
      else ed.open.delete(it.id);
    } }, h('span', { class: 't' }, titleEl, subEl), h('span', { class: 'chev', html: ICON.chev, style: 'display:grid' }));
    const side = h('div', { class: 'entry-side' },
      iconBtn('up', 'Move up', () => move(-1), i === 0),
      iconBtn('down', 'Move down', () => move(1), i === s.items.length - 1),
      iconBtn('trash', 'Delete', () => { s.items.splice(i, 1); ed.open.delete(it.id); touch(true); }));
    const fields = [];
    const watch = (el) => { el.querySelectorAll('input').forEach((x) => x.addEventListener('input', refreshHead)); return el; };
    if (s.type === 'experience') {
      const endField = input(`${p}:end`, 'End date', { placeholder: 'Feb 2022' });
      const endInput = endField.querySelector('input');
      endInput.disabled = !!it.current;
      if (it.current) endInput.value = 'Present';
      const cb = h('input', { type: 'checkbox', id: `cur-${it.id}` });
      cb.checked = !!it.current;
      cb.addEventListener('change', () => {
        it.current = cb.checked;
        endInput.disabled = cb.checked;
        endInput.value = cb.checked ? 'Present' : (it.end || '');
        touch();
        refreshHead();
      });
      fields.push(
        watch(h('div', { class: 'grid-2' }, input(`${p}:role`, 'Job title'), input(`${p}:org`, 'Employer'),
          input(`${p}:start`, 'Start date', { placeholder: 'Mar 2022' }), endField,
          input(`${p}:location`, 'City'), h('label', { class: 'check', for: `cur-${it.id}`, style: 'align-self:end;min-height:48px' }, cb, 'I currently work here'))),
        area(`${p}:bullets`, 'Achievements', { rows: 4, placeholder: 'One achievement per line. Start with a verb and include a number.' }));
    } else if (s.type === 'education') {
      fields.push(
        watch(h('div', { class: 'grid-2' }, input(`${p}:school`, 'School'), input(`${p}:degree`, 'Degree'),
          input(`${p}:start`, 'Start date'), input(`${p}:end`, 'End date'), input(`${p}:location`, 'City'))),
        area(`${p}:details`, 'Description', { rows: 2, placeholder: 'Honors, GPA, relevant coursework' }));
    } else {
      fields.push(
        watch(h('div', { class: 'grid-2' }, input(`${p}:name`, 'Project name'), input(`${p}:link`, 'Link or organization'),
          input(`${p}:start`, 'Start date'), input(`${p}:end`, 'End date'))),
        area(`${p}:bullets`, 'What you did', { rows: 3 }));
    }
    card.append(head, side, h('div', { class: 'entry-body' }, fields));
    return card;
  }

  /* ---------------------------------------------------------- template picker */
  function openPicker() {
    $('#picker').hidden = false;
    document.body.style.overflow = 'hidden';
    renderPicker();
  }
  function closePicker() {
    const pk = $('#picker');
    if (pk.hidden) return;
    pk.hidden = true;
    document.body.style.overflow = window.innerWidth > 1000 && !$('#view-editor').hidden ? 'hidden' : '';
    if (current()) renderPreview();
  }
  function renderPicker() {
    const r = current();
    if (!r) return;
    const set = (patch) => { Object.assign(r, patch); touch(); renderPicker(); };

    const colors = $('#picker-colors');
    colors.innerHTML = '';
    T.ACCENTS.forEach((c) => colors.append(h('button', { class: 'swatch', type: 'button', style: `background:${c}`, 'aria-label': `Accent color ${c}`, 'aria-pressed': String(r.accent.toLowerCase() === c.toLowerCase()), onclick: () => set({ accent: c, preset: null }) })));
    const custom = h('input', { type: 'color', id: 'accent-custom', value: r.accent, 'aria-label': 'Custom accent color', style: 'width:30px;height:30px;border:0;background:none;padding:0;cursor:pointer' });
    custom.addEventListener('change', () => set({ accent: custom.value, preset: null }));
    colors.append(custom);

    const side = $('#picker-side');
    const keep = side.scrollTop;
    side.innerHTML = '';
    const tplGrid = h('div', { class: 'tpl-pick' });
    T.TEMPLATES.forEach((t) => {
      tplGrid.append(h('button', { type: 'button', 'aria-pressed': String(r.template === t.id), onclick: () => set({ template: t.id }) }, makeThumb(Object.assign(clone(r), { template: t.id })), t.name));
    });
    const presets = h('div', { class: 'preset-row' });
    T.PRESETS.forEach((p) => {
      presets.append(h('button', { class: 'preset', type: 'button', 'aria-pressed': String(r.preset === p.id && r.accent === p.accent && r.font === p.font), onclick: () => set({ preset: p.id, accent: p.accent, font: p.font }) },
        h('span', { class: 'sw', style: `background:${p.accent}` }), h('strong', { text: p.name }), h('span', { text: T.FONTS[p.font].name })));
    });
    const font = h('select', { class: 'input', id: 'font-pick' });
    Object.entries(T.FONTS).forEach(([k, f]) => font.append(h('option', { value: k, text: f.name })));
    font.value = r.font;
    font.addEventListener('change', () => set({ font: font.value, preset: null }));
    const seg = (key, opts) => h('div', { class: 'seg', role: 'group' }, opts.map(([v, label]) => h('button', { type: 'button', 'aria-pressed': String(r[key] === v), text: label, onclick: () => set({ [key]: v }) })));
    side.append(
      h('div', { class: 'design-group' }, h('div', { class: 'label', text: 'Templates' }), tplGrid),
      h('div', { class: 'design-group' }, h('div', { class: 'label', text: 'Format (section order)' }),
        h('div', { class: 'seg', role: 'group' }, T.FORMATS.map((f) => h('button', { type: 'button', title: f.note, 'aria-pressed': String((r.format || 'chronological') === f.id), text: f.name, onclick: () => { T.applyFormat(r, f.id); touch(true); renderPicker(); } }))),
        h('div', { class: 'hint', style: 'color:rgba(255,255,255,.75)', text: (T.FORMATS.find((f) => f.id === (r.format || 'chronological')) || T.FORMATS[0]).note }),
        (T.FORMATS.find((f) => f.id === r.format) || {}).warn ? h('p', { class: 'format-note', text: T.FORMATS.find((f) => f.id === r.format).warn }) : null),
      h('div', { class: 'design-group' }, h('div', { class: 'label', text: 'Design presets' }), presets),
      h('div', { class: 'design-group' }, h('label', { class: 'label', for: 'font-pick', text: 'Font' }), font),
      h('div', { class: 'design-group' }, h('div', { class: 'label', text: 'Text size' }), seg('textSize', Object.entries(T.TEXT_SIZES).map(([k, v]) => [k, `${v.name} ${v.pt}pt`])),
        textSizeOf(r).pt < 10.5 ? h('p', { class: 'format-note', text: 'Body text below 10.5 pt is hard to read. Most guides recommend 10.5 to 12 pt.' }) : null),
      h('div', { class: 'design-group' }, h('div', { class: 'label', text: 'Margins' }), seg('margin', Object.entries(T.MARGINS).map(([k, v]) => [k, `${v.name} ${v.label}`])),
        marginOf(r).px < 72 ? h('p', { class: 'format-note', text: 'Narrow margins make a page look crowded. One inch is standard.' }) : null),
      h('div', { class: 'design-group' }, h('div', { class: 'label', text: 'Spacing' }), seg('density', [['comfortable', 'Comfortable'], ['compact', 'Compact']])),
      h('div', { class: 'design-group' }, h('div', { class: 'label', text: 'Paper size' }), seg('paper', [['letter', 'US Letter'], ['a4', 'A4']])),
      r.template === 'ats' ? h('div', { class: 'hint', style: 'color:rgba(255,255,255,.75)', text: 'ATS simple always prints in black.' }) : null);
    side.scrollTop = keep;

    // Big preview
    const holder = $('#picker-holder');
    holder.innerHTML = T.renderResume(r);
    const sheet = holder.firstElementChild;
    const size = SHEET[r.paper === 'a4' ? 'a4' : 'letter'];
    const box = $('#picker-preview');
    const scale = Math.max(0.3, Math.min(1, (box.clientWidth - 64) / size.w));
    sheet.style.transform = `scale(${scale})`;
    holder.style.width = size.w * scale + 'px';
    holder.style.height = sheet.offsetHeight * scale + 'px';
  }

  /* ---------------------------------------------------------- preview */
  const schedulePreview = debounce(() => renderPreview(), 80);
  function renderPreview() {
    const r = current();
    if (!r) return;
    const holder = $('#page-holder');
    holder.innerHTML = T.renderResume(r);
    layoutPreview();
  }
  function layoutPreview() {
    const r = current();
    const holder = $('#page-holder');
    const sheet = holder.firstElementChild;
    if (!r || !sheet) return;
    const size = SHEET[r.paper === 'a4' ? 'a4' : 'letter'];
    const avail = $('#page-scroll').clientWidth - 64;
    const scale = Math.max(0.3, Math.min(1, avail / size.w));
    sheet.style.transform = `scale(${scale})`;
    const hgt = sheet.offsetHeight;
    holder.style.width = size.w * scale + 'px';
    holder.style.height = hgt * scale + 'px';
    // Where the content actually ends (the sheet has a one-page minimum height)
    let contentEnd = 0;
    sheet.querySelectorAll('.rs-sec, .rs-head').forEach((el) => {
      const r2 = el.getBoundingClientRect();
      contentEnd = Math.max(contentEnd, (r2.bottom - sheet.getBoundingClientRect().top) / scale);
    });
    holder.querySelectorAll('.page-break').forEach((el) => el.remove());
    // Printing uses the resume's margins top and bottom, so each page holds (page height - 2 margins) of content.
    const mg = r.template === 'sidebar' ? 48 : marginOf(r).px;
    const per = size.h - 2 * marginOf(r).px;
    let pages = 1;
    for (let y = mg + per; y < contentEnd; y += per) {
      pages++;
      holder.append(h('div', { class: 'page-break', style: `top:${y * scale}px` }, h('span', { text: `Page ${pages}` })));
    }
    $('#page-info').textContent = `${size.label} · ${pages} page${pages > 1 ? 's' : ''}`;
    if (ed.pages !== pages) { ed.pages = pages; scheduleScore(); }
  }

  /* ---------------------------------------------------------- analysis */
  const scheduleAnalysis = debounce(() => runAnalysis(), 260);
  function sugKey(path, s) { return path + '|' + s.original + '|' + s.message; }
  function runAnalysis() {
    const r = current();
    if (!r) return;
    const fields = fieldsOf(r).map((f) => ({ path: f.path, text: getPath(f.path), ctx: f.ctx }));
    const res = A.analyzeResume(fields);
    for (const p of Object.keys(res)) res[p] = res[p].filter((s) => !ed.ignored.has(sugKey(p, s)));
    ed.analysis = res;
    paintAllMarks();
    updateFieldCounts();
    renderAssist();
    renderScore();
  }
  function paintAllMarks() {
    ed.boxes.forEach((box, path) => {
      const text = getPath(path);
      if (box.value !== text) return;
      box.setSuggestions(ed.analysis[path] || []);
    });
  }
  function totalIssues() { return Object.values(ed.analysis).reduce((n, l) => n + l.length, 0); }

  /* ---------------------------------------------------------- assistant */
  const QUICK = [
    ['fix', 'Fix grammar & spelling'],
    ['awkward', 'Fix awkward phrasing'],
    ['rephrase', 'Rephrase line'],
    ['concise', 'Make concise'],
    ['tone', 'Professional tone'],
    ['verbs', 'Stronger verbs'],
  ];

  function setField(path, text) {
    setPath(path, text);
    const box = ed.boxes.get(path);
    if (box) box.value = text;
    runAnalysis();
    renderPreview();
  }

  function focusField(path, s) {
    const box = ed.boxes.get(path);
    if (!box) return;
    closeAssistDrawer();
    closePreview();
    const entry = box.el.closest('.entry');
    if (entry && !entry.classList.contains('open')) entry.querySelector('.entry-head').click();
    box.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    box.ta.focus({ preventScroll: true });
    if (s) { box.ta.setSelectionRange(s.start, s.end); ed.caret = s.start; box.setCaret(s.start); }
  }

  function currentLineRange(text, caret, kind) {
    if (caret < 0) caret = 0;
    if (kind === 'bullets' || kind === 'list' || kind === 'skills') {
      const start = text.lastIndexOf('\n', caret - 1) + 1;
      let end = text.indexOf('\n', caret);
      if (end < 0) end = text.length;
      return [start, end];
    }
    const re = /[^.!?\n]+[.!?]*\s*/g;
    let m;
    while ((m = re.exec(text))) {
      if (caret >= m.index && caret <= m.index + m[0].length) return [m.index, m.index + m[0].replace(/\s+$/, '').length];
    }
    return [0, text.length];
  }

  function runQuick(mode) {
    const path = ed.focusPath;
    const info = path && fieldInfo(path);
    if (!info) return;
    const before = getPath(path);
    if (mode === 'rephrase') {
      const [a, b] = currentLineRange(before, ed.caret, info.ctx.kind);
      const line = before.slice(a, b);
      const lead = line.match(/^[\s\-•*·]*/)[0];
      const options = A.rephrase(line.slice(lead.length), info.ctx);
      ed.proposal = { kind: 'rephrase', path, range: [a + lead.length, b], line: line.slice(lead.length), options };
    } else if (mode === 'polish-all') {
      const changes = [];
      for (const f of fieldsOf(current())) {
        const t = getPath(f.path);
        const out = A.transform(t, 'polish', f.ctx).text;
        if (out !== t) changes.push({ path: f.path, label: f.label, before: t, after: out });
      }
      ed.proposal = { kind: 'bulk', changes };
    } else {
      const after = A.transform(before, mode, info.ctx).text;
      ed.proposal = { kind: 'transform', path, mode, before, after };
    }
    renderAssist();
  }

  function renderAssist() {
    const panel = $('#assist');
    const r = current();
    if (!r) return;
    const scroll = panel.querySelector('.pane-scroll');
    const keep = scroll ? scroll.scrollTop : 0;
    panel.innerHTML = '';
    const info = ed.focusPath && fieldInfo(ed.focusPath);
    if (!info && ed.scope === 'field') ed.scope = 'all';

    const total = totalIssues();
    $('#assist-count').textContent = total ? String(total) : '';

    const scopeTabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Assistant scope' },
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(ed.scope === 'field'), text: 'This field', disabled: !info, onclick: () => { ed.scope = 'field'; ed.filter = null; renderAssist(); } }),
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(ed.scope === 'all'), text: 'Whole resume', onclick: () => { ed.scope = 'all'; ed.filter = null; renderAssist(); } }));

    const intro = h('div', { class: 'assist-intro' },
      h('div', { class: 'assist-title' },
        h('h2', { text: 'Resume Writing Assistant' }),
        h('span', { class: 'assist-badge', text: 'On device' }),
        h('span', { style: 'flex:1' }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close assistant', html: ICON.close, onclick: closeAssistDrawer })),
      scopeTabs);

    if (ed.scope === 'field') {
      intro.append(h('div', { class: 'scope' }, 'Checking ', h('strong', { text: info.label })));
      const grid = h('div', { class: 'actions-grid' },
        h('button', { class: 'btn btn-primary wide', type: 'button', text: 'Polish this field', onclick: () => runQuick('polish') }),
        QUICK.map(([mode, label]) => h('button', { class: 'btn', type: 'button', text: label, onclick: () => runQuick(mode) })));
      intro.append(grid);
    } else {
      intro.append(
        h('div', { class: 'scope', text: total ? `${total} suggestion${total === 1 ? '' : 's'} across your resume. Click into any text box for quick actions like Rephrase and Make concise.` : 'Click into any text box for quick actions like Rephrase and Make concise.' }),
        h('div', { class: 'actions-grid' }, h('button', { class: 'btn btn-primary wide', type: 'button', text: 'Polish whole resume', onclick: () => runQuick('polish-all') })));
    }
    panel.append(intro);

    const list = h('div', { class: 'assist-list' });
    if (ed.proposal) list.append(renderProposal(ed.proposal));

    // Suggestions
    const entries = [];
    if (ed.scope === 'field') (ed.analysis[ed.focusPath] || []).forEach((s) => entries.push({ path: ed.focusPath, s }));
    else for (const f of fieldsOf(r)) (ed.analysis[f.path] || []).forEach((s) => entries.push({ path: f.path, s, label: f.label }));

    const counts = {};
    entries.forEach((e) => { counts[e.s.type] = (counts[e.s.type] || 0) + 1; });
    if (Object.keys(counts).length > 1) {
      const chips = h('div', { class: 'filter-row' });
      Object.keys(A.TYPES).filter((k) => counts[k]).forEach((k) => {
        chips.append(h('button', { class: `chip t-${k}`, type: 'button', 'aria-pressed': String(ed.filter === k), onclick: () => { ed.filter = ed.filter === k ? null : k; renderAssist(); } },
          h('i'), A.TYPES[k].label, h('span', { class: 'n', text: String(counts[k]) })));
      });
      list.append(chips);
    }
    const shown = entries.filter((e) => !ed.filter || e.s.type === ed.filter);
    if (!shown.length) {
      list.append(h('div', { class: 'empty' },
        h('div', { class: 'big', text: entries.length ? 'Nothing in this filter' : 'No suggestions' }),
        h('div', { text: ed.scope === 'field' ? 'This field reads cleanly. Try Rephrase for another wording.' : 'Your resume reads cleanly.' })));
    }
    let lastLabel = null;
    for (const e of shown) {
      if (ed.scope === 'all' && e.label !== lastLabel) {
        lastLabel = e.label;
        list.append(h('div', { class: 'group-label' }, h('span', { text: e.label })));
      }
      list.append(sugCard(e.path, e.s));
    }
    const sc = h('div', { class: 'pane-scroll' }, list);
    panel.append(sc);
    sc.scrollTop = keep;
    highlightActive();
  }

  function sugCard(path, s) {
    const text = getPath(path);
    const ctxStart = Math.max(0, text.lastIndexOf('\n', s.start - 1) + 1, s.start - 50);
    let ctxEnd = text.indexOf('\n', s.end);
    if (ctxEnd < 0) ctxEnd = text.length;
    ctxEnd = Math.min(ctxEnd, s.end + 50);
    const orig = h('div', { class: 'sug-orig' });
    if (s.replacements.length || s.end - s.start <= 60) {
      orig.innerHTML = (ctxStart > 0 && text[ctxStart - 1] !== '\n' ? '…' : '') + esc(text.slice(ctxStart, s.start)) + (s.end > s.start ? `<s>${esc(text.slice(s.start, s.end))}</s>` : '') + esc(text.slice(s.end, ctxEnd)) + (ctxEnd < text.length && text[ctxEnd] !== '\n' ? '…' : '');
    } else {
      orig.textContent = text.slice(s.start, Math.min(s.end, s.start + 90)) + (s.end - s.start > 90 ? '…' : '');
    }
    const reps = h('div', { class: 'sug-reps' });
    s.replacements.forEach((rep) => {
      const label = rep === '' ? 'Remove' : s.start === s.end ? `Add “${rep}”` : rep;
      reps.append(h('button', { class: 'rep-btn' + (rep === '' ? ' del' : ''), type: 'button', text: label, onclick: (ev) => {
        ev.stopPropagation();
        setField(path, A.applySuggestion(getPath(path), s, rep));
        toast('Applied');
      } }));
    });
    reps.append(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Ignore', onclick: (ev) => {
      ev.stopPropagation();
      ed.ignored.add(sugKey(path, s));
      runAnalysis();
    } }));
    const card = h('div', { class: `sug t-${s.type}`, 'data-path': path, 'data-start': s.start, 'data-end': s.end, onclick: () => focusField(path, s) },
      h('div', { class: 'sug-type', text: A.TYPES[s.type].label }),
      h('div', { class: 'sug-msg', text: s.message }),
      orig, reps);
    return card;
  }

  function highlightActive() {
    const cards = document.querySelectorAll('#assist .sug');
    let first = null;
    cards.forEach((c) => {
      const on = c.dataset.path === ed.focusPath && ed.caret >= +c.dataset.start && ed.caret <= +c.dataset.end;
      c.classList.toggle('active', on);
      if (on && !first) first = c;
    });
    if (first && ed.scope === 'field') first.scrollIntoView({ block: 'nearest' });
  }

  function renderProposal(p) {
    const wrap = h('div', { class: 'proposal' });
    const discard = h('button', { class: 'btn btn-sm', type: 'button', text: 'Discard', onclick: () => { ed.proposal = null; renderAssist(); } });
    if (p.kind === 'transform') {
      const label = p.mode === 'polish' ? 'Polish' : (QUICK.find((q) => q[0] === p.mode) || [0, ''])[1];
      if (p.before === p.after) {
        wrap.append(h('div', { class: 'proposal-head' }, h('strong', { text: label }), discard), h('div', { class: 'sug-msg', text: 'No changes needed here.' }));
        return wrap;
      }
      wrap.append(
        h('div', { class: 'proposal-head' }, h('strong', { text: label })),
        h('div', { class: 'diff', html: diffHtml(p.before, p.after) }),
        h('div', { class: 'proposal-actions' },
          h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'Accept changes', onclick: () => { ed.proposal = null; setField(p.path, p.after); toast('Applied'); } }),
          discard));
    } else if (p.kind === 'rephrase') {
      wrap.append(h('div', { class: 'proposal-head' }, h('strong', { text: 'Rephrase' }), discard));
      if (!p.options.length) {
        wrap.append(h('div', { class: 'sug-msg', text: 'This line already reads well. No alternative wording to offer.' }));
        return wrap;
      }
      wrap.append(h('div', { class: 'hint', text: 'Pick a version to replace the current line.' }));
      p.options.forEach((o) => {
        wrap.append(h('div', { class: 'option' },
          h('div', { class: 'diff', html: diffHtml(p.line, o) }),
          h('div', {}, h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'Use this', onclick: () => {
            const t = getPath(p.path);
            ed.proposal = null;
            setField(p.path, t.slice(0, p.range[0]) + o + t.slice(p.range[1]));
            toast('Rephrased');
          } }))));
      });
    } else if (p.kind === 'bulk') {
      wrap.append(h('div', { class: 'proposal-head' }, h('strong', { text: 'Polish whole resume' }), p.changes.length ? null : discard));
      if (!p.changes.length) {
        wrap.append(h('div', { class: 'sug-msg', text: 'No automatic fixes left. Remaining suggestions need your judgment.' }));
        return wrap;
      }
      p.changes.forEach((c) => wrap.append(h('div', { class: 'group-label', text: c.label }), h('div', { class: 'diff', html: diffHtml(c.before, c.after) })));
      wrap.append(h('div', { class: 'proposal-actions' },
        h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: `Accept ${p.changes.length} change${p.changes.length === 1 ? '' : 's'}`, onclick: () => {
          ed.proposal = null;
          p.changes.forEach((c) => { setPath(c.path, c.after); const b = ed.boxes.get(c.path); if (b) b.value = c.after; });
          runAnalysis();
          renderPreview();
          toast('Polished');
        } }),
        discard));
    }
    return wrap;
  }

  /* ---------------------------------------------------------- export */
  function framed() { try { return window.self !== window.top; } catch (e) { return true; } }
  function exportPdf() {
    const r = current();
    const size = r.paper === 'a4' ? 'A4' : 'letter';
    let st = document.getElementById('page-size-style');
    if (!st) { st = h('style', { id: 'page-size-style' }); document.head.append(st); }
    st.textContent = `@page { size: ${size}; margin: ${marginOf(r).px / 96}in; }`;
    $('#print-root').innerHTML = T.renderResume(r);
    const safeName = (r.contact.name || r.name || 'resume').replace(/[^\w\- ]+/g, '').trim() || 'resume';
    const prevTitle = document.title;
    document.title = safeName + ' Resume';
    if (framed()) {
      openModal((m, close) => m.append(
        h('div', { class: 'eyebrow', text: 'Export PDF' }),
        h('h2', { text: 'Export opens your browser’s Save as PDF' }),
        h('p', { class: 'muted', text: 'This preview window blocks print dialogs, so export works once the app runs on its own website. Your layout, fonts and page breaks carry over exactly. Choose “Save as PDF” as the destination when the dialog opens.' }),
        h('div', { class: 'modal-actions' },
          h('button', { class: 'btn', type: 'button', text: 'Copy plain text instead', onclick: () => { close(); copyText(); } }),
          h('button', { class: 'btn btn-primary', type: 'button', text: 'Try anyway', onclick: () => { close(); window.print(); } }))));
      document.title = prevTitle;
      return;
    }
    window.print();
    setTimeout(() => { document.title = prevTitle; }, 500);
  }
  function copyText() {
    const text = T.plainText(current());
    const fallback = () => openModal((m, close) => {
      const ta = h('textarea', { class: 'input', rows: 12, style: 'font-family:var(--font-mono);font-size:12.5px', id: 'plain-text' });
      ta.value = text;
      m.append(h('h2', { text: 'Plain-text resume' }), h('p', { class: 'muted', text: 'Select all and copy. Paste it into application forms that ask for plain text.' }), ta,
        h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-primary', type: 'button', text: 'Done', onclick: close })));
      setTimeout(() => { ta.focus(); ta.select(); }, 30);
    });
    try {
      navigator.clipboard.writeText(text).then(() => toast('Copied plain text for application forms'), fallback);
    } catch (e) { fallback(); }
  }

  /* ---------------------------------------------------------- mobile preview + drawer */
  function openPreview() { $('#view-editor').classList.add('preview-open'); requestAnimationFrame(layoutPreview); }
  function closePreview() { $('#view-editor').classList.remove('preview-open'); }
  function openAssistDrawer() { $('#view-editor').classList.add('assist-open'); }
  function closeAssistDrawer() { $('#view-editor').classList.remove('assist-open'); }

  /* ============================================================ init */
  function init() {
    initLanding();
    refreshPlan();
    $('#plan-pill').addEventListener('click', () => openUpgrade('pill'));
    $('#open-picker').addEventListener('click', openPicker);
    $('#picker-back').addEventListener('click', closePicker);
    $('#picker-pdf').addEventListener('click', () => { closePicker(); exportPdf(); });
    $('#fab-preview').addEventListener('click', openPreview);
    $('#preview-close').addEventListener('click', closePreview);
    $('#dash-new').addEventListener('click', () => startCreate());
    $('#export-pdf').addEventListener('click', exportPdf);
    $('#copy-text').addEventListener('click', copyText);
    $('#assist-open').addEventListener('click', openAssistDrawer);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if ($('#modal-root').firstChild) { if (!$('#modal-root').firstChild.dataset.sticky) closeModal(); }
      else if ($('#view-editor').classList.contains('assist-open')) closeAssistDrawer();
      else if (!$('#picker').hidden) closePicker();
      else closePreview();
    });
    window.addEventListener('resize', debounce(() => {
      if (!$('#view-editor').hidden) {
        layoutPreview();
        ed.boxes.forEach((b) => { b.autosize(); b.paint(); });
        if ($('#picker').hidden) document.body.style.overflow = window.innerWidth > 1000 ? 'hidden' : '';
        else renderPicker();
      }
    }, 120));
    window.addEventListener('hashchange', route);
    window.addEventListener('storage', (e) => {
      if (e.key !== STORE_KEY) return;
      let d = null;
      try { d = JSON.parse(e.newValue || 'null'); } catch (err) { return; }
      if (mergeEntitlement(d)) afterPlanChange();
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!$('#view-editor').hidden) layoutPreview(); });
    route();
    checkStoredPlan();
    resumePendingOrder();
    // Offline support on the live site (service workers don't run in the preview frame)
    if ('serviceWorker' in navigator && !framed() && /^https:|^http:\/\/localhost/.test(location.href)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  init();
})();
