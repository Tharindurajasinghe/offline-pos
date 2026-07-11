import { useState, useRef, useEffect } from 'react'
import DateTime from '../utils/dateTime'
import { useApp } from '../context/AppContext'

export default function Invoice() {
  const { formatCurrency } = useApp()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editInvoice, setEditInvoice] = useState(null)
  const [viewInvoice, setViewInvoice] = useState(null)

  useEffect(() => { loadInvoices() }, [])

  useEffect(() => {
    const t = setTimeout(loadInvoices, 300)
    return () => clearTimeout(t)
  }, [search, filterDate])

  const loadInvoices = async () => {
    setLoading(true)
    const result = await window.api.getAllInvoices({
      search: search.trim() || undefined,
      date: filterDate || undefined
    })
    if (result.success) setInvoices(result.data)
    setLoading(false)
  }

  const handleRemove = async (id) => {
    if (!window.confirm('Remove this invoice?')) return
    const result = await window.api.removeInvoice(id)
    if (result.success) loadInvoices()
    else alert(result.message)
  }

  const handleView = async (id) => {
    const result = await window.api.getInvoiceById(id)
    if (result.success) setViewInvoice(result.data)
  }

  const handleEdit = async (id) => {
    const result = await window.api.getInvoiceById(id)
    if (result.success) { setEditInvoice(result.data); setShowModal(true) }
  }

  return (
    <div className="page-content">
      <div className="card card-body">

        {/* Header */}
        <div className="flex-between" style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700' }}>🧾 Invoices</h1>
          <button className="btn btn-primary" onClick={() => { setEditInvoice(null); setShowModal(true) }}>
            + Add Invoice
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label className="form-label">Search</label>
            <input
              className="input"
              placeholder="Search by invoice no or company name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">📅 Filter by Date</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                className="input"
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                style={{ maxWidth: '170px' }}
              />
              {filterDate && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setFilterDate('')}
                >✕ Clear</button>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? <div className="spinner" /> : (
          invoices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🧾</div>
              <p>No invoices found</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Invoice Date</th>
                    <th>Company Name</th>
                    <th>Invoice No</th>
                    <th>Cheque No</th>
                    <th>Cheque Date</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{DateTime.formatDate(inv.invoice_date)}</td>
                      <td>{inv.company_name || '—'}</td>
                      <td style={{ fontWeight: '700' }}>{inv.invoice_number}</td>
                      <td>{inv.cheque_no || '—'}</td>
                      <td>{inv.cheque_date ? DateTime.formatDate(inv.cheque_date) : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: '600', color: '#16a34a' }}>
                        {formatCurrency(inv.total_amount)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="link-btn link-btn-blue" onClick={() => handleView(inv.id)}>View</button>
                          <button className="link-btn link-btn-blue" onClick={() => handleEdit(inv.id)}>Edit</button>
                          <button className="link-btn link-btn-red" onClick={() => handleRemove(inv.id)}>Remove</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <InvoiceFormModal
          invoice={editInvoice}
          onClose={() => { setShowModal(false); setEditInvoice(null) }}
          onSave={async (data) => {
            const result = editInvoice
              ? await window.api.updateInvoice({ id: editInvoice.id, ...data })
              : await window.api.addInvoice(data)
            if (result.success) { loadInvoices(); setShowModal(false); setEditInvoice(null) }
            return result
          }}
        />
      )}

      {/* View Modal */}
      {viewInvoice && (
        <InvoiceViewModal
          invoice={viewInvoice}
          formatCurrency={formatCurrency}
          onClose={() => setViewInvoice(null)}
        />
      )}
    </div>
  )
}

// ─── Invoice Form Modal ───────────────────────────────────────────────────────
function InvoiceFormModal({ invoice, onClose, onSave }) {
  const isEdit = !!invoice
  const [invoiceNumber, setInvoiceNumber] = useState(invoice?.invoice_number || '')
  const [companyName, setCompanyName] = useState(invoice?.company_name || '')
  const [invoiceDate, setInvoiceDate] = useState(invoice?.invoice_date || new Date().toISOString().slice(0, 10))
  const [chequeNo, setChequeNo] = useState(invoice?.cheque_no || '')
  const [chequeDate, setChequeDate] = useState(invoice?.cheque_date || '')
  const [items, setItems] = useState(invoice?.items?.length > 0 ? invoice.items : [{ product_name: '', amount: '' }])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // refs for focus navigation
  const invoiceDateRef = useRef(null)
  const invoiceNumberRef = useRef(null)
  const companyNameRef = useRef(null)
  const chequeNoRef = useRef(null)
  const chequeDateRef = useRef(null)
  const itemRefs = useRef([])

  const focusNext = (ref) => ref?.current?.focus()

  const addItem = () => setItems(prev => [...prev, { product_name: '', amount: '' }])

  const removeItem = (i) => {
    if (items.length === 1) return
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  const updateItem = (i, field, value) => {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  const totalAmount = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)

  const handleSave = async () => {
    setError('')
    if (!invoiceNumber.trim()) { setError('Invoice number is required'); return }
    if (!invoiceDate) { setError('Invoice date is required'); return }
    const validItems = items.filter(i => i.product_name.trim() && i.amount)
    if (validItems.length === 0) { setError('Add at least one product with name and amount'); return }
    setSaving(true)
    const result = await onSave({
      invoiceNumber: invoiceNumber.trim(),
      companyName: companyName.trim(),
      invoiceDate,
      chequeNo: chequeNo.trim(),
      chequeDate,
      items: validItems
    })
    setSaving(false)
    if (!result.success) setError(result.message)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h2>{isEdit ? '✏️ Edit Invoice' : '+ Add Invoice'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {/* Invoice details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Invoice Date <span className="required">*</span></label>
              <input 
              ref={invoiceDateRef}
              className="input" 
              type="date" 
              value={invoiceDate} 
              onChange={e => setInvoiceDate(e.target.value)} 
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); focusNext(invoiceNumberRef) } }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Invoice Number <span className="required">*</span></label>
              <input 
              ref={invoiceNumberRef}
              className="input" 
              value={invoiceNumber} 
              onChange={e => setInvoiceNumber(e.target.value)} 
              placeholder="e.g. INV-001" autoFocus 
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); focusNext(companyNameRef) } }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Company Name</label>
              <input 
              ref={companyNameRef}
              className="input" 
              value={companyName} 
              onChange={e => setCompanyName(e.target.value)} 
              placeholder="Optional" 
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); focusNext(chequeNoRef) } }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Cheque No</label>
              <input 
              ref={chequeNoRef}
              className="input" 
              value={chequeNo} 
              onChange={e => setChequeNo(e.target.value)} 
              placeholder="Optional" 
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); focusNext(chequeDateRef) } }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Cheque Date</label>
              <input 
              ref={chequeDateRef}
              className="input" 
              type="date" 
              value={chequeDate} 
              onChange={e => setChequeDate(e.target.value)} 
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); itemRefs.current[0]?.focus() } }}
              />
            </div>
          </div>

          {/* Products */}
          <div style={{ marginTop: '8px' }}>
            <div className="flex-between" style={{ marginBottom: '8px' }}>
              <label className="form-label" style={{ margin: 0 }}>Products <span className="required">*</span></label>
              <button className="btn btn-outline btn-sm" onClick={addItem}>+ Add Product</button>
            </div>

            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 32px', gap: '8px', marginBottom: '4px', padding: '0 4px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280' }}>PRODUCT NAME</span>
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280' }}>AMOUNT (RS.)</span>
              <span></span>
            </div>

            {items.map((item, i) => (
  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 32px', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
    <input
      className="input"
      placeholder="Product name"
      value={item.product_name}
      ref={el => { if (!itemRefs.current[i]) itemRefs.current[i] = {}; itemRefs.current[i].name = el }}
      onChange={e => updateItem(i, 'product_name', e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          itemRefs.current[i]?.amount?.focus()
        }
      }}
    />
    <input
      className="input"
      type="number"
      step="0.01"
      min="0"
      placeholder="0.00"
      value={item.amount}
      ref={el => { if (!itemRefs.current[i]) itemRefs.current[i] = {}; itemRefs.current[i].amount = el }}
      onChange={e => updateItem(i, 'amount', e.target.value)}
      style={{ textAlign: 'right' }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          // Move to next row name, or save if last row
          if (itemRefs.current[i + 1]?.name) {
            itemRefs.current[i + 1].name.focus()
          } else {
            handleSave()
          }
        }
      }}
    />
    <button
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '16px' }}
      onClick={() => removeItem(i)}
      disabled={items.length === 1}
    >✕</button>
  </div>
))}
            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e5e7eb' }}>
              <span style={{ fontWeight: '700', fontSize: '15px' }}>
                Total: Rs. {totalAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {error && <div className="alert alert-error" style={{ marginTop: '12px' }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Update Invoice' : 'Add Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Invoice View Modal ───────────────────────────────────────────────────────
function InvoiceViewModal({ invoice, formatCurrency, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h2>🧾 Invoice Details</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Invoice Number</div>
              <div style={{ fontWeight: '700', fontSize: '15px' }}>{invoice.invoice_number}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Invoice Date</div>
              <div style={{ fontWeight: '600' }}>{DateTime.formatDate(invoice.invoice_date)}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Company Name</div>
              <div>{invoice.company_name || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Cheque No</div>
              <div>{invoice.cheque_no || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Cheque Date</div>
              <div>{invoice.cheque_date ? DateTime.formatDate(invoice.cheque_date) : '—'}</div>
            </div>
          </div>

          {/* Items */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>Products</h4>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.items || []).map((item, i) => (
                  <tr key={i}>
                    <td>{item.product_name}</td>
                    <td style={{ textAlign: 'right', fontWeight: '600' }}>{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px', fontWeight: '700', fontSize: '15px', color: '#16a34a' }}>
              Total: {formatCurrency(invoice.total_amount)}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}