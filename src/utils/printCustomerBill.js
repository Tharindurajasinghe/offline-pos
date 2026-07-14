// src/utils/printCustomerBill.js
//
// Prints a customer (credit) bill in either 80mm thermal or A4 format.
// Both sizes carry EXACTLY the same information:
//   • shop info (logo, name, address, phone)
//   • customer basic info (code, name, phone, address)
//   • the bill itself (items, qty, price, totals, paid/pending status)
//   • balance due (customer's total outstanding)
//   • last payment record (amount + date)
//
// Usage:
//   printCustomerBill({ billId, customer, lastPayment, size: '80mm' | 'A4' })

import DateTime from './dateTime'

// Escape anything that comes from the DB before putting it in HTML.
// A product or shop name containing < & " would otherwise break the layout.
const esc = (v) => {
  if (v === null || v === undefined) return ''
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const money = (v) => 'Rs. ' + (parseFloat(v) || 0).toFixed(2)

export async function printCustomerBill({ billId, customer, lastPayment, size = '80mm' }) {
  const [billRes, setRes] = await Promise.all([
    window.api.getBillDetails(billId),
    window.api.getSettings()
  ])

  if (!billRes.success) {
    alert(billRes.message || 'Could not load the bill')
    return
  }

  const bill = billRes.data
  const shop = setRes.success ? setRes.data : {}

  const html = size === 'A4'
    ? buildA4(bill, shop, customer, lastPayment)
    : build80mm(bill, shop, customer, lastPayment)

  const win = window.open('', '_blank',
    size === 'A4' ? 'width=900,height=800' : 'width=420,height=700')
  if (!win) return

  win.document.write(html)
  win.document.close()
  win.focus()
  win.onafterprint = () => win.close()
  setTimeout(() => { try { if (!win.closed) win.print() } catch (_) {} }, 400)
}

// ── Shared content pieces ────────────────────────────────────────────────────

const isPaid = (bill) => bill.bill_status === 'paid'

const statusText = (bill) => (isPaid(bill) ? 'PAID' : 'PENDING')

const lastPaymentLine = (lastPayment) => {
  if (!lastPayment) return 'No payments recorded yet'
  return `${money(lastPayment.amount)} on ${esc(DateTime.formatDateTime(lastPayment.paid_at))}`
}

// ── 80mm THERMAL ─────────────────────────────────────────────────────────────

function build80mm(bill, shop, customer, lastPayment) {
  const items = bill.items.map(i => `
    <tr>
      <td colspan="2">${esc(i.product_name)}<br/><small>${esc(i.variant_name)}</small></td>
    </tr>
    <tr>
      <td>${i.qty} ${esc(i.unit)} x ${money(i.sold_price)}</td>
      <td class="r">${money(i.line_total)}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html><html><head>
  <meta charset="utf-8"/>
  <title>Bill ${esc(bill.bill_number)}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    html, body { width: 100%; margin: 0; padding: 0; }
    body {
      font-family: monospace;
      padding: 2mm 1mm 0 1mm;          /* full width of the roll */
      font-size: 16px; font-weight: bold; color: #000; line-height: 1.25;
    }
    * { font-weight: bold !important; }
    /* ── FEED SPACE ── blank paper after the last line, so the thermal cutter
       never slices through the thank-you text */
    .feed { height: 90px; }
    .logo { display:block; margin:0 auto 4px; max-width: 180px; width:100%; height:auto; }
    h2 { text-align:center; font-size: 22px; margin: 4px 0; }
    .c { text-align:center; }
    .r { text-align:right; }
    p { margin: 2px 0; text-align:center; font-size: 14px; }
    hr { border:none; border-top: 2px dashed #000; margin: 6px 0; }
    table { width:100%; border-collapse: collapse; }
    td { font-size: 14px; padding: 2px 0; }
    small { font-size: 12px; }
    .title {
      text-align:center; font-size: 16px; border: 2px solid #000;
      padding: 4px; margin: 6px 0; letter-spacing: 1px;
    }
    .kv { display:flex; justify-content:space-between; font-size:14px; margin:2px 0; }
    .big { font-size: 18px; }
    .box { border: 2px solid #000; padding: 5px; margin: 6px 0; }
    .status {
      text-align:center; font-size:16px; padding:3px;
      border: 2px solid #000; margin: 6px 0;
    }
    @media print { body { margin:0; } * { -webkit-print-color-adjust: exact; color:#000; } }
  </style></head><body>

  ${shop.shop_logo ? `<img src="${shop.shop_logo}" class="logo"/>` : ''}
  <h2>${esc(shop.shop_name || 'SHOP')}</h2>
  ${shop.shop_bio ? `<p>${esc(shop.shop_bio)}</p>` : ''}
  ${shop.shop_address ? `<p>${esc(shop.shop_address)}</p>` : ''}
  ${shop.shop_tel ? `<p>Tel: ${esc(shop.shop_tel)}</p>` : ''}

  <div class="title">CUSTOMER BILL</div>

  <div class="kv"><span>Bill No:</span><span>${esc(bill.bill_number)}</span></div>
  <div class="kv"><span>Date:</span><span>${esc(DateTime.formatDateTime(bill.bill_date))}</span></div>
  ${bill.billed_by ? `<div class="kv"><span>Billed By:</span><span>${esc(bill.billed_by)}</span></div>` : ''}
  ${bill.is_wholesale === 1 ? `<div class="title">*** WHOLESALE BILL ***</div>` : ''}

  <hr/>
  <div class="c">CUSTOMER DETAILS</div>
  <div class="kv"><span>Code:</span><span>${esc(customer.customer_code)}</span></div>
  <div class="kv"><span>Name:</span><span>${esc(customer.name)}</span></div>
  <div class="kv"><span>Phone:</span><span>${esc(customer.phone)}</span></div>
  ${customer.address1 ? `<div class="kv"><span>Address:</span><span>${esc(customer.address1)}</span></div>` : ''}
  ${customer.address2 ? `<div class="kv"><span></span><span>${esc(customer.address2)}</span></div>` : ''}

  <hr/>
  <table><tbody>${items}</tbody></table>
  <hr/>

  <div class="kv"><span>Subtotal:</span><span>${money(bill.subtotal)}</span></div>
  ${parseFloat(bill.total_discount) > 0
      ? `<div class="kv"><span>Discount:</span><span>${money(bill.total_discount)}</span></div>` : ''}
  <div class="kv big"><span>BILL TOTAL:</span><span>${money(bill.grand_total)}</span></div>

  <div class="status">THIS BILL: ${statusText(bill)}</div>

  <div class="box">
    <div class="kv"><span>Last Payment:</span></div>
    <div class="c" style="font-size:13px">${lastPaymentLine(lastPayment)}</div>
    <hr/>
    <div class="kv big"><span>BALANCE DUE:</span><span>${money(customer.total_pending)}</span></div>
  </div>

  <p>${esc(shop.bill_thank_you || 'Thank you!')}</p>
  <p style="font-size:13px">Printed: ${esc(DateTime.formatDateTime(new Date().toISOString()))}</p>

  <div class="feed">&nbsp;</div>

  </body></html>`
}

// ── A4 ───────────────────────────────────────────────────────────────────────

function buildA4(bill, shop, customer, lastPayment) {
  const items = bill.items.map((i, n) => `
    <tr>
      <td class="c">${n + 1}</td>
      <td>${esc(i.product_name)}<div class="sub">${esc(i.variant_name)}</div></td>
      <td class="c">${i.qty} ${esc(i.unit)}</td>
      <td class="r">${money(i.sold_price)}</td>
      <td class="r">${money(i.line_total)}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html><html><head>
  <meta charset="utf-8"/>
  <title>Bill ${esc(bill.bill_number)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body {
      font-family: Arial, Helvetica, sans-serif; color: #111;
      font-size: 13px; margin: 0;
    }
    .head { display:flex; justify-content:space-between; align-items:flex-start;
            border-bottom: 3px solid #111; padding-bottom: 12px; }
    .logo { max-height: 80px; max-width: 200px; }
    .shop-name { font-size: 26px; font-weight: 800; margin: 0 0 4px; }
    .shop-meta { font-size: 12px; color: #444; line-height: 1.5; }
    .doc-title { text-align:right; }
    .doc-title h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: 2px; }
    .badge { display:inline-block; padding: 4px 12px; border: 2px solid #111;
             font-weight: 800; font-size: 13px; letter-spacing: 1px; }
    .cols { display:flex; gap: 20px; margin: 18px 0; }
    .col { flex:1; border: 1px solid #ccc; border-radius: 6px; padding: 10px 12px; }
    .col h3 { margin:0 0 8px; font-size: 12px; letter-spacing: 1px;
              text-transform: uppercase; color:#555; border-bottom:1px solid #eee; padding-bottom:4px; }
    .kv { display:flex; justify-content:space-between; margin: 3px 0; font-size: 12.5px; }
    .kv span:first-child { color:#555; }
    .kv span:last-child { font-weight: 600; }
    table { width:100%; border-collapse: collapse; margin-top: 6px; }
    th { background:#f3f4f6; border:1px solid #d1d5db; padding: 8px; font-size: 12px;
         text-align:left; text-transform: uppercase; letter-spacing:.5px; }
    td { border:1px solid #e5e7eb; padding: 8px; }
    .sub { font-size: 11px; color:#6b7280; }
    .c { text-align:center; } .r { text-align:right; }
    .totals { width: 300px; margin-left:auto; margin-top: 12px; }
    .totals .kv { padding: 4px 0; }
    .grand { border-top: 2px solid #111; font-size: 16px; font-weight: 800; padding-top: 6px; }
    .due-box { margin-top: 20px; border: 3px solid #111; padding: 12px 14px; }
    .due-box h3 { margin:0 0 8px; font-size:13px; letter-spacing:1px; text-transform:uppercase; }
    .due { font-size: 20px; font-weight: 800; }
    .wholesale { border:2px solid #111; padding:4px 10px; display:inline-block;
                 font-weight:800; margin-top:6px; letter-spacing:1px; }
    .foot { margin-top: 26px; text-align:center; color:#555; font-size: 12px;
            border-top:1px solid #ddd; padding-top: 10px; }
  </style></head><body>

  <div class="head">
    <div>
      ${shop.shop_logo ? `<img src="${shop.shop_logo}" class="logo"/><br/>` : ''}
      <div class="shop-name">${esc(shop.shop_name || 'SHOP')}</div>
      <div class="shop-meta">
        ${shop.shop_bio ? esc(shop.shop_bio) + '<br/>' : ''}
        ${shop.shop_address ? esc(shop.shop_address) + '<br/>' : ''}
        ${shop.shop_tel ? 'Tel: ' + esc(shop.shop_tel) : ''}
      </div>
    </div>
    <div class="doc-title">
      <h1>CUSTOMER BILL</h1>
      <div class="badge">${statusText(bill)}</div>
      ${bill.is_wholesale === 1 ? `<div class="wholesale">WHOLESALE BILL</div>` : ''}
    </div>
  </div>

  <div class="cols">
    <div class="col">
      <h3>Bill To</h3>
      <div class="kv"><span>Customer Code</span><span>${esc(customer.customer_code)}</span></div>
      <div class="kv"><span>Name</span><span>${esc(customer.name)}</span></div>
      <div class="kv"><span>Phone</span><span>${esc(customer.phone)}</span></div>
      ${customer.address1 ? `<div class="kv"><span>Address</span><span>${esc(customer.address1)}</span></div>` : ''}
      ${customer.address2 ? `<div class="kv"><span></span><span>${esc(customer.address2)}</span></div>` : ''}
    </div>
    <div class="col">
      <h3>Bill Details</h3>
      <div class="kv"><span>Bill No</span><span>${esc(bill.bill_number)}</span></div>
      <div class="kv"><span>Date</span><span>${esc(DateTime.formatDateTime(bill.bill_date))}</span></div>
      ${bill.billed_by ? `<div class="kv"><span>Billed By</span><span>${esc(bill.billed_by)}</span></div>` : ''}
      <div class="kv"><span>Status</span><span>${statusText(bill)}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="c" style="width:40px">#</th>
        <th>Item</th>
        <th class="c" style="width:90px">Qty</th>
        <th class="r" style="width:110px">Unit Price</th>
        <th class="r" style="width:120px">Total</th>
      </tr>
    </thead>
    <tbody>${items}</tbody>
  </table>

  <div class="totals">
    <div class="kv"><span>Subtotal</span><span>${money(bill.subtotal)}</span></div>
    ${parseFloat(bill.total_discount) > 0
      ? `<div class="kv"><span>Discount</span><span>${money(bill.total_discount)}</span></div>` : ''}
    <div class="kv grand"><span>BILL TOTAL</span><span>${money(bill.grand_total)}</span></div>
  </div>

  <div class="due-box">
    <h3>Account Summary</h3>
    <div class="kv">
      <span>Last Payment Received</span>
      <span>${lastPaymentLine(lastPayment)}</span>
    </div>
    <div class="kv due" style="margin-top:8px; border-top:2px solid #111; padding-top:8px;">
      <span>TOTAL BALANCE DUE</span>
      <span>${money(customer.total_pending)}</span>
    </div>
  </div>

  <div class="foot">
    ${esc(shop.bill_thank_you || 'Thank you!')}<br/>
    Printed: ${esc(DateTime.formatDateTime(new Date().toISOString()))}
  </div>

  </body></html>`
}