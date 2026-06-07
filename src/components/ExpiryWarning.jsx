import { useApp } from '../context/AppContext'
import DateTime from '../utils/dateTime'

export default function ExpiryWarning() {
  const { expiryWarnings } = useApp()

  if (expiryWarnings.length === 0) return null

  return (
    <div className="card" style={{ padding: '16px' }}>
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <h3 style={styles.title}>Expiry Warning</h3>
        </div>
        <span className="badge badge-red">{expiryWarnings.length} items</span>
      </div>

      <div style={styles.tableWrap}>
        <table className="table">
          <thead>
            <tr>
              <th>Product ID</th>
              <th>Category</th>
              <th>Product Name</th>
              <th>Expire Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {expiryWarnings.map((item, i) => (
              <tr key={i} style={{
                background: item.status === 'EXPIRED' ? '#fef2f2' : '#fffbeb'
              }}>
                <td style={{ fontWeight: '700' }}>{item.product_code}</td>
                <td><span className="badge badge-blue">{item.category_name}</span></td>
                <td>{item.product_name} · {item.variant_name}</td>
                <td>{DateTime.formatDate(item.expire_date)}</td>
                <td>
                  {item.status === 'EXPIRED' ? (
                    <span className="badge badge-red">EXPIRED</span>
                  ) : (
                    <span className="badge badge-orange">EXPIRING SOON</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const styles = {
  header:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  titleRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  title:    { fontSize: '16px', fontWeight: '700', color: '#dc2626' },
  tableWrap:{ maxHeight: '220px', overflowY: 'auto' }
}