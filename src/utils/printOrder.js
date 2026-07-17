// src/utils/printOrder.js
// Prints an ORDER (not a bill) in 80mm or A4. Marked clearly as an order slip
// so it isn't mistaken for a paid receipt.

import DateTime from './dateTime'

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const money = (v) => 'Rs. ' + (parseFloat(v) || 0).toFixed(2)

export async function printOrder({ orderId, size = '80mm' }) {
  const [ordRes, setRes] = await Promise.all([
    window.api.getOrderById(orderId),
    window.api.getSettings()
  ])
  if (!ordRes.success) { alert(ordRes.message || 'Could not load the order'); return }

  const order = ordRes.data
  const shop = setRes.success ? setRes.data : {}
  const html = size === 'A4' ? buildA4(order, shop) : build80(order, shop)

  const win = window.open('', '_blank', size === 'A4' ? 'width=900,height=800' : 'width=420,height=700')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  win.onafterprint = () => win.close()
  setTimeout(() => { try { if (!win.closed) win.print() } catch (_) {} }, 400)
}

function build80(order, shop) {
  const items = order.items.map(i => `
    <tr class="in"><td colspan="2">${esc(i.product_name)}<br/><small>${esc(i.variant_name)}</small></td></tr>
    <tr><td>${i.qty} ${esc(i.unit)} x ${money(i.sold_price)}</td><td class="r">${money(i.line_total)}</td></tr>
  `).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(order.order_number)}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    html, body { width: 100%; margin: 0; padding: 0; }
    body { font-family: monospace; padding: 2mm 1mm 0; font-size: 16px; font-weight: bold; color:#000; line-height:1.25; }
    * { font-weight: bold !important; }
    .logo { display:block; margin:0 auto 4px; max-width:180px; width:100%; }
    h2 { text-align:center; font-size:22px; margin:4px 0; }
    p { text-align:center; margin:2px 0; font-size:14px; }
    .title { text-align:center; font-size:18px; border:3px solid #000; padding:5px; margin:6px 0; letter-spacing:1px; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; }
    td { font-size:15px; padding:1px 0; word-wrap:break-word; }
    small { font-size:12px; }
    .r { text-align:right; }
    .kv { display:flex; justify-content:space-between; font-size:14px; margin:2px 0; }
    .big { font-size:20px; }
    hr { border:none; border-top:3px dashed #000; margin:6px 0; }
    .feed { height:90px; }
    @media print { * { -webkit-print-color-adjust:exact; color:#000; } }
  </style></head><body>
  ${shop.shop_logo ? `<img src="${shop.shop_logo}" class="logo"/>` : ''}
  <h2>${esc(shop.shop_name || 'SHOP')}</h2>
  ${shop.shop_address ? `<p>${esc(shop.shop_address)}</p>` : ''}
  ${shop.shop_tel ? `<p>Tel: ${esc(shop.shop_tel)}</p>` : ''}

  <div class="title">*** ORDER SLIP ***</div>

  <div class="kv"><span>Order:</span><span>${esc(order.order_number)}</span></div>
  <div class="kv"><span>Created:</span><span>${esc(DateTime.formatDateTime(order.created_at))}</span></div>
  ${order.is_wholesale === 1 ? `<div class="title">WHOLESALE</div>` : ''}
  <hr/>
  <div class="kv"><span>Customer:</span><span>${esc(order.customer_name || '-')}</span></div>
  ${order.customer_tel ? `<div class="kv"><span>Tel:</span><span>${esc(order.customer_tel)}</span></div>` : ''}
  ${order.delivery_at ? `<div class="kv"><span>Delivery:</span><span>${esc(DateTime.formatDateTime(order.delivery_at))}</span></div>` : ''}
  ${order.message ? `<div style="font-size:13px">Note: ${esc(order.message)}</div>` : ''}
  <hr/>
  <table><tbody>${items}</tbody></table>
  <hr/>
  ${parseFloat(order.total_discount) > 0 ? `<div class="kv"><span>Discount:</span><span>${money(order.total_discount)}</span></div>` : ''}
  <div class="kv big"><span>TOTAL:</span><span>${money(order.grand_total)}</span></div>
  ${order.advance_paid > 0 ? `
  <div class="kv"><span>Advance Paid:</span><span>${money(order.advance_paid)}</span></div>
  <div class="kv big"><span>BALANCE DUE:</span><span>${money(order.grand_total - order.advance_paid)}</span></div>` : ''}
  <hr/>
  <p style="font-size:13px">This Bill Must be Present to take order</p>
  <div class="feed">&nbsp;</div>
  </body></html>`
}

function buildA4(order, shop) {
  const items = order.items.map((i, n) => `
    <tr>
      <td class="c">${n + 1}</td>
      <td>${esc(i.product_name)}<div class="sub">${esc(i.variant_name)}</div></td>
      <td class="c">${i.qty} ${esc(i.unit)}</td>
      <td class="r">${money(i.sold_price)}</td>
      <td class="r">${money(i.line_total)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(order.order_number)}</title>
  <style>
    @page { size:A4; margin:14mm; }
    body { font-family:Arial,Helvetica,sans-serif; color:#111; font-size:13px; margin:0; }
    .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #111; padding-bottom:12px; }
    .logo { max-height:80px; max-width:200px; }
    .sn { font-size:26px; font-weight:800; margin:0 0 4px; }
    .meta { font-size:12px; color:#444; line-height:1.5; }
    h1 { font-size:22px; margin:0 0 6px; letter-spacing:2px; }
    .badge { display:inline-block; padding:4px 12px; border:2px solid #7c3aed; color:#7c3aed; font-weight:800; letter-spacing:1px; }
    .cols { display:flex; gap:20px; margin:18px 0; }
    .col { flex:1; border:1px solid #ccc; border-radius:6px; padding:10px 12px; }
    .col h3 { margin:0 0 8px; font-size:12px; letter-spacing:1px; text-transform:uppercase; color:#555; border-bottom:1px solid #eee; padding-bottom:4px; }
    .kv { display:flex; justify-content:space-between; margin:3px 0; font-size:12.5px; }
    .kv span:first-child { color:#555; }
    .kv span:last-child { font-weight:600; }
    table { width:100%; border-collapse:collapse; margin-top:6px; }
    th { background:#f3f4f6; border:1px solid #d1d5db; padding:8px; font-size:12px; text-align:left; text-transform:uppercase; }
    td { border:1px solid #e5e7eb; padding:8px; }
    .sub { font-size:11px; color:#6b7280; }
    .c { text-align:center; } .r { text-align:right; }
    .totals { width:300px; margin-left:auto; margin-top:12px; }
    .grand { border-top:2px solid #111; font-size:16px; font-weight:800; padding-top:6px; }
    .foot { margin-top:24px; text-align:center; color:#555; font-size:12px; border-top:1px solid #ddd; padding-top:10px; }
  </style></head><body>
  <div class="head">
    <div>
      ${shop.shop_logo ? `<img src="${shop.shop_logo}" class="logo"/><br/>` : ''}
      <div class="sn">${esc(shop.shop_name || 'SHOP')}</div>
      <div class="meta">
        ${shop.shop_address ? esc(shop.shop_address) + '<br/>' : ''}
        ${shop.shop_tel ? 'Tel: ' + esc(shop.shop_tel) : ''}
      </div>
    </div>
    <div style="text-align:right">
      <h1>ORDER SLIP</h1>
      <div class="badge">${order.status === 'completed' ? 'COMPLETED' : 'PENDING'}</div>
      ${order.is_wholesale === 1 ? `<div class="badge" style="border-color:#b45309;color:#b45309;margin-top:6px">WHOLESALE</div>` : ''}
    </div>
  </div>

  <div class="cols">
    <div class="col">
      <h3>Customer</h3>
      <div class="kv"><span>Name</span><span>${esc(order.customer_name || '-')}</span></div>
      ${order.customer_tel ? `<div class="kv"><span>Telephone</span><span>${esc(order.customer_tel)}</span></div>` : ''}
    </div>
    <div class="col">
      <h3>Order</h3>
      <div class="kv"><span>Order No</span><span>${esc(order.order_number)}</span></div>
      <div class="kv"><span>Created</span><span>${esc(DateTime.formatDateTime(order.created_at))}</span></div>
      ${order.delivery_at ? `<div class="kv"><span>Delivery</span><span>${esc(DateTime.formatDateTime(order.delivery_at))}</span></div>` : ''}
    </div>
  </div>

  ${order.message ? `<div class="col" style="margin-bottom:12px"><h3>Message</h3>${esc(order.message)}</div>` : ''}

  <table>
    <thead><tr><th class="c" style="width:40px">#</th><th>Item</th><th class="c" style="width:90px">Qty</th><th class="r" style="width:110px">Unit Price</th><th class="r" style="width:120px">Total</th></tr></thead>
    <tbody>${items}</tbody>
  </table>

  <div class="totals">
    ${parseFloat(order.total_discount) > 0 ? `<div class="kv"><span>Discount</span><span>${money(order.total_discount)}</span></div>` : ''}
    <div class="kv grand"><span>ORDER TOTAL</span><span>${money(order.grand_total)}</span></div>
    ${order.advance_paid > 0 ? `
    <div class="kv" style="margin-top:6px"><span>Advance Paid</span><span>${money(order.advance_paid)}</span></div>
    <div class="kv grand"><span>BALANCE DUE</span><span>${money(order.grand_total - order.advance_paid)}</span></div>` : ''}
  </div>

  <div class="foot">This is an order slip, not a receipt. To take order this bill must be present.</div>
  </body></html>`
}