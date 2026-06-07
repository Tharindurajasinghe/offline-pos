import { useApp } from '../context/AppContext'
import DateTime from '../utils/dateTime'

export default function BillModal({ bill, onClose, onDelete, onReprint }) {
  const { formatCurrency } = useApp()

  if (!bill) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Bill Details — {bill.bill_number}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Bill meta */}
          <div style={styles.meta}>
            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>Bill No:</span>
              <span style={styles.metaValue}>{bill.bill_number}</span>
            </div>
            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>Date:</span>
              <span style={styles.metaValue}>{DateTime.formatDateTime(bill.bill_date)}</span>
            </div>
            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>Customer:</span>
              <span style={styles.metaValue}>{bill.customer_name || '—'}</span>
            </div>
            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>Billed By:</span>
              <span style={styles.metaValue}>{bill.billed_by || '—'}</span>
            </div>
          </div>

          {/* Items table */}
          <div className="table-wrap" style={{ margin: '16px 0' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Variant</th>
                  <th style={{ textAlign: 'center' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Price/Item</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'center' }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {(bill.items || []).map((item, i) => (
                  <tr key={i} style={{ background: item.is_price_edited ? '#fffbeb' : 'transparent' }}>
                    <td>
                      <div style={{ fontWeight: '500' }}>{item.product_name}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>{item.product_code}</div>
                    </td>
                    <td>{item.variant_name}</td>
                    <td style={{ textAlign: 'center' }}>{item.qty} {item.unit}</td>
                    <td style={{ textAlign: 'right', color: item.is_price_edited ? '#d97706' : '#111827' }}>
                      {formatCurrency(item.sold_price)}
                      {item.is_price_edited && (
                        <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                          orig: {formatCurrency(item.original_price)}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: '600' }}>
                      {formatCurrency(item.line_total)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {item.is_price_edited
                        ? <span className="badge badge-orange">✏️ Edited</span>
                        : <span style={{ color: '#9ca3af', fontSize: '11px' }}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div style={styles.totals}>
            {bill.total_discount > 0 && (
              <div style={styles.totalRow}>
                <span>Total Discount:</span>
                <span style={{ color: '#d97706' }}>{formatCurrency(bill.total_discount)}</span>
              </div>
            )}
            <div style={{ ...styles.totalRow, ...styles.grandTotal }}>
              <span>Grand Total:</span>
              <span style={{ color: '#16a34a' }}>{formatCurrency(bill.grand_total)}</span>
            </div>
            <div style={styles.totalRow}>
              <span>Cash Paid:</span>
              <span>{formatCurrency(bill.cash_paid)}</span>
            </div>
            <div style={styles.totalRow}>
              <span>Change:</span>
              <span style={{ color: '#2563eb' }}>{formatCurrency(bill.change_amount)}</span>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-danger btn-sm"
            onClick={() => onDelete(bill.id)}
          >
            🗑️ Delete Bill
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-outline" onClick={onClose}>Close</button>
          <button
            className="btn btn-primary"
            onClick={() => onReprint(bill)}
          >
            🖨️ Reprint Bill
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  meta: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    background: '#f9fafb',
    borderRadius: '8px',
    padding: '14px'
  },
  metaItem: { display: 'flex', gap: '8px', alignItems: 'center' },
  metaLabel: { fontSize: '12px', color: '#6b7280', minWidth: '80px' },
  metaValue: { fontWeight: '500', fontSize: '13px' },
  totals: {
    background: '#f9fafb',
    borderRadius: '8px',
    padding: '14px',
    maxWidth: '320px',
    marginLeft: 'auto'
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: '14px'
  },
  grandTotal: {
    borderTop: '2px solid #e5e7eb',
    borderBottom: '2px solid #e5e7eb',
    padding: '8px 0',
    fontWeight: '700',
    fontSize: '16px',
    margin: '4px 0'
  }
}