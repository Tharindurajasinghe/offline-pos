import { useState, useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { useApp } from '../context/AppContext'

// 6 standard label sizes
const LABEL_SIZES = [
  { label: '1" × 1"  (25 × 25 mm) — Small',        width: 96,  height: 96,  barcodeH: 35, barcodeW: 1.0, fontSize: 9  },
  { label: '2" × 1"  (50 × 25 mm) — Standard',      width: 190, height: 96,  barcodeH: 45, barcodeW: 1.2, fontSize: 10 },
  { label: '2" × 1.5" (50 × 38 mm) — Medium',       width: 190, height: 144, barcodeH: 55, barcodeW: 1.4, fontSize: 11 },
  { label: '3" × 1"  (76 × 25 mm) — Wide Narrow',   width: 288, height: 96,  barcodeH: 45, barcodeW: 1.8, fontSize: 10 },
  { label: '3" × 2"  (76 × 50 mm) — Large',         width: 288, height: 192, barcodeH: 65, barcodeW: 2.0, fontSize: 12 },
  { label: '4" × 3"  (100 × 75 mm) — Extra Large',  width: 384, height: 288, barcodeH: 90, barcodeW: 2.5, fontSize: 13 },
]

export default function Barcode() {
  const { formatCurrency } = useApp()
  const [products, setProducts] = useState([])
  const [selected, setSelected] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sizeIndex, setSizeIndex] = useState(1) // default: 2"×1" Standard
  const [shopName, setShopName] = useState('')
  const barcodeRef = useRef(null)

  useEffect(() => { loadProducts() }, [])

  // Load shop name from settings
  useEffect(() => {
    window.api.getSettings().then(r => {
      if (r.success) setShopName(r.data.shop_name || '')
    })
  }, [])

  useEffect(() => {
    if (selected && barcodeRef.current) {
      const size = LABEL_SIZES[sizeIndex]
      try {
        JsBarcode(barcodeRef.current, selected.barcode, {
          format: 'CODE128',
          width: size.barcodeW,
          height: size.barcodeH,
          displayValue: true,
          fontSize: size.fontSize,
          margin: 2,
          textMargin: 2
        })
        const svg = barcodeRef.current
        svg.removeAttribute('width')
        svg.removeAttribute('height')
        svg.style.width = '100%'
        svg.style.height = 'auto'
      } catch (e) {
        console.error('Barcode render error:', e)
      }
    }
  }, [selected, sizeIndex])

  const loadProducts = async () => {
    setLoading(true)
    const result = await window.api.getBarcodeProducts()
    if (result.success) setProducts(result.data)
    setLoading(false)
  }

  const filtered = products.filter(p =>
    p.product_name.toLowerCase().includes(search.toLowerCase()) ||
    p.product_code.includes(search) ||
    p.variant_name.toLowerCase().includes(search.toLowerCase())
  )

  const handlePrint = () => {
    if (!selected) return
    const size = LABEL_SIZES[sizeIndex]

    const labels = Array.from({ length: quantity }, (_, i) => `
      <div style="
        display: inline-block;
        border: 1px solid #ccc;
        padding: 6px;
        margin: 4px;
        text-align: center;
        width: ${size.width}px;
        box-sizing: border-box;
        font-family: monospace;
        overflow: hidden;
      ">
        ${shopName ? `<div style="font-size: ${size.fontSize - 1}px; color: #555; margin-bottom: 2px;">${shopName}</div>` : ''}
        <div style="font-size: ${size.fontSize}px; font-weight: bold; margin-bottom: 2px;">${selected.product_code}</div>
        <svg id="bc${i}" style="width:100%;height:auto;display:block;"></svg>
        <div style="font-size: ${size.fontSize - 1}px; margin-top: 2px;">${selected.variant_name}</div>
        <div style="font-size: ${size.fontSize + 1}px; font-weight: bold;">Rs. ${parseFloat(selected.selling_price).toFixed(2)}</div>
      </div>
    `).join('')

    const html = `
      <!DOCTYPE html><html><head>
      <title>Barcode Labels</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
      <style>
        body { margin: 8px; }
        @media print { body { margin: 0; } }
      </style>
      </head><body>
      ${labels}
      <script>
        window.onload = () => {
          for (let i = 0; i < ${quantity}; i++) {
            JsBarcode('#bc' + i, '${selected.barcode}', {
              format: 'CODE128',
              width: ${size.barcodeW},
              height: ${size.barcodeH},
              displayValue: true,
              fontSize: ${size.fontSize},
              margin: 2,
              textMargin: 2
            })
            const svg = document.getElementById('bc' + i)
            if (svg) {
              svg.removeAttribute('width')
              svg.removeAttribute('height')
              svg.style.width = '100%'
              svg.style.height = 'auto'
            }
          }
          setTimeout(() => { window.print(); window.close() }, 500)
        }
      </script>
      </body></html>
    `
    const win = window.open('', '_blank', 'width=600,height=400')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 800)
  }

  const size = LABEL_SIZES[sizeIndex]

  return (
    <div className="page-content">
      <div style={styles.grid}>

        {/* Left — product list */}
        <div className="card card-body">
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '16px' }}>
            🔖 Barcode Print
          </h2>

          <input
            className="input"
            placeholder="Search product..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ marginBottom: '12px' }}
          />

          {loading ? (
            <div className="spinner" />
          ) : (
            <div style={styles.productList}>
              {filtered.length === 0 ? (
                <p style={{ color: '#9ca3af', textAlign: 'center', padding: '20px' }}>
                  No products with barcodes found
                </p>
              ) : (
                filtered.map((p, i) => (
                  <button
                    key={i}
                    style={{
                      ...styles.productItem,
                      ...(selected?.variant_id === p.variant_id ? styles.productItemActive : {})
                    }}
                    onClick={() => setSelected(p)}
                  >
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '13px' }}>
                        [{p.product_code}] {p.product_name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>
                        {p.variant_name} · {p.barcode}
                      </div>
                    </div>
                    <span style={{ color: '#16a34a', fontWeight: '700', fontSize: '13px' }}>
                      Rs.{parseFloat(p.selling_price).toFixed(2)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right — preview & print */}
        <div className="card card-body">
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '16px' }}>
            Preview & Print
          </h2>

          {!selected ? (
            <div style={styles.empty}>
              <span style={{ fontSize: '40px' }}>🔖</span>
              <p style={{ color: '#9ca3af', marginTop: '12px' }}>Select a product to preview barcode</p>
            </div>
          ) : (
            <div>
              {/* Label preview */}
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{
                  ...styles.labelPreview,
                  width: Math.min(size.width, 280) + 'px'
                }}>
                  {shopName && (
                    <div style={{ fontSize: size.fontSize - 1 + 'px', color: '#555', marginBottom: '2px' }}>
                      {shopName}
                    </div>
                  )}
                  <div style={{ fontSize: size.fontSize + 'px', fontWeight: '700', marginBottom: '4px' }}>
                    {selected.product_code}
                  </div>
                  <svg ref={barcodeRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
                  <div style={{ fontSize: size.fontSize - 1 + 'px', color: '#374151', marginTop: '4px' }}>
                    {selected.variant_name}
                  </div>
                  <div style={{ fontSize: size.fontSize + 1 + 'px', fontWeight: '700', color: '#16a34a' }}>
                    Rs. {parseFloat(selected.selling_price).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Label size selector */}
              <div className="form-group">
                <label className="form-label">Label Size</label>
                <select
                  className="input"
                  value={sizeIndex}
                  onChange={e => setSizeIndex(parseInt(e.target.value))}
                >
                  {LABEL_SIZES.map((s, i) => (
                    <option key={i} value={i}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div className="form-group">
                <label className="form-label">Number of Labels to Print</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="100"
                  value={quantity}
                  onChange={e => setQuantity(parseInt(e.target.value) || 1)}
                  style={{ maxWidth: '120px' }}
                />
              </div>

              {/* Product info */}
              <div style={styles.infoBox}>
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Shop:</span>
                  <span>{shopName || '—'}</span>
                </div>
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Product:</span>
                  <span>{selected.product_name}</span>
                </div>
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Variant:</span>
                  <span>{selected.variant_name}</span>
                </div>
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Barcode:</span>
                  <span style={{ fontFamily: 'monospace' }}>{selected.barcode}</span>
                </div>
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Price:</span>
                  <span style={{ color: '#16a34a', fontWeight: '700' }}>
                    Rs. {parseFloat(selected.selling_price).toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                className="btn btn-primary btn-block btn-lg"
                onClick={handlePrint}
                style={{ marginTop: '16px' }}
              >
                🖨️ Print {quantity} Label{quantity !== 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  productList: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '550px', overflowY: 'auto' },
  productItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px',
    background: '#fff', cursor: 'pointer', textAlign: 'left', width: '100%'
  },
  productItemActive: { border: '1px solid #16a34a', background: '#f0fdf4' },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '60px', color: '#9ca3af'
  },
  labelPreview: {
    border: '2px dashed #d1d5db', borderRadius: '8px',
    padding: '12px', textAlign: 'center', background: '#fff',
    display: 'inline-block', margin: '0 auto'
  },
  infoBox: {
    background: '#f9fafb', borderRadius: '8px',
    padding: '14px', marginTop: '12px',
    display: 'flex', flexDirection: 'column', gap: '6px'
  },
  infoRow: { display: 'flex', gap: '10px', fontSize: '13px' },
  infoLabel: { minWidth: '70px', color: '#6b7280', fontWeight: '500' }
}