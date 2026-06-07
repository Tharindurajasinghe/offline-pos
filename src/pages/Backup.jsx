export default function Backup() {

  const handleBackup = async () => {
    const result = await window.api.backupDatabase()
    if (result.success) {
      alert(`Backup saved to:\n${result.path}`)
    } else {
      alert('Backup failed: ' + result.message)
    }
  }

  const handleRestore = async () => {
    if (!window.confirm('Restore database? Current data will be replaced. App will need restart.')) return
    const result = await window.api.restoreDatabase()
    if (result.success) {
      alert('Restore successful. App will restart.')
    } else {
      alert('Restore failed: ' + result.message)
    }
  }

  return (
    <div className="page-content">
      <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '24px' }}>💾 Backup & Restore</h2>

      <div style={styles.backupCard}>
        <div style={styles.backupIcon}>💾</div>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>Backup Database</h3>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
            Save a copy of all your data to a safe location.
          </p>
          <button className="btn btn-primary" onClick={handleBackup}>
            💾 Backup Now
          </button>
        </div>
      </div>

      <div style={{ ...styles.backupCard, marginTop: '16px', background: '#fef2f2', border: '1px solid #fca5a5' }}>
        <div style={styles.backupIcon}>📂</div>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>Restore Database</h3>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
            Restore from a previous backup file.
          </p>
          <p style={{ fontSize: '12px', color: '#dc2626', marginBottom: '12px' }}>
            ⚠️ This will replace ALL current data with the backup file. App will restart.
          </p>
          <button className="btn btn-danger" onClick={handleRestore}>
            📂 Restore from Backup
          </button>
        </div>
      </div>

    </div>
  )
}

const styles = {
  backupCard: {
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    gap: '20px',
    alignItems: 'flex-start',
    maxWidth: '520px'
  },
  backupIcon: { fontSize: '32px' }
}