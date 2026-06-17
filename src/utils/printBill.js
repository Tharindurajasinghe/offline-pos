// src/utils/printBill.js

export async function printBill(billData, cart, customerName, grandTotal, totalDiscount, cashPaid, change) {
  const r = await window.api.getSettings()
  if (r.success) {
    printBillHTML(billData, r.data, cart, customerName, grandTotal, totalDiscount, cashPaid, change)
  }
}

function printBillHTML(billData, settings, cart, customerName, grandTotal, totalDiscount, cashPaid, change) {
  const items = cart.map(item => `
    <tr>
      <td>${item.productName}<br/><small>${item.variantName}</small></td>
      <td style="text-align:center">${item.qty} ${item.unit}</td>
      <td style="text-align:right">Rs.${item.soldPrice.toFixed(2)}</td>
      <td style="text-align:right">Rs.${item.lineTotal.toFixed(2)}</td>
      ${item.isPriceEdited ? '<td style="color:orange;font-size:10px">✏️</td>' : '<td></td>'}
    </tr>
  `).join('')

  const html = `
    <!DOCTYPE html><html><head>
    <title>Bill ${billData.billNumber}</title>
    <style>

      body { font-family: monospace; width: 80mm; margin: 0 auto; font-size: 18px; }
      h2 { text-align: center; font-size: 22px; }
      p { text-align: center; margin: 2px 0; font-size: 16px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 5px 4px; font-size: 16px; }
      th { border-bottom: 1px dashed #000; }
      .total { border-top: 1px dashed #000; font-weight: bold; }
      .center { text-align: center; }
      .right { text-align: right; }
      @media print { body { margin: 0; } }

    </style>
    </head><body>
    ${settings.shop_logo ? `<img src="${settings.shop_logo}" style="display:block;margin:0 auto;max-width:180px;"/>` : ''}
    <h2>${settings.shop_name || 'DEMO'}</h2>
    ${settings.shop_bio ? `<p>${settings.shop_bio}</p>` : ''}
    <p>${settings.shop_address || ''}</p>
    <p>${settings.shop_tel ? 'Tel: ' + settings.shop_tel : ''}</p>
    <p>Bill: ${billData.billNumber} | ${new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })}</p>
    ${customerName ? `<p>Customer: ${customerName}</p>` : ''}
    <hr/>
    <table>
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th><th></th></tr></thead>
      <tbody>${items}</tbody>
    </table>
    <hr/>
    <table>
      ${totalDiscount > 0 ? `<tr><td>Discount:</td><td class="right">Rs.${totalDiscount.toFixed(2)}</td></tr>` : ''}
      <tr class="total"><td>TOTAL:</td><td class="right">Rs.${grandTotal.toFixed(2)}</td></tr>
      <tr><td>Cash:</td><td class="right">Rs.${cashPaid.toFixed(2)}</td></tr>
      <tr><td>Change:</td><td class="right">Rs.${change.toFixed(2)}</td></tr>
    </table>
    <hr/>
    <p class="center">${settings.bill_thank_you || 'Thank you!'}</p>
    </body></html>
  `

  const win = window.open('', '_blank', 'width=400,height=600')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 500)
}