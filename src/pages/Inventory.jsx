import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import DateTime from '../utils/dateTime'
import Validator from '../utils/validator'

// ── STOCK DISPLAY ──
// Fractional-unit stock (kg, g, m, etc.) can accumulate floating-point noise
// from repeated billing/adjustment math, e.g. 6.0001245 instead of 6. This
// rounds to at most 3 decimal places for DISPLAY only — trimming trailing
// zeros so a whole number still shows as "6", not "6.000" — and never touches
// the stored/edited value, only what's rendered.
function formatQty(val) {
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return parseFloat(n.toFixed(3)).toString()
}

// ─── Expiry Dates Modal ───────────────────────────────────────────────────────
// Works entirely on LOCAL state (the `dates` array passed in and given back via
// onChange) — no DB calls here. This is what lets it work for a brand-new,
// not-yet-saved variant as well as an existing one: expiry dates are just part
// of the variant's form data and get written to the database together with
// everything else when the product form is saved (add or update), the same way
// stock/prices already work.
function ExpiryModal({ variantName, dates, onChange, onClose }) {
  const [newDate, setNewDate] = useState('')
  const [editingIdx, setEditingIdx] = useState(null)
  const [editDate, setEditDate] = useState('')
  const [error, setError] = useState('')

  const dateStr = (d) => (typeof d === 'string' ? d : d.expireDate)

  const handleAdd = () => {
    setError('')
    if (!newDate) { setError('Please select a date'); return }
    onChange([...(dates || []), { expireDate: newDate }])
    setNewDate('')
  }

  const startEdit = (idx) => { setEditingIdx(idx); setEditDate(dateStr(dates[idx])) }

  const handleUpdate = (idx) => {
    if (!editDate) return
    const next = dates.map((d, i) => i === idx ? { ...(typeof d === 'object' ? d : {}), expireDate: editDate } : d)
    onChange(next)
    setEditingIdx(null)
  }

  const handleRemove = (idx) => {
    if (!window.confirm('Remove this expiry date?')) return
    onChange(dates.filter((_, i) => i !== idx))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📅 Expiry Dates — {variantName || 'New Variant'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Add new */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input
              type="date"
              className="input"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleAdd}>+ Add</button>
          </div>
          {error && <div className="alert alert-error">{error}</div>}

          {/* List */}
          {(!dates || dates.length === 0) ? (
            <p style={{ color: '#9ca3af', textAlign: 'center' }}>No expiry dates added</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Expire Date</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {dates.map((d, idx) => {
                  const status = DateTime.getExpiryStatus(dateStr(d))
                  return (
                    <tr key={idx}>
                      <td>
                        {editingIdx === idx ? (
                          <input
                            type="date"
                            className="input"
                            value={editDate}
                            onChange={e => setEditDate(e.target.value)}
                            style={{ padding: '4px 8px' }}
                          />
                        ) : (
                          DateTime.formatDate(dateStr(d))
                        )}
                      </td>
                      <td>
                        {status === 'EXPIRED'
                          ? <span className="badge badge-red">Expired</span>
                          : status === 'EXPIRING_SOON'
                            ? <span className="badge badge-orange">Expiring Soon</span>
                            : <span className="badge badge-green">OK</span>
                        }
                      </td>
                      <td>
                        {editingIdx === idx ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="btn btn-primary btn-sm" onClick={() => handleUpdate(idx)}>Save</button>
                            <button className="btn btn-outline btn-sm" onClick={() => setEditingIdx(null)}>Cancel</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="link-btn link-btn-blue" onClick={() => startEdit(idx)}>Edit</button>
                            <button className="link-btn link-btn-red" onClick={() => handleRemove(idx)}>Remove</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ─── Category Modal ───────────────────────────────────────────────────────────
function CategoryModal({ onClose, onRefresh }) {
  const [categories, setCategories] = useState([])
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { loadCategories() }, [])

  const loadCategories = async () => {
    const result = await window.api.getCategories()
    if (result.success) setCategories(result.data)
  }

  const handleAdd = async () => {
    setError('')
    const v = Validator.validateCategory({ name: newName })
    if (!v.valid) { setError(v.errors[0]); return }
    const result = await window.api.addCategory({ name: newName.trim() })
    if (result.success) { setNewName(''); loadCategories(); onRefresh() }
    else setError(result.message)
  }

  const handleUpdate = async (id) => {
    setError('')
    const v = Validator.validateCategory({ name: editName })
    if (!v.valid) { setError(v.errors[0]); return }
    const result = await window.api.updateCategory({ id, name: editName.trim() })
    if (result.success) { setEditingId(null); loadCategories(); onRefresh() }
    else setError(result.message)
  }

  const handleRemove = async (id) => {
    if (!window.confirm('Remove this category? Products in this category will be affected.')) return
    const result = await window.api.removeCategory(id)
    if (result.success) { loadCategories(); onRefresh() }
    else alert(result.message)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📁 Add / Remove Category</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input
              className="input"
              placeholder="New category name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button className="btn btn-primary" onClick={handleAdd}>Add</button>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <table className="table">
            <thead><tr><th>Category Name</th><th>Actions</th></tr></thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id}>
                  <td>
                    {editingId === c.id ? (
                      <input
                        className="input"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleUpdate(c.id)}
                        style={{ padding: '4px 8px' }}
                        autoFocus
                      />
                    ) : c.name}
                  </td>
                  <td>
                    {editingId === c.id ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => handleUpdate(c.id)}>Save</button>
                        <button className="btn btn-outline btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="link-btn link-btn-blue" onClick={() => { setEditingId(c.id); setEditName(c.name) }}>Edit</button>
                        <button className="link-btn link-btn-red" onClick={() => handleRemove(c.id)}>Remove</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ─── Stock Adjust Modal ───────────────────────────────────────────────────────
function StockModal({ variant, onClose, onRefresh }) {
  const [adjustment, setAdjustment] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const { user } = useAuth()

  const handleAdjust = async () => {
    setError('')
    const adj = parseFloat(adjustment)
    if (isNaN(adj) || adj === 0) { setError('Enter a valid adjustment value'); return }
    const result = await window.api.adjustStock({
      variantId: variant.variant_id,
      adjustment: adj,
      reason: reason.trim(),
      adjustedBy: user?.username
    })
    if (result.success) {
      alert(`Stock updated. New stock: ${result.newStock}`)
      onRefresh()
      onClose()
    } else setError(result.message)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📦 Adjust Stock — {variant.variant_name}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '12px', color: '#6b7280' }}>
            Current stock: <strong>{formatQty(variant.stock)}</strong> {variant.unit}
          </p>
          <div className="form-group">
            <label className="form-label">Adjustment (use negative to reduce)</label>
            <input
              className="input"
              type="number"
              placeholder="e.g. 50 or -10"
              value={adjustment}
              onChange={e => setAdjustment(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <input
              className="input"
              placeholder="e.g. Restocked, Damaged, etc."
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAdjust}>Apply Adjustment</button>
        </div>
      </div>
    </div>
  )
}

// ─── Product Form Modal ───────────────────────────────────────────────────────
function ProductModal({ product, categories, onClose, onRefresh }) {
  const isEdit = !!product
  const { user } = useAuth()   // ── STOCK CHANGE HISTORY ── who made the edit
  const [historyVariantIndex, setHistoryVariantIndex] = useState(null)   // ── STOCK CHANGE HISTORY ── per-variant
  const [name, setName] = useState(product?.product_name || '')
  const [categoryId, setCategoryId] = useState(product?.category_id || '')
  const [variants, setVariants] = useState(
    isEdit
      ? [] // Will be populated from product rows
      : [{ name: '', unit: 'unit', stock: '', lowStockThreshold: 5, buyingPrice: '', sellingPrice: '', normalPrice: '', wholesalePrice: '', barcode: '', pluName: '', expiryDates: [] }]
  )
  const [errors, setErrors] = useState([])
  const [saving, setSaving] = useState(false)
  const [expiryVariantIndex, setExpiryVariantIndex] = useState(null)   // ── EXPIRY DATES ── index into `variants`, works pre-save
  const inputRefs = useRef([])

  const UNITS = ['unit', 'kg', 'liter', 'meter', 'g', 'ml', 'pcs']

  useEffect(() => {
    if (isEdit && product) {
      // Load all variants for this product
      window.api.getProducts({ search: product.product_code }).then(async r => {
        if (r.success) {
          const rows = r.data.filter(row => row.product_code === product.product_code)
          // ── EXPIRY DATES ── load each existing variant's saved dates once,
          // then hold them locally in form state alongside everything else.
          const withExpiry = await Promise.all(rows.map(async row => {
            let expiryDates = []
            try {
              const er = await window.api.getExpiryDates(row.variant_id)
              if (er.success) expiryDates = er.data.map(d => ({ id: d.id, expireDate: d.expire_date }))
            } catch (_) {}
            return {
              id: row.variant_id,
              name: row.variant_name,
              unit: row.unit,
              stock: row.stock,
              lowStockThreshold: row.low_stock_threshold,
              buyingPrice: row.buying_price,
              sellingPrice: row.selling_price,
              normalPrice: row.normal_price ?? '',
              pluName: row.plu_name ?? '',
              wholesalePrice: row.wholesale_price ?? '',   // ── WHOLESALE ──
              barcode: row.barcode || '',
              variant_id: row.variant_id,
              expiryDates
            }
          }))
          setVariants(withExpiry)
          if (rows[0]) setCategoryId(rows[0].category_id)
        }
      })
    }
  }, [])

  const addVariant = () => {
    setVariants(prev => [...prev, {
      name: '', unit: 'unit', stock: 0, lowStockThreshold: 5,
      buyingPrice: '', sellingPrice: '', normalPrice: '', wholesalePrice: '', barcode: '', pluName: '', expiryDates: []
    }])
  }

  const removeVariant = (i) => {
    if (variants.length === 1) return
    setVariants(prev => prev.filter((_, idx) => idx !== i))
  }

  const updateVariant = (i, field, value) => {
    setVariants(prev => prev.map((v, idx) => idx === i ? { ...v, [field]: value } : v))
  }

  const generateBarcodes = () => {
    setVariants(prev => prev.map(v => ({
      ...v,
      barcode: v.barcode || 'POS' + Date.now() + Math.floor(Math.random() * 1000)
    })))
  }

  const handleSave = async () => {
    setErrors([])
    const v = Validator.validateProduct({ name, categoryId, variants })
    if (!v.valid) { setErrors(v.errors); return }
    setSaving(true)
    let result
    if (isEdit) {
      result = await window.api.updateProduct({
        productId: product.id,
        name: name.trim(),
        categoryId: parseInt(categoryId),
        updatedBy: user?.username,   // ── STOCK CHANGE HISTORY ──
        variants: variants.map(v => ({
          ...v,
          buyingPrice: parseFloat(v.buyingPrice),
          sellingPrice: parseFloat(v.sellingPrice),
          normalPrice: parseFloat(v.normalPrice) || 0,
          pluName: (v.pluName || '').trim(),
          wholesalePrice: parseFloat(v.wholesalePrice) || 0,   // ── WHOLESALE ──
          stock: parseFloat(v.stock),
          lowStockThreshold: parseFloat(v.lowStockThreshold)
        }))
      })
    } else {
      result = await window.api.addProduct({
        name: name.trim(),
        categoryId: parseInt(categoryId),
        variants: variants.map(v => ({
          ...v,
          buyingPrice: parseFloat(v.buyingPrice),
          sellingPrice: parseFloat(v.sellingPrice),
          normalPrice: parseFloat(v.normalPrice) || 0,
          pluName: (v.pluName || '').trim(),
          wholesalePrice: parseFloat(v.wholesalePrice) || 0,   // ── WHOLESALE ──
          stock: parseFloat(v.stock),
          lowStockThreshold: parseFloat(v.lowStockThreshold)
        }))
      })
    }
    setSaving(false)
    if (result.success) { onRefresh(); onClose() }
    else setErrors([result.message])
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-lg" onClick={e => e.stopPropagation()}
             style={{ maxWidth: '1100px', width: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
          <div className="modal-header">
            <h2>{isEdit ? 'Update Product' : 'Add New Product'}</h2>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
            {/* Product ID */}
            {isEdit ? (
              <div className="form-group">
                <label className="form-label">Product ID</label>
                <div style={styles.productIdBox}>{product.product_code}</div>
                <p className="form-hint">Auto-generated — cannot be changed</p>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Product ID</label>
                <div style={styles.productIdBox}>Auto</div>
                <p className="form-hint">Auto-generated</p>
              </div>
            )}

            {/* Name */}
            <div className="form-group">
              <label className="form-label">Product Name <span className="required">*</span></label>
              <input 
               className="input"
               placeholder="e.g. Boys Shoes" 
               value={name} 
               onChange={e => setName(e.target.value)}
                />
            </div>

            {/* Category */}
            <div className="form-group">
              <label className="form-label">Category <span className="required">*</span></label>
              <select className="input" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                <option value="">-- Select Category --</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Variants */}
            <div style={styles.variantsSection}>
              <div style={styles.variantsHeader}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: '600' }}>Variants</h3>
                  <p className="form-hint" style={{ margin: 0 }}>Leave variant name empty for "Standard"</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={addVariant}>+ Add Variant</button>
              </div>

              {/* ── LAYOUT FIX ── horizontal scroll so all variant columns keep
                  full size instead of squishing on narrow screens */}
              <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
              <div style={{ minWidth: '920px' }}>

              {/* Variant header row */}
              <div style={styles.variantHeader}>
                {['VARIANT NAME','UNIT','BARCODE','STOCK','LOW STOCK','BUYING (RS.)','YOUR PRICE (RS.)','NORMAL PRICE (RS.)','WHOLESALE (RS.)','ACTIONS'].map((h, i) => (
                  <div key={i} style={styles.variantHeaderCell}>{h}</div>
                ))}
              </div>

              {/* Variant rows */}
              {variants.map((v, i) => (
                <div key={i} style={styles.variantRow}>
                  <input 
                  className="input"
                   placeholder="Small / or leave empty" 
                   value={v.name} 
                   ref={el => inputRefs.current[i * 10 + 0] = el}
                   onChange={e => updateVariant(i, 'name', e.target.value)}
                   onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              inputRefs.current[i * 10 + 2]?.focus()
                            }
                          }} 
                   style={styles.vInput} />
                  <select className="input" value={v.unit} ref={el => inputRefs.current[i * 10 + 1] = el} onChange={e => updateVariant(i, 'unit', e.target.value)} style={styles.vInputSm}>
                    {UNITS.map(u => <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>)}
                  </select>
                  <input 
                  className="input" 
                  placeholder="Optional" 
                  value={v.barcode} 
                  ref={el => inputRefs.current[i * 10 + 2] = el}
                  onChange={e => updateVariant(i, 'barcode', e.target.value)}
                  onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          inputRefs.current[i * 10 + 4]?.focus()
                        }
                      }} 
                  style={styles.vInput} />
                  <input className="input" type="number" min="0" value={v.stock} ref={el => inputRefs.current[i * 10 + 4] = el} onChange={e => updateVariant(i, 'stock', e.target.value)} 
                  onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            inputRefs.current[i * 10 + 5]?.focus()
                          }
                        }}
                  style={styles.vInputSm} 
                  />
                  <input className="input" type="number" min="0" value={v.lowStockThreshold} ref={el => inputRefs.current[i * 10 + 5] = el} onChange={e => updateVariant(i, 'lowStockThreshold', e.target.value)}
                  onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            inputRefs.current[i * 10 + 6]?.focus()
                          }
                        }} 
                  style={styles.vInputSm} />
                  <input className="input" type="number" step="0.01" min="0" value={v.buyingPrice} ref={el => inputRefs.current[i * 10 + 6] = el} onChange={e => updateVariant(i, 'buyingPrice', e.target.value)}
                  onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            inputRefs.current[i * 10 + 7]?.focus()
                          }
                        }}
                  style={styles.vInputSm} />
                  {/* YOUR PRICE (= selling_price; drives summary + profit) */}
                  <input className="input" type="number" step="0.01" min="0" value={v.sellingPrice} ref={el => inputRefs.current[i * 10 + 7] = el} onChange={e => updateVariant(i, 'sellingPrice', e.target.value)}
                  onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        inputRefs.current[i * 10 + 8]?.focus()
                      }
                    }}
                  style={styles.vInputSm} />
                  {/* ── NORMAL PRICE ── shown on the bill; used only for "you saved" */}
                  <input className="input" type="number" step="0.01" min="0" placeholder="0.00" value={v.normalPrice} ref={el => inputRefs.current[i * 10 + 8] = el} onChange={e => updateVariant(i, 'normalPrice', e.target.value)}
                  onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        inputRefs.current[i * 10 + 9]?.focus()
                      }
                    }}
                  style={styles.vInputSm} />
                  {/* ── WHOLESALE ── per-variant wholesale price. Leave 0/empty to fall back to your price. */}
                  <input className="input" type="number" step="0.01" min="0" placeholder="0.00" value={v.wholesalePrice} ref={el => inputRefs.current[i * 10 + 9] = el} onChange={e => updateVariant(i, 'wholesalePrice', e.target.value)}
                  onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const nextVariant = inputRefs.current[(i + 1) * 10 + 0]
                        if (nextVariant) {
                          nextVariant.focus()
                        } else {
                          handleSave()
                        }
                      }
                    }}
                  style={styles.vInputSm} />
                  {/* ── ACTIONS COLUMN ── scale-name (Kg only) + expiry/history/remove
                      all share the last flexible grid column so the grid stays aligned */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                  {/* ── SCALE PLU NAME ── only for Kg items; English name used in
                      the scale PLU file when the product name is in Sinhala. */}
                  {String(v.unit).toLowerCase() === 'kg' && (
                    <input
                      className="input"
                      placeholder="Scale name (English)"
                      title="English name for the scale PLU file (used when the product name is in Sinhala)"
                      value={v.pluName || ''}
                      onChange={e => updateVariant(i, 'pluName', e.target.value)}
                      style={{ ...styles.vInputSm, width: '150px', flexShrink: 0 }}
                    />
                  )}
                  {/* Expiry calendar icon — works before saving too, since dates
                      are held locally in this variant's form state and saved
                      together with the product/variant. */}
                  <button
                    className="btn btn-outline btn-sm"
                    title="Manage expiry dates"
                    onClick={() => setExpiryVariantIndex(i)}
                    style={{ padding: '6px 10px', position: 'relative', flexShrink: 0 }}
                  >
                    📅
                    {v.expiryDates && v.expiryDates.length > 0 && (
                      <span style={styles.expiryCountBadge}>{v.expiryDates.length}</span>
                    )}
                  </button>
                  {/* ── STOCK CHANGE HISTORY ── per-variant history icon.
                      Only meaningful for a variant that's already saved (has an
                      id) — a brand-new, unsaved variant has no history yet. */}
                  {v.id && (
                    <button
                      className="btn btn-outline btn-sm"
                      title="View stock update history"
                      onClick={() => setHistoryVariantIndex(i)}
                      style={{ padding: '6px 10px', flexShrink: 0 }}
                    >📜</button>
                  )}
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '16px', padding: '0 4px', flexShrink: 0 }}
                    onClick={() => removeVariant(i)}
                    disabled={variants.length === 1}
                  >✕</button>
                  </div>
                  {/* ── end actions column ── */}
                </div>
              ))}
              </div>
              </div>
              {/* ── end horizontal scroll wrapper ── */}
            </div>

            {/* Barcode generation box */}
            <div style={styles.barcodeBox}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span>🔖</span>
                  <strong style={{ fontSize: '14px' }}>Barcode Generation</strong>
                </div>
                <p style={{ fontSize: '12px', color: '#6b7280' }}>
                  Generate unique barcodes for each variant. You can remove any you don't want.
                </p>
              </div>
              <button className="btn btn-primary btn-sm" onClick={generateBarcodes}>
                🔄 Generate Barcodes
              </button>
            </div>

            {errors.length > 0 && (
              <div className="alert alert-error" style={{ marginTop: '12px' }}>
                <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Update Product' : 'Add Product'}
            </button>
          </div>
        </div>
      </div>

      {/* Expiry modal — operates on this variant's local expiryDates array */}
      {expiryVariantIndex !== null && variants[expiryVariantIndex] && (
        <ExpiryModal
          variantName={variants[expiryVariantIndex].name}
          dates={variants[expiryVariantIndex].expiryDates || []}
          onChange={(next) => updateVariant(expiryVariantIndex, 'expiryDates', next)}
          onClose={() => setExpiryVariantIndex(null)}
        />
      )}

      {/* ── STOCK CHANGE HISTORY ── per-variant history, opened via the 📜 icon */}
      {historyVariantIndex !== null && variants[historyVariantIndex] && (
        <StockHistoryModal
          variantId={variants[historyVariantIndex].id}
          variantName={variants[historyVariantIndex].name}
          onClose={() => setHistoryVariantIndex(null)}
        />
      )}
    </>
  )
}

// ─── Stock Update History Modal (per variant) ─────────────────────────────────
// Opened from the 📜 icon next to a variant row. Fetches this ONE variant's
// stock-change history: date/time, previous → new stock, and the signed
// change with an up/down indicator. Recorded both from editing stock directly
// in the product form and from the separate Stock Adjust tool.
function StockHistoryModal({ variantId, variantName, onClose }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const r = await window.api.getVariantStockHistory(variantId)
      if (r.success) setHistory(r.data)
      setLoading(false)
    })()
  }, [variantId])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📜 Stock Update History — {variantName}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="spinner" style={{ margin: '20px auto' }} />
          ) : history.length === 0 ? (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: '10px' }}>
              No stock changes recorded yet.
            </p>
          ) : (
            <div className="table-wrap" style={{ maxHeight: '360px', overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th style={{ textAlign: 'center' }}>Change</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => {
                    const up = h.adjustment > 0
                    const hasBeforeAfter = h.previous_stock !== null && h.previous_stock !== undefined
                    return (
                      <tr key={h.id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                          {h.created_at ? DateTime.formatDateTime(h.created_at) : '—'}
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {hasBeforeAfter ? (
                            <>
                              <span style={{ color: '#6b7280' }}>{formatQty(h.previous_stock)}</span>
                              <span style={{ margin: '0 4px', color: '#9ca3af' }}>→</span>
                              <span style={{ fontWeight: 700 }}>{formatQty(h.new_stock)}</span>
                              <span style={{
                                marginLeft: '8px', fontWeight: 800,
                                color: up ? '#16a34a' : '#dc2626'
                              }}>
                                {up ? '▲' : '▼'} {formatQty(Math.abs(h.adjustment))}
                              </span>
                            </>
                          ) : (
                            <span style={{ fontWeight: 700, color: up ? '#16a34a' : '#dc2626' }}>
                              {up ? '▲' : '▼'} {formatQty(Math.abs(h.adjustment))}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '12px', color: '#6b7280' }}>{h.adjusted_by || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Inventory Page ──────────────────────────────────────────────────────
export default function Inventory() {
  const { refreshAlerts } = useApp()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showProductModal, setShowProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [stockVariant, setStockVariant] = useState(null)
  // ── SCALE PLU ──
  const [pluBusy, setPluBusy] = useState(false)
  const [barcodeBusy, setBarcodeBusy] = useState(false)   // ── SCALE BARCODE ──
  const [pluMsg, setPluMsg] = useState('')

  // ── SCALE BARCODE ── generate 6-digit codes for Kg variants without one
  const handleCreateBarcodes = async () => {
    setPluMsg('')
    setBarcodeBusy(true)
    const r = await window.api.generateScaleBarcodes()
    setBarcodeBusy(false)
    if (r.success) {
      setPluMsg(r.generated > 0
        ? `✅ Created ${r.generated} scale barcode${r.generated === 1 ? '' : 's'} for Kg products.`
        : `✅ All Kg products already have a barcode — nothing to create.`)
      await loadAll()   // refresh so the new barcodes show in the list
    } else {
      setPluMsg(`❌ ${r.message || 'Could not create barcodes'}`)
    }
    setTimeout(() => setPluMsg(''), 6000)
  }

  const handleExportPlu = async () => {
    setPluMsg('')
    setPluBusy(true)
    const r = await window.api.exportPluFile()
    setPluBusy(false)
    if (r.success) {
      setPluMsg(`✅ Scale PLU file updated (${r.count} Kg products) — saved to: ${r.path}`)
    } else {
      setPluMsg(`❌ ${r.message || 'Could not create the PLU file'}`)
    }
    setTimeout(() => setPluMsg(''), 6000)
  }

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [prodResult, catResult] = await Promise.all([
      window.api.getProducts({}),
      window.api.getCategories()
    ])
    if (prodResult.success) setProducts(prodResult.data)
    if (catResult.success) setCategories(catResult.data)
    setLoading(false)
    refreshAlerts()
  }, [])

  const loadProducts = useCallback(async () => {
    const result = await window.api.getProducts({
      search: search || undefined,
      categoryId: categoryFilter || undefined
    })
    if (result.success) setProducts(result.data)
    refreshAlerts()
  }, [search, categoryFilter])

  useEffect(() => {
    const t = setTimeout(loadProducts, 300)
    return () => clearTimeout(t)
  }, [search, categoryFilter])

  const handleRemoveProduct = async (productId, productName) => {
    if (!window.confirm(`Remove "${productName}"? It will be hidden from billing.`)) return
    const result = await window.api.removeProduct(productId)
    if (result.success) loadProducts()
    else alert(result.message)
  }

  const getStockClass = (stock, threshold) => {
    if (stock <= 0) return 'stock-out'
    if (stock <= threshold * 0.4) return 'stock-critical'
    if (stock <= threshold) return 'stock-low'
    return 'stock-ok'
  }

  return (
    <div className="page-content">
      <div className="card card-body">
        {/* Header */}
        <div className="flex-between" style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700' }}>Store Management</h1>
          <div style={{ display: 'flex', gap: '10px' }}>
            {/* ── SCALE BARCODE ── bulk-generate 6-digit codes for Kg variants */}
            <button
              className="btn btn-outline"
              onClick={handleCreateBarcodes}
              disabled={barcodeBusy}
              title="Generate 6-digit scale barcodes for all Kg products that don't have one"
            >
              {barcodeBusy ? 'Working…' : '🏷️ Create Barcode'}
            </button>
            {/* ── SCALE PLU ── write Scale PLU.txt to the desktop */}
            <button
              className="btn btn-outline"
              onClick={handleExportPlu}
              disabled={pluBusy}
              title="Create/update the Scale PLU.txt file on the desktop (Kg products)"
            >
              {pluBusy ? 'Working…' : '⚖️ Update PLU file'}
            </button>
            <button
              className="btn btn-warning"
              onClick={() => setShowCategoryModal(true)}
            >
              📁 Add/Remove Category
            </button>
            <button
              className="btn btn-primary"
              onClick={() => { setEditingProduct(null); setShowProductModal(true) }}
            >
              + Add New Product
            </button>
          </div>
        </div>

        {/* ── SCALE PLU ── result message */}
        {pluMsg && (
          <div className={pluMsg.startsWith('✅') ? 'alert alert-success' : 'alert alert-error'}
               style={{ marginBottom: '12px', wordBreak: 'break-all' }}>
            {pluMsg}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div>
            <label className="form-label">Category</label>
            <select
              className="input"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              style={{ minWidth: '180px' }}
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="form-label">Search</label>
            <input
              className="input"
              placeholder="Search by ID, Name, or Variant..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="spinner" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th>Category</th>
                  <th>Item Name</th>
                  <th>Variant</th>
                  <th>Unit</th>
                  <th style={{ textAlign: 'center' }}>In Stock</th>
                  <th>Buying Price</th>
                  <th>Your Price</th>
                  <th>Normal Price</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9ca3af', padding: '40px' }}>No products found</td></tr>
                ) : (
                  products.map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: '700' }}>{row.product_code}</td>
                      <td><span className="badge badge-blue">{row.category_name}</span></td>
                      <td style={{ fontWeight: '500' }}>{row.product_name}</td>
                      <td><span className="badge badge-purple">{row.variant_name}</span></td>
                      <td><span className="badge badge-gray">{row.unit}</span></td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${getStockClass(row.stock, row.low_stock_threshold)}`}
                          style={{ cursor: 'pointer', minWidth: '36px', display: 'inline-block', textAlign: 'center' }}
                          onClick={() => setStockVariant(row)}
                          title="Click to adjust stock"
                        >
                          {formatQty(row.stock)}
                        </span>
                      </td>
                      <td>Rs. {parseFloat(row.buying_price).toFixed(2)}</td>
                      <td>Rs. {parseFloat(row.selling_price).toFixed(2)}</td>
                      <td>Rs. {parseFloat(row.normal_price || 0).toFixed(2)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="link-btn link-btn-blue"
                            onClick={() => { setEditingProduct(row); setShowProductModal(true) }}
                          >Update</button>
                          <button
                            className="link-btn link-btn-red"
                            onClick={() => handleRemoveProduct(row.id, row.product_name)}
                          >Remove</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '10px' }}>
              Total: {products.length} products&nbsp;&nbsp;
              💡 Click Update on any row to edit all variants of that product at once
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCategoryModal && (
        <CategoryModal
          onClose={() => setShowCategoryModal(false)}
          onRefresh={loadAll}
        />
      )}
      {showProductModal && (
        <ProductModal
          product={editingProduct}
          categories={categories}
          onClose={() => { setShowProductModal(false); setEditingProduct(null) }}
          onRefresh={loadProducts}
        />
      )}
      {stockVariant && (
        <StockModal
          variant={stockVariant}
          onClose={() => setStockVariant(null)}
          onRefresh={loadProducts}
        />
      )}
    </div>
  )
}

const styles = {
  expiryCountBadge: {
    position: 'absolute', top: '-6px', right: '-6px',
    background: '#dc2626', color: '#fff', fontSize: '9px', fontWeight: '800',
    minWidth: '15px', height: '15px', lineHeight: '15px', textAlign: 'center',
    borderRadius: '999px', padding: '0 2px'
  },
  productIdBox: {
    display: 'inline-block',
    background: '#f3f4f6',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '6px 14px',
    fontWeight: '700',
    fontSize: '16px',
    minWidth: '70px',
    textAlign: 'center'
  },
  variantsSection: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '12px'
  },
  variantsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px'
  },
  variantHeader: {
    display: 'grid',
    gridTemplateColumns: '150px 90px 120px 70px 80px 90px 100px 110px 100px 1fr',
    gap: '6px',
    marginBottom: '6px',
    padding: '0 4px'
  },
  variantHeaderCell: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase'
  },
  variantRow: {
    display: 'grid',
    gridTemplateColumns: '150px 90px 120px 70px 80px 90px 100px 110px 100px 1fr',
    gap: '6px',
    marginBottom: '8px',
    alignItems: 'center'
  },
  vInput: { padding: '7px 8px', fontSize: '13px' },
  vInputSm: { padding: '7px 8px', fontSize: '13px' },
  barcodeBox: {
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: '8px',
    padding: '14px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  }
}