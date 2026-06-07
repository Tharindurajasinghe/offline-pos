import { useState } from 'react'
import { useApp } from '../context/AppContext'

export default function Cart({ cart, onRemove, onUpdateQty, onUpdatePrice }) {
  const { formatCurrency } = useApp()
  const [editingPriceId, setEditingPriceId] = useState(null)
  const [tempPrice, setTempPrice] = useState('')

  if (cart.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={{ fontSize: '32px' }}>🛒</span>
        <p style={{ color: '#9ca3af', marginTop: '8px' }}>No items in cart</p>
      </div>
    )
  }

  const handlePriceEdit = (item) => {
    setEditingPriceId(item.cartId)
    setTempPrice(String(item.soldPrice))
  }

  const handlePriceSave = (cartId) => {
    const price = parseFloat(tempPrice)
    if (!isNaN(price) && price > 0) {
      onUpdatePrice(cartId, price)
    }
    setEditingPriceId(null)
  }

  return (
    <div style={styles.cartWrap}>
      <table style={styles.table}>
        <thead>
          <tr style={styles.thead}>
            <th style={styles.th}>Item</th>
            <th style={{ ...styles.th, textAlign: 'center' }}>Qty</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Price</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Total</th>
            <th style={styles.th}></th>
          </tr>
        </thead>
        <tbody>
          {cart.map(item => (
            <tr key={item.cartId} style={styles.row}>
              {/* Item name */}
              <td style={styles.td}>
                <div style={styles.itemName}>{item.productName}</div>
                <div style={styles.itemVariant}>
                  {item.productCode} · {item.variantName}
                  {item.isPriceEdited && (
                    <span style={styles.editedMark}>✏️ disc</span>
                  )}
                </div>
              </td>

              {/* Qty */}
              <td style={{ ...styles.td, textAlign: 'center' }}>
                <div style={styles.qtyControls}>
                  <button
                    style={styles.qtyBtn}
                    onClick={() => onUpdateQty(item.cartId, item.qty - 1)}
                  >−</button>
                  <span style={styles.qtyValue}>{item.qty}</span>
                  <button
                    style={styles.qtyBtn}
                    onClick={() => onUpdateQty(item.cartId, item.qty + 1)}
                  >+</button>
                </div>
              </td>

              {/* Price */}
              <td style={{ ...styles.td, textAlign: 'right' }}>
                {editingPriceId === item.cartId ? (
                  <input
                    type="number"
                    step="0.01"
                    value={tempPrice}
                    onChange={e => setTempPrice(e.target.value)}
                    onBlur={() => handlePriceSave(item.cartId)}
                    onKeyDown={e => e.key === 'Enter' && handlePriceSave(item.cartId)}
                    style={styles.priceInput}
                    autoFocus
                  />
                ) : (
                  <span
                    style={{
                      ...styles.priceText,
                      color: item.isPriceEdited ? '#d97706' : '#111827'
                    }}
                    onClick={() => handlePriceEdit(item)}
                    title="Click to edit price"
                  >
                    Rs.{item.soldPrice.toFixed(2)}
                  </span>
                )}
              </td>

              {/* Total */}
              <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600', color: '#16a34a' }}>
                Rs.{item.lineTotal.toFixed(2)}
              </td>

              {/* Remove */}
              <td style={styles.td}>
                <button
                  style={styles.removeBtn}
                  onClick={() => onRemove(item.cartId)}
                  title="Remove item"
                >✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const styles = {
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    color: '#9ca3af'
  },
  cartWrap: {
    flex: 1,
    overflowY: 'auto',
    marginBottom: '12px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px'
  },
  table:  { width: '100%', borderCollapse: 'collapse' },
  thead:  { background: '#f9fafb', position: 'sticky', top: 0 },
  th: {
    padding: '8px 10px',
    fontSize: '11px',
    fontWeight: '600',
    color: '#6b7280',
    borderBottom: '1px solid #e5e7eb',
    textTransform: 'uppercase'
  },
  row: { borderBottom: '1px solid #f3f4f6' },
  td:  { padding: '8px 10px', verticalAlign: 'middle', fontSize: '13px' },
  itemName:    { fontWeight: '500', color: '#111827' },
  itemVariant: { fontSize: '11px', color: '#6b7280', marginTop: '2px', display: 'flex', gap: '6px', alignItems: 'center' },
  editedMark:  { fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: '99px' },
  qtyControls: { display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' },
  qtyBtn: {
    width: '22px', height: '22px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    background: '#f9fafb',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1
  },
  qtyValue:   { minWidth: '24px', textAlign: 'center', fontWeight: '600' },
  priceInput: {
    width: '80px', padding: '3px 6px',
    border: '1px solid #16a34a',
    borderRadius: '4px', fontSize: '13px',
    textAlign: 'right'
  },
  priceText:  { cursor: 'pointer', textDecoration: 'underline dotted' },
  removeBtn: {
    background: 'none', border: 'none',
    color: '#dc2626', cursor: 'pointer',
    fontSize: '14px', padding: '2px 4px',
    borderRadius: '4px'
  }
}