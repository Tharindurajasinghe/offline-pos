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

export async function printBill(billData, cart, customerName, grandTotal, totalDiscount, cashPaid, change, isWholesale = false) {
  const r = await window.api.getSettings()
  if (r.success) {
    printBillHTML(billData, r.data, cart, customerName, grandTotal, totalDiscount, cashPaid, change, isWholesale)
  }
}

function printBillHTML(billData, settings, cart, customerName, grandTotal, totalDiscount, cashPaid, change, isWholesale) {
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