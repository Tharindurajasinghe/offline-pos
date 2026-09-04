// src/utils/printBill.js

// ── PRINT CONFIG ──────────────────────────────────────────────────────────────
// Font sizes / logo size kept exactly as before (do not shrink).
const PRINT = {
  paperWidth:  '80mm',
  sidePadding: '1mm',
  feedBottom:   90,
  logoWidth:   200,
  shopName:     25,
  shopInfo:     15,
  tableText:    15,
  bodyText:     14,
  totalsText:   16,
  thankYou:     16,
}

// ── BILL LANGUAGE ── all printed labels in English or Sinhala.
// Chosen in Admin ▸ Bill Settings (settings.bill_language = 'en' | 'si').
const LABELS = {
  en: {
    date: 'Date', billNo: 'Bill No', billedBy: 'Billed By',
    qty: 'Qty', item: 'Item', normal: 'Normal Price', our: 'Our Price', total: 'Total',
    grandTotal: 'Grand Total', discount: 'Discount', payable: 'Payable',
    cash: 'Cash Paid', change: 'Change',
    youSaved: 'You Saved', itemsSold: 'No. of items sold',
    wholesale: '*** WHOLESALE BILL ***', thanks: 'Thank you!'
  },
  si: {
    date: 'දිනය', billNo: 'බිල් අංකය', billedBy: 'අයකැමි',
    qty: 'ප්‍රමාණය', item: 'භාණ්ඩය', normal: 'සා.මිල', our: 'අපේ මිල', total: 'එකතුව',
    grandTotal: 'මුළු එකතුව', discount: 'වට්ටම', payable: 'ගෙවිය යුතු',
    cash: 'ගෙවීම', change: 'ඉතිරි',
    youSaved: 'ඔබට ලැබුණ ලාභය', itemsSold: 'විකුණන ලද භාණ්ඩ ගණන',
    wholesale: '*** තොග බිල ***', thanks: 'ඔබට ස්තූතියි!'
  }
}

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const money = (v) => (parseFloat(v) || 0).toFixed(2)

// Sum of (normal - our) * qty across the cart, floored at 0 (never negative)
// Total customer saving = sum over items of (reference - paid) * qty, plus the
// whole-bill discount. The per-item "reference" is the HIGHER of the normal
// price and the your-price (originalPrice); the customer actually paid soldPrice
// (which already reflects any manual price edit at the till). So this one
// formula captures ALL three savings:
//   • normal price  →  our price      (advertised saving)
//   • manual price edit lower at till (soldPrice < originalPrice)
//   • whole-bill % discount           (billDisc.amount)
function calcSaved(cart, billDisc) {
  let saved = 0
  for (const it of cart) {
    const normal = parseFloat(it.normalPrice) || 0
    const original = parseFloat(it.originalPrice) || 0
    const sold = parseFloat(it.soldPrice) || 0
    const reference = Math.max(normal, original)
    const per = (reference - sold) * it.qty
    if (per > 0) saved += per
  }
  if (billDisc && billDisc.amount > 0) saved += parseFloat(billDisc.amount) || 0
  return saved
}

// number of distinct line items (matches the sample bill's count)
function calcItemCount(cart) {
  return cart.length
}

export async function printBill(billData, cart, customerName, grandTotal, totalDiscount, cashPaid, change, isWholesale = false, size = '80mm', billDisc = null) {
  const r = await window.api.getSettings()
  const settings = r.success ? r.data : {}
  const lang = settings.bill_language === 'si' ? 'si' : 'en'
  if (size === 'A4') {
    printBillA4(billData, settings, cart, customerName, grandTotal, totalDiscount, cashPaid, change, isWholesale, billDisc, lang)
  } else {
    printBill80(billData, settings, cart, customerName, grandTotal, totalDiscount, cashPaid, change, isWholesale, billDisc, lang)
  }
}

// ── 80mm THERMAL ──────────────────────────────────────────────────────────────
function printBill80(billData, settings, cart, customerName, grandTotal, totalDiscount, cashPaid, change, isWholesale, billDisc, lang) {
  const L = LABELS[lang]
  const saved = calcSaved(cart, billDisc)
  const itemCount = calcItemCount(cart)
  const now = new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })
  const hasDisc = billDisc && billDisc.percent > 0

  // ── NORMAL PRICE ── show the Normal column only if at least one item on the
  // bill actually has a normal price set (> 0). Otherwise drop the column
  // entirely so there's no empty gap. Items without one show a blank cell.
  const showNormal = cart.some(it => (parseFloat(it.normalPrice) || 0) > 0)
  const colCount = showNormal ? 4 : 3

  const items = cart.map(item => {
    const normalCell = showNormal
      ? `<td class="r">${(parseFloat(item.normalPrice) || 0) > 0 ? money(item.normalPrice) : ''}</td>`
      : ''
    return `
    <tr class="item-name"><td colspan="${colCount}">${esc(item.productName)}${item.isPriceEdited ? ' *' : ''}<div class="variant">${esc(item.variantName)}</div></td></tr>
    <tr class="item-line">
      <td class="l">${item.qty} ${esc(item.unit)}</td>
      ${normalCell}
      <td class="r">${money(item.soldPrice)}</td>
      <td class="r">${money(item.lineTotal)}</td>
    </tr>
  `}).join('')

  const html = `
    <!DOCTYPE html><html><head>
    <meta charset="utf-8"/>
    <title>Bill ${esc(billData.billNumber)}</title>
    <style>
      @page { size: ${PRINT.paperWidth} auto; margin: 0; }
      html, body { width: 100%; margin: 0; padding: 0; }
      * { box-sizing: border-box; }
      body {
        font-family: monospace;
        padding: 2mm ${PRINT.sidePadding} 0 ${PRINT.sidePadding};
        font-size: ${PRINT.bodyText}px; font-weight: bold; color: #000; line-height: 1.25;
        overflow-x: hidden;
      }
      * { font-weight: bold !important; }
      h2 { text-align: center; font-size: ${PRINT.shopName}px; margin: 4px 0; }
      p  { text-align: center; margin: 2px 0; font-size: ${PRINT.shopInfo}px; }
      .logo { display: block; margin: 0 auto 4px auto; max-width: ${PRINT.logoWidth}px; width: 100%; height: auto; }
      table { width: 100%; max-width: 100%; border-collapse: collapse; table-layout: fixed; }
      td { font-size: ${PRINT.tableText}px; padding: 1px 0; word-wrap: break-word; overflow: hidden; }
      /* 4-column figures line: give the qty column a bit less, prices/total equal.
         The Total column gets the most room so wide values never clip. */
      col.c-qty { width: 19%; } col.c-normal { width: 25%; } col.c-our { width: 26%; } col.c-total { width: 30%; }
      /* 3-column layout (when no item has a normal price) */
      col.c-qty3 { width: 30%; } col.c-our3 { width: 33%; } col.c-total3 { width: 37%; }
      .col-head td { border-bottom: 2px dashed #000; padding-bottom: 3px; font-size: ${PRINT.tableText}px; }
      .item-name td { padding-top: 6px; font-size: ${PRINT.tableText}px; }
      .variant { font-size: ${PRINT.tableText - 4}px; }
      /* figures row: smaller so Qty | Normal | Our | Total all fit on 80mm */
      .item-line td { padding-bottom: 4px; font-size: ${PRINT.tableText - 1}px; letter-spacing: -0.3px; }
      .l { text-align: left; } .c { text-align: center; } .r { text-align: right; }
      .info { text-align: left !important; font-size: ${PRINT.shopInfo}px; }
      .kv { display: flex; justify-content: space-between; font-size: ${PRINT.totalsText}px; padding: 2px 0; }
      .kv.big { font-size: ${PRINT.totalsText + 4}px; border-top: 3px solid #000; border-bottom: 3px solid #000; padding: 6px 0; }
      .saved { text-align: center; font-size: ${PRINT.totalsText}px; border: 3px solid #000; padding: 6px; margin: 8px 0; }
      hr { border: none; border-top: 3px dashed #000; margin: 6px 0; }
      .ws-label { text-align: center; font-size: ${PRINT.shopInfo + 2}px; border: 3px solid #000; padding: 5px; margin: 8px 0; letter-spacing: 1px; }
      .thanks { text-align: center; font-size: ${PRINT.thankYou}px; margin-top: 10px; }
      .powered { text-align: center; font-size: ${PRINT.shopInfo - 4}px; margin-top: 6px; }
      .count { text-align: left; font-size: ${PRINT.shopInfo}px; margin-top: 8px; }
      .feed { height: ${PRINT.feedBottom}px; }
      @media print { body { margin: 0; } * { -webkit-print-color-adjust: exact; color: #000; } }
    </style></head><body>

    ${settings.shop_logo ? `<img src="${settings.shop_logo}" class="logo"/>` : ''}
    <h2>${esc(settings.shop_name || 'SHOP')}</h2>
    ${settings.shop_bio ? `<p>${esc(settings.shop_bio)}</p>` : ''}
    ${settings.shop_address ? `<p>${esc(settings.shop_address)}</p>` : ''}
    ${settings.shop_tel ? `<p>${esc(settings.shop_tel)}</p>` : ''}

    <hr/>
    <p class="info">${L.date}: ${now}</p>
    <p class="info">${L.billNo}: ${esc(billData.billNumber)}</p>
    ${billData.billedBy ? `<p class="info">${L.billedBy}: ${esc(billData.billedBy)}</p>` : ''}
    ${customerName ? `<p class="info">${esc(customerName)}</p>` : ''}
    ${isWholesale ? `<div class="ws-label">${L.wholesale}</div>` : ''}
    <hr/>

    <table>
      ${showNormal
        ? '<colgroup><col class="c-qty"/><col class="c-normal"/><col class="c-our"/><col class="c-total"/></colgroup>'
        : '<colgroup><col class="c-qty3"/><col class="c-our3"/><col class="c-total3"/></colgroup>'}
      <tbody>
        <tr class="col-head">
          <td class="l">${L.qty}</td>
          ${showNormal ? `<td class="r">${L.normal}</td>` : ''}
          <td class="r">${L.our}</td>
          <td class="r">${L.total}</td>
        </tr>
        ${items}
      </tbody>
    </table>
    <hr/>

    <div class="kv big"><span>${L.grandTotal}</span><span>Rs. ${money(grandTotal)}</span></div>
    ${hasDisc ? `
    <div class="kv"><span>${L.discount} (${billDisc.percent}%)</span><span>- ${money(billDisc.amount)}</span></div>
    <div class="kv big"><span>${L.payable}</span><span>Rs. ${money(billDisc.payable)}</span></div>` : ''}
    <div class="kv"><span>${L.cash}</span><span>Rs. ${money(cashPaid)}</span></div>
    <div class="kv"><span>${L.change}</span><span>Rs. ${money(change)}</span></div>

    ${saved > 0 ? `<div class="saved">${L.youSaved}<br/>Rs. ${money(saved)}</div>` : ''}

    <div class="count">${L.itemsSold} : ${itemCount}</div>

    <div class="thanks">${esc(settings.bill_thank_you || L.thanks)}</div>
    <div class="powered">Powered by TAR Solutions</div>
    <div class="feed">&nbsp;</div>
    </body></html>
  `

  openAndPrint(html, 'width=420,height=700')
}

// ── A4 ────────────────────────────────────────────────────────────────────────
function printBillA4(billData, settings, cart, customerName, grandTotal, totalDiscount, cashPaid, change, isWholesale, billDisc, lang) {
  const L = LABELS[lang]
  const saved = calcSaved(cart, billDisc)
  const itemCount = calcItemCount(cart)
  const now = new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })
  const hasDisc = billDisc && billDisc.percent > 0

  // ── NORMAL PRICE ── show the Normal column only if any item has one (> 0)
  const showNormal = cart.some(it => (parseFloat(it.normalPrice) || 0) > 0)

  const rows = cart.map((item) => `
    <tr>
      <td class="c">${item.qty} ${esc(item.unit)}</td>
      <td>${esc(item.productName)}<div class="sub">${esc(item.variantName)}</div></td>
      ${showNormal ? `<td class="r">${(parseFloat(item.normalPrice) || 0) > 0 ? money(item.normalPrice) : ''}</td>` : ''}
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
      .head { text-align: center; border-bottom: 3px solid #111; padding-bottom: 12px; }
      .logo { max-height: 90px; margin-bottom: 6px; }
      .shop-name { font-size: 26px; font-weight: 800; margin: 0 0 4px; }
      .shop-meta { font-size: 12px; color: #444; line-height: 1.5; }
      .meta { margin: 14px 0; font-size: 13px; line-height: 1.7; }
      .wholesale { display:inline-block; border:2px solid #111; padding:4px 10px; font-weight:800; letter-spacing:1px; margin-top:6px; }
      table { width:100%; border-collapse:collapse; margin-top:12px; }
      th { background:#f3f4f6; border:1px solid #d1d5db; padding:9px 8px; font-size:12px; text-align:left; }
      td { border:1px solid #e5e7eb; padding:9px 8px; }
      .sub { font-size:11px; color:#6b7280; }
      .c { text-align:center; } .r { text-align:right; }
      .totals { width:340px; margin-left:auto; margin-top:14px; }
      .totals .kv { display:flex; justify-content:space-between; padding:4px 0; font-size:13px; }
      .totals .grand { border-top:2px solid #111; font-size:18px; font-weight:800; padding-top:8px; }
      .saved { margin-top:14px; text-align:center; border:2px solid #111; padding:10px; font-size:16px; font-weight:800; }
      .count { margin-top:12px; font-size:13px; }
      .foot { margin-top:24px; text-align:center; color:#555; font-size:13px; border-top:1px solid #ddd; padding-top:12px; }
      @media print { * { -webkit-print-color-adjust: exact; } }
    </style></head><body>

    <div class="head">
      ${settings.shop_logo ? `<img src="${settings.shop_logo}" class="logo"/><br/>` : ''}
      <div class="shop-name">${esc(settings.shop_name || 'SHOP')}</div>
      <div class="shop-meta">
        ${settings.shop_bio ? esc(settings.shop_bio) + '<br/>' : ''}
        ${settings.shop_address ? esc(settings.shop_address) + '<br/>' : ''}
        ${settings.shop_tel ? esc(settings.shop_tel) : ''}
      </div>
      ${isWholesale ? `<div class="wholesale">${L.wholesale}</div>` : ''}
    </div>

    <div class="meta">
      ${L.date}: ${now}<br/>
      ${L.billNo}: ${esc(billData.billNumber)}<br/>
      ${billData.billedBy ? `${L.billedBy}: ${esc(billData.billedBy)}<br/>` : ''}
      ${customerName ? esc(customerName) : ''}
    </div>

    <table>
      <thead>
        <tr>
          <th class="c" style="width:80px">${L.qty}</th>
          <th>${L.item}</th>
          ${showNormal ? `<th class="r" style="width:100px">${L.normal}</th>` : ''}
          <th class="r" style="width:100px">${L.our}</th>
          <th class="r" style="width:110px">${L.total}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="kv grand"><span>${L.grandTotal}</span><span>Rs. ${money(grandTotal)}</span></div>
      ${hasDisc ? `
      <div class="kv"><span>${L.discount} (${billDisc.percent}%)</span><span>- Rs. ${money(billDisc.amount)}</span></div>
      <div class="kv grand"><span>${L.payable}</span><span>Rs. ${money(billDisc.payable)}</span></div>` : ''}
      <div class="kv"><span>${L.cash}</span><span>Rs. ${money(cashPaid)}</span></div>
      <div class="kv"><span>${L.change}</span><span>Rs. ${money(change)}</span></div>
    </div>

    ${saved > 0 ? `<div class="saved">${L.youSaved}: Rs. ${money(saved)}</div>` : ''}
    <div class="count">${L.itemsSold} : ${itemCount}</div>

    <div class="foot">${esc(settings.bill_thank_you || L.thanks)}<br/><span style="font-size:11px;color:#888">Powered by TAR Solutions</span></div>
    </body></html>
  `

  openAndPrint(html, 'width=900,height=800')
}

function openAndPrint(html, features) {
  const win = window.open('', '_blank', features)
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  win.onafterprint = () => win.close()
  setTimeout(() => { try { if (!win.closed) win.print() } catch (_) {} }, 400)
}