(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const CURRENCY = {
    INR: { symbol: '₹', locale: 'en-IN' },
    USD: { symbol: '$', locale: 'en-US' },
    EUR: { symbol: '€', locale: 'de-DE' },
    GBP: { symbol: '£', locale: 'en-GB' },
    AED: { symbol: 'AED ', locale: 'en-AE' },
  };

  const state = {
    items: [{ desc: 'Service / product', qty: 1, rate: 1000 }],
  };

  function todayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function money(n, code) {
    const cfg = CURRENCY[code] || CURRENCY.USD;
    const num = Number(n) || 0;
    try {
      return new Intl.NumberFormat(cfg.locale, {
        style: 'currency',
        currency: code,
        maximumFractionDigits: 2,
      }).format(num);
    } catch {
      return cfg.symbol + num.toFixed(2);
    }
  }

  function calc() {
    const sub = state.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
    const mode = $('taxMode').value;
    const rate = Number($('taxRate').value) || 0;
    let tax = 0;
    let taxLabel = 'Tax';
    if (mode === 'gst') {
      tax = sub * (rate / 100);
      taxLabel = `GST (${rate}%)`;
    } else if (mode === 'vat') {
      tax = sub * (rate / 100);
      taxLabel = `VAT (${rate}%)`;
    } else if (mode === 'sales') {
      tax = sub * (rate / 100);
      taxLabel = `Sales tax (${rate}%)`;
    }
    return { sub, tax, taxLabel, total: sub + tax, mode };
  }

  function renderItemsEditor() {
    const body = $('itemsBody');
    body.innerHTML = '';
    state.items.forEach((it, i) => {
      const tr = document.createElement('tr');
      const amt = (Number(it.qty) || 0) * (Number(it.rate) || 0);
      tr.innerHTML = `
        <td><input data-i="${i}" data-f="desc" value="${escapeAttr(it.desc)}" /></td>
        <td style="width:72px"><input data-i="${i}" data-f="qty" type="number" min="0" step="0.01" value="${it.qty}" /></td>
        <td style="width:100px"><input data-i="${i}" data-f="rate" type="number" min="0" step="0.01" value="${it.rate}" /></td>
        <td class="amt">${amt.toFixed(2)}</td>
        <td style="width:40px"><button type="button" class="btn ghost danger" data-del="${i}" title="Remove">×</button></td>
      `;
      body.appendChild(tr);
    });
  }

  function escapeAttr(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function nl2br(s) {
    return escapeHtml(s).replace(/\n/g, '<br>');
  }

  function docLabel() {
    const t = $('docType').value;
    return t === 'quote' ? 'Quote' : t === 'receipt' ? 'Receipt' : 'Invoice';
  }

  function renderPreview() {
    const theme = $('themeSelect').value;
    const preview = $('preview');
    preview.className = 'preview theme-' + (theme.startsWith('pro') ? 'basic' : theme);

    const code = $('currency').value;
    const { sub, tax, taxLabel, total, mode } = calc();
    const label = docLabel();

    const rows = state.items
      .map(
        (it, idx) => `
      <tr>
        <td>${idx + 1}. ${escapeHtml(it.desc)}</td>
        <td class="num">${Number(it.qty) || 0}</td>
        <td class="num">${money(it.rate, code)}</td>
        <td class="num">${money((Number(it.qty) || 0) * (Number(it.rate) || 0), code)}</td>
      </tr>`
      )
      .join('');

    const taxRow =
      mode === 'none'
        ? ''
        : `<div><span>${escapeHtml(taxLabel)}</span><span>${money(tax, code)}</span></div>`;

    const gstExtra =
      theme === 'india-gst'
        ? `<div class="gst-banner">Tax Invoice / Bill of Supply style · verify with your CA</div>`
        : '';

    const partiesBasic = `
      <div class="parties">
        <div>
          <h3>From</h3>
          <strong>${escapeHtml($('fromName').value) || 'Your business'}</strong><br>
          ${nl2br($('fromAddress').value)}<br>
          ${escapeHtml($('fromContact').value)}<br>
          ${$('fromTax').value ? 'Tax ID: ' + escapeHtml($('fromTax').value) : ''}
        </div>
        <div>
          <h3>Bill to</h3>
          <strong>${escapeHtml($('toName').value) || 'Client'}</strong><br>
          ${nl2br($('toAddress').value)}<br>
          ${escapeHtml($('toContact').value)}
        </div>
      </div>`;

    const partiesModern = `
      <div class="parties">
        <div class="party-card">
          <h3>From</h3>
          <strong>${escapeHtml($('fromName').value) || 'Your business'}</strong><br>
          ${nl2br($('fromAddress').value)}<br>
          ${escapeHtml($('fromContact').value)}<br>
          ${$('fromTax').value ? 'Tax ID: ' + escapeHtml($('fromTax').value) : ''}
        </div>
        <div class="party-card">
          <h3>Bill to</h3>
          <strong>${escapeHtml($('toName').value) || 'Client'}</strong><br>
          ${nl2br($('toAddress').value)}<br>
          ${escapeHtml($('toContact').value)}
        </div>
      </div>`;

    const parties = theme === 'modern' ? partiesModern : partiesBasic;

    const totalsBlock =
      theme === 'india-gst'
        ? `<div class="totals-box">
            <div><span>Taxable value</span><span>${money(sub, code)}</span></div>
            ${mode === 'none' ? '' : `<div><span>${escapeHtml(taxLabel)}</span><span>${money(tax, code)}</span></div>`}
            <div class="grand"><span>Grand total</span><span>${money(total, code)}</span></div>
          </div>`
        : `<div class="totals">
            <div><span>Subtotal</span><span>${money(sub, code)}</span></div>
            ${taxRow}
            <div class="grand"><span>Total</span><span>${money(total, code)}</span></div>
          </div>`;

    preview.innerHTML = `
      <div class="doc-header">
        <div>
          <div class="doc-title">${label}</div>
          ${theme === 'modern' ? '<span class="badge">QUICKBILL</span>' : ''}
          ${gstExtra}
        </div>
        <div class="meta">
          <div><strong>#</strong> ${escapeHtml($('docNumber').value) || '—'}</div>
          <div><strong>Date</strong> ${escapeHtml($('docDate').value) || '—'}</div>
          <div><strong>${label === 'Quote' ? 'Valid' : 'Due'}</strong> ${escapeHtml($('docDue').value) || '—'}</div>
        </div>
      </div>
      ${parties}
      <table class="items">
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${totalsBlock}
      ${$('notes').value ? `<div class="notes"><strong>Notes</strong><br>${nl2br($('notes').value)}</div>` : ''}
      ${$('payId').value ? `<div class="pay">Pay: ${escapeHtml($('payId').value)}</div>` : ''}
    `;
  }

  function collect() {
    return {
      docType: $('docType').value,
      theme: $('themeSelect').value,
      fromName: $('fromName').value,
      fromContact: $('fromContact').value,
      fromAddress: $('fromAddress').value,
      fromTax: $('fromTax').value,
      payId: $('payId').value,
      toName: $('toName').value,
      toContact: $('toContact').value,
      toAddress: $('toAddress').value,
      docNumber: $('docNumber').value,
      docDate: $('docDate').value,
      docDue: $('docDue').value,
      currency: $('currency').value,
      taxMode: $('taxMode').value,
      taxRate: $('taxRate').value,
      notes: $('notes').value,
      items: state.items,
    };
  }

  function apply(data) {
    if (!data) return;
    $('docType').value = data.docType || 'invoice';
    if (data.theme && !String(data.theme).startsWith('pro')) $('themeSelect').value = data.theme;
    $('fromName').value = data.fromName || '';
    $('fromContact').value = data.fromContact || '';
    $('fromAddress').value = data.fromAddress || '';
    $('fromTax').value = data.fromTax || '';
    $('payId').value = data.payId || '';
    $('toName').value = data.toName || '';
    $('toContact').value = data.toContact || '';
    $('toAddress').value = data.toAddress || '';
    $('docNumber').value = data.docNumber || '';
    $('docDate').value = data.docDate || todayISO();
    $('docDue').value = data.docDue || '';
    $('currency').value = data.currency || 'INR';
    $('taxMode').value = data.taxMode || 'gst';
    $('taxRate').value = data.taxRate ?? 18;
    $('notes').value = data.notes || '';
    state.items = Array.isArray(data.items) && data.items.length ? data.items : [{ desc: 'Service', qty: 1, rate: 0 }];
    renderItemsEditor();
    renderPreview();
  }

  function bind() {
    $('itemsBody').addEventListener('input', (e) => {
      const t = e.target;
      if (!t.dataset.f) return;
      const i = Number(t.dataset.i);
      let v = t.value;
      if (t.dataset.f === 'qty' || t.dataset.f === 'rate') v = Number(v);
      state.items[i][t.dataset.f] = v;
      renderItemsEditor();
      renderPreview();
      // restore focus roughly
      const el = document.querySelector(`[data-i="${i}"][data-f="${t.dataset.f}"]`);
      if (el) {
        el.focus();
        if (el.setSelectionRange && typeof el.selectionStart === 'number') {
          const pos = el.value.length;
          try { el.setSelectionRange(pos, pos); } catch (_) {}
        }
      }
    });

    $('itemsBody').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-del]');
      if (!btn) return;
      const i = Number(btn.dataset.del);
      state.items.splice(i, 1);
      if (!state.items.length) state.items.push({ desc: '', qty: 1, rate: 0 });
      renderItemsEditor();
      renderPreview();
    });

    $('btnAddItem').addEventListener('click', () => {
      state.items.push({ desc: '', qty: 1, rate: 0 });
      renderItemsEditor();
      renderPreview();
    });

    [
      'docType', 'themeSelect', 'fromName', 'fromContact', 'fromAddress', 'fromTax', 'payId',
      'toName', 'toContact', 'toAddress', 'docNumber', 'docDate', 'docDue',
      'currency', 'taxMode', 'taxRate', 'notes',
    ].forEach((id) => {
      $(id).addEventListener('input', renderPreview);
      $(id).addEventListener('change', renderPreview);
    });

    $('btnSave').addEventListener('click', () => {
      localStorage.setItem('quickbill_draft', JSON.stringify(collect()));
      $('btnSave').textContent = 'Saved ✓';
      setTimeout(() => { $('btnSave').textContent = 'Save draft'; }, 1200);
    });

    $('btnLoad').addEventListener('click', () => {
      const raw = localStorage.getItem('quickbill_draft');
      if (!raw) {
        alert('No draft found in this browser.');
        return;
      }
      try {
        apply(JSON.parse(raw));
      } catch {
        alert('Draft was corrupted.');
      }
    });

    $('btnPrint').addEventListener('click', () => window.print());

    $('btnDownloadHtml').addEventListener('click', () => {
      const blob = new Blob(
        [
          `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(docLabel())} ${escapeHtml($('docNumber').value)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:32px;color:#111}
table{width:100%;border-collapse:collapse} th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}
td.num,th:nth-child(n+2){text-align:right}
.totals,.totals-box{margin-left:auto;width:260px;margin-top:16px}
.totals div,.totals-box div{display:flex;justify-content:space-between;padding:4px 0}
.grand{font-weight:800;border-top:2px solid #111;margin-top:6px;padding-top:8px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0}
.doc-title{font-size:28px;font-weight:800}
.notes{margin-top:24px;font-size:13px;white-space:pre-wrap}
.pay{margin-top:12px;font-weight:600}
@media print{body{margin:0}}
</style></head><body>${$('preview').innerHTML}</body></html>`,
        ],
        { type: 'text/html' }
      );
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${($('docNumber').value || labelSlug())}.html`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  function labelSlug() {
    return docLabel().toLowerCase() + '-' + todayISO();
  }

  function init() {
    $('docDate').value = todayISO();
    $('docNumber').value = 'INV-' + String(Date.now()).slice(-6);
    $('fromName').value = 'Your Studio';
    $('fromContact').value = 'hello@example.com';
    $('fromAddress').value = 'City, Country';
    $('toName').value = 'Client Name';
    $('toContact').value = 'client@email.com';
    $('notes').value = 'Payment due within 7 days. Thank you for your business.';
    $('currency').value = 'INR';
    $('taxMode').value = 'gst';
    bind();
    renderItemsEditor();
    renderPreview();

    const saved = localStorage.getItem('quickbill_draft');
    // do not auto-load; keep demo defaults visible for first-time users
    void saved;
  }

  init();
})();
