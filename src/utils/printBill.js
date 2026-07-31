// src/utils/printBill.js

// ── PRINT CONFIG ──────────────────────────────────────────────────────────────
// Tweak these to taste. Everything below reads from here.
const PRINT = {
  paperWidth:  '80mm',  // roll width
  sidePadding: '1mm',   // keep tiny — we want to use the FULL width of the paper
  feedBottom:   90,     // px of blank space after the last line so the cutter
                        // does not slice through the thank-you text
  logoWidth:   200,
  shopName:     25,
  shopInfo:     15,
  tableText:    15,
  bodyText:     14,
  totalsText:   15,
  thankYou:     16,
}
// ──────────────────────────────────────────────────────────────────────────────

export async function printBill(billData, cart, customerName, grandTotal, totalDiscount, cashPaid, change, isWholesale = false, size = '80mm', billDisc = null) {
  const r = await window.api.getSettings()
  if (r.success) {
    if (size === 'A4') {
      printBillA4(billData, r.data, cart, customerName, grandTotal, totalDiscount, cashPaid, change, isWholesale, billDisc)
    } else {
      printBillHTML(billData, r.data, cart, customerName, grandTotal, totalDiscount, cashPaid, change, isWholesale, billDisc)
    }
  }
}

function printBillHTML(billData, settings, cart, customerName, grandTotal, totalDiscount, cashPaid, change, isWholesale, billDisc) {
  // Escape DB values so a name containing < & " can't break the layout
  const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  // Item name gets its own full-width line, then qty/price/total underneath.
  // This is what lets long product names use the ENTIRE paper width instead of
  // being squeezed into a narrow column.
  const items = cart.map(item => `
    <tr class="item-name">
      <td colspan="3">
        ${esc(item.productName)}${item.isPriceEdited ? ' *' : ''}
        <div class="variant">${esc(item.variantName)}</div>
      </td>
    </tr>
    <tr class="item-line">
      <td class="l">${item.qty} ${esc(item.unit)}</td>
      <td class="c">x ${item.soldPrice.toFixed(2)}</td>
      <td class="r">${item.lineTotal.toFixed(2)}</td>
    </tr>
  `).join('')

  const html = `
    <!DOCTYPE html><html><head>
    <meta charset="utf-8"/>
    <title>Bill ${esc(billData.billNumber)}</title>
    <style>

      /* Full paper width, no centering margins wasting space */
      @page { size: ${PRINT.paperWidth} auto; margin: 0; }

      html, body {
        width: 100%;
        margin: 0;
        padding: 0;
      }

      body {
        font-family: monospace;
        padding: 2mm ${PRINT.sidePadding} 0 ${PRINT.sidePadding};
        font-size: ${PRINT.bodyText}px;
        font-weight: bold;
        color: #000;
        line-height: 1.25;
      }

      /* EVERY element bold — the wildcard is required, or td/small keep their
         browser default weight and ignore the inherited bold */
      * { font-weight: bold !important; }

      h2 { text-align: center; font-size: ${PRINT.shopName}px; margin: 4px 0; }
      p  { text-align: center; margin: 2px 0; font-size: ${PRINT.shopInfo}px; }

      .logo {
        display: block; margin: 0 auto 4px auto;
        max-width: ${PRINT.logoWidth}px; width: 100%; height: auto;
      }

      /* Tables span the full width of the roll */
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      td { font-size: ${PRINT.tableText}px; padding: 1px 0; word-wrap: break-word; }

      .item-name td { padding-top: 6px; font-size: ${PRINT.tableText}px; }
      .variant { font-size: ${PRINT.tableText - 4}px; }
      .item-line td { padding-bottom: 4px; }

      .l { text-align: left; }
      .c { text-align: center; }
      .r { text-align: right; }

      .totals td { font-size: ${PRINT.totalsText}px; padding: 3px 0; }
      .grand td {
        font-size: ${PRINT.totalsText + 4}px;
        border-top: 3px solid #000; border-bottom: 3px solid #000;
        padding: 6px 0;
      }

      hr { border: none; border-top: 3px dashed #000; margin: 6px 0; }

      .ws-label {
        text-align: center; font-size: ${PRINT.shopInfo + 2}px;
        border: 3px solid #000; padding: 5px; margin: 8px 0; letter-spacing: 1px;
      }

      .thanks {
        text-align: center;
        font-size: ${PRINT.thankYou}px;
        margin-top: 10px;
      }

      /* ── FEED SPACE ──
         Thermal printers cut the paper right after the last printed line, which
         is why the thank-you text was landing inside the cut. This pushes blank
         paper out after it so nothing gets sliced. */
      .feed { height: ${PRINT.feedBottom}px; }

      @media print {
        body { margin: 0; }
        * { -webkit-print-color-adjust: exact; color: #000; }
      }

    </style>
    </head><body>

    ${settings.shop_logo ? `<img src="${settings.shop_logo}" class="logo"/>` : ''}
    <h2>${esc(settings.shop_name || 'DEMO')}</h2>
    ${settings.shop_bio ? `<p>${esc(settings.shop_bio)}</p>` : ''}
    ${settings.shop_address ? `<p>${esc(settings.shop_address)}</p>` : ''}
    ${settings.shop_tel ? `<p>Tel: ${esc(settings.shop_tel)}</p>` : ''}
    <p>Bill: ${esc(billData.billNumber)}</p>
    <p>${new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })}</p>
    ${customerName ? `<p>Customer: ${esc(customerName)}</p>` : ''}
    ${isWholesale ? `<div class="ws-label">*** WHOLESALE BILL ***</div>` : ''}

    <hr/>
    <table><tbody>${items}</tbody></table>
    <hr/>

    <table class="totals"><tbody>
      ${totalDiscount > 0 ? `
      <tr><td class="l">Discount:</td><td class="r">${totalDiscount.toFixed(2)}</td></tr>` : ''}
      <tr class="grand"><td class="l">TOTAL</td><td class="r">Rs. ${grandTotal.toFixed(2)}</td></tr>
      ${billDisc && billDisc.percent > 0 ? `
      <tr><td class="l">Discount (${billDisc.percent}%):</td><td class="r">- Rs. ${billDisc.amount.toFixed(2)}</td></tr>
      <tr class="grand"><td class="l">PAYABLE</td><td class="r">Rs. ${billDisc.payable.toFixed(2)}</td></tr>` : ''}
      <tr><td class="l">Cash:</td><td class="r">Rs. ${cashPaid.toFixed(2)}</td></tr>
      <tr><td class="l">Change:</td><td class="r">Rs. ${change.toFixed(2)}</td></tr>
    </tbody></table>

    <div class="thanks">${esc(settings.bill_thank_you || 'Thank you!')}</div>

    <!-- blank paper so the cutter never slices the thank-you line -->
    <div class="feed">&nbsp;</div>

    </body></html>
  `

  const win = window.open('', '_blank', 'width=420,height=700')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  win.onafterprint = () => win.close()
  setTimeout(() => { try { if (!win.closed) win.print() } catch (_) {} }, 500)
}

// ── A4 RECEIPT ────────────────────────────────────────────────────────────────
// Same data as the 80mm bill, laid out as an A4 page. The 80mm builder above is
// left completely unchanged.
function printBillA4(billData, settings, cart, customerName, grandTotal, totalDiscount, cashPaid, change, isWholesale, billDisc) {
  const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const money = (v) => 'Rs. ' + (parseFloat(v) || 0).toFixed(2)

  const rows = cart.map((item, n) => `
    <tr>
      <td class="c">${n + 1}</td>
      <td>${esc(item.productName)}<div class="sub">${esc(item.variantName)}${item.isPriceEdited ? ' • price edited' : ''}</div></td>
      <td class="c">${item.qty} ${esc(item.unit)}</td>
      <td class="r">${money(item.soldPrice)}</td>
      <td class="r">${money(item.lineTotal)}</td>
    </tr>
  `).join('')

  const html = `
    <!DOCTYPE html><html><head>
    <meta charset="utf-8"/>
    <title>Bill ${esc(billData.billNumber)}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 13px; margin: 0; }
      .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #111; padding-bottom:12px; }
      .logo { max-height: 80px; max-width: 200px; }
      .shop-name { font-size: 26px; font-weight: 800; margin: 0 0 4px; }
      .shop-meta { font-size: 12px; color:#444; line-height:1.5; }
      .doc h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: 2px; text-align:right; }
      .doc .meta { text-align:right; font-size:12px; color:#444; line-height:1.6; }
      .wholesale { display:inline-block; border:2px solid #111; padding:4px 10px; font-weight:800; letter-spacing:1px; margin-top:6px; }
      table { width:100%; border-collapse:collapse; margin-top:18px; }
      th { background:#f3f4f6; border:1px solid #d1d5db; padding:9px 8px; font-size:12px; text-align:left; text-transform:uppercase; letter-spacing:.5px; }
      td { border:1px solid #e5e7eb; padding:9px 8px; }
      .sub { font-size:11px; color:#6b7280; }
      .c { text-align:center; } .r { text-align:right; }
      .totals { width:320px; margin-left:auto; margin-top:14px; }
      .totals .kv { display:flex; justify-content:space-between; padding:4px 0; font-size:13px; }
      .grand { border-top:2px solid #111; font-size:18px; font-weight:800; padding-top:8px; }
      .foot { margin-top:28px; text-align:center; color:#555; font-size:12px; border-top:1px solid #ddd; padding-top:12px; }
      @media print { body { margin:0; } * { -webkit-print-color-adjust:exact; } }
    </style>
    </head><body>

    <div class="head">
      <div>
        ${settings.shop_logo ? `<img src="${settings.shop_logo}" class="logo"/><br/>` : ''}
        <div class="shop-name">${esc(settings.shop_name || 'SHOP')}</div>
        <div class="shop-meta">
          ${settings.shop_bio ? esc(settings.shop_bio) + '<br/>' : ''}
          ${settings.shop_address ? esc(settings.shop_address) + '<br/>' : ''}
          ${settings.shop_tel ? 'Tel: ' + esc(settings.shop_tel) : ''}
        </div>
      </div>
      <div class="doc">
        <h1>INVOICE</h1>
        <div class="meta">
          Bill: ${esc(billData.billNumber)}<br/>
          ${new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })}<br/>
          ${customerName ? 'Customer: ' + esc(customerName) : ''}
        </div>
        ${isWholesale ? `<div class="wholesale">WHOLESALE BILL</div>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="c" style="width:40px">#</th>
          <th>Item</th>
          <th class="c" style="width:90px">Qty</th>
          <th class="r" style="width:120px">Unit Price</th>
          <th class="r" style="width:130px">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      ${totalDiscount > 0 ? `<div class="kv"><span>Discount</span><span>${money(totalDiscount)}</span></div>` : ''}
      <div class="kv grand"><span>GRAND TOTAL</span><span>${money(grandTotal)}</span></div>
      ${billDisc && billDisc.percent > 0 ? `
      <div class="kv"><span>Discount (${billDisc.percent}%)</span><span>- ${money(billDisc.amount)}</span></div>
      <div class="kv grand"><span>PAYABLE</span><span>${money(billDisc.payable)}</span></div>` : ''}
      <div class="kv"><span>Cash</span><span>${money(cashPaid)}</span></div>
      <div class="kv"><span>Change</span><span>${money(change)}</span></div>
    </div>

    <div class="foot">${esc(settings.bill_thank_you || 'Thank you!')}</div>

    </body></html>
  `

  const win = window.open('', '_blank', 'width=900,height=800')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  win.onafterprint = () => win.close()
  setTimeout(() => { try { if (!win.closed) win.print() } catch (_) {} }, 400)
}