import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import LowStockAlert from '../components/LowStockAlert'
import ExpiryWarning from '../components/ExpiryWarning'
import TodaySalesModal from '../components/TodaySalesModal'
import Validator from '../utils/validator'
import DateTime from '../utils/dateTime'
import { useNavigate } from 'react-router-dom'
import { printBill } from '../utils/printBill'
import CustomerBillModal from '../components/CustomerBillModal'

export default function Billing() {
  const { user } = useAuth()
  const { formatCurrency, refreshTodayTotal, refreshAlerts, todayTotal } = useApp()
  const navigate = useNavigate()

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)

  // Active product in right panel
  const [activeProduct, setActiveProduct] = useState(null)
  // activeProduct = { productId, productCode, productName, variants, selectedVariantId, qty, editedPrice, isPriceEdited }

  // Cart
  const [cart, setCart] = useState([])
  const [customerName, setCustomerName] = useState('')
  const [cashPaid, setCashPaid] = useState('')
  const [isWholesale, setIsWholesale] = useState(false)   // ── WHOLESALE ──

  // UI
  const [showTodaySales, setShowTodaySales] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState([])
  const [successMsg, setSuccessMsg] = useState('')
  const [clock, setClock] = useState(DateTime.getLiveClock())
  const [showCustomerBill, setShowCustomerBill] = useState(false)

  const searchRef = useRef(null)
  const qtyRef = useRef(null)
  const cashRef = useRef(null)

  useEffect(() => { loadCartDraft(); focusSearch() }, [])
  useEffect(() => {
    const i = setInterval(() => setClock(DateTime.getLiveClock()), 1000)
    return () => clearInterval(i)
  }, [])
  useEffect(() => {
    if (user?.userId !== undefined) saveCartDraft()
  }, [cart, customerName])

  // When activeProduct is set focus qty field
  useEffect(() => {
    if (activeProduct) focusQty()
  }, [activeProduct?.productId, activeProduct?.selectedVariantId])

  const focusSearch = () => setTimeout(() => {
    searchRef.current?.focus()
    searchRef.current?.select()
  }, 60)

  const focusQty = () => setTimeout(() => {
    qtyRef.current?.focus()
    qtyRef.current?.select()
  }, 60)

  const loadCartDraft = async () => {
    if (!user?.userId) return
    const result = await window.api.getCartDraft(user.userId)
    if (result.success && result.data) {
      setCart(result.data.cart || [])
      setCustomerName(result.data.customerName || '')
    }
  }

  const saveCartDraft = async () => {
    if (!user?.userId) return
    await window.api.saveCartDraft({ userId: user.userId, cart, customerName })
  }

  // ── Search ──────────────────────────────────────────────────────────────────
  const handleSearchChange = async (e) => {
    const q = e.target.value
    setSearchQuery(q)
    if (!q.trim()) { setSearchResults([]); setShowDropdown(false); return }

    const result = await window.api.searchProduct(q.trim())
    if (!result.success) return

    const data = result.data
    setSearchResults(data)

    // Exact barcode match — instant add qty 1 no questions
    const exactBarcode = data.find(r => r.barcode === q.trim())
    if (exactBarcode) {
      instantAddToCart(exactBarcode)
      return
    }

    setShowDropdown(data.length > 0)
  }

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (searchResults.length === 0) return
      // Pick first result — show in right panel
      showInRightPanel(searchResults[0], searchResults)
    }
    if (e.key === 'Escape') {
      setShowDropdown(false)
      setSearchQuery('')
      setSearchResults([])
      setActiveProduct(null)
      focusSearch()
    }
    if (e.key === 'ArrowDown' && showDropdown) {
      e.preventDefault()
      // focus first dropdown item
    }
  }

  // Show product in right panel (not in cart yet)
  const showInRightPanel = (row, allResults) => {
    const variants = (allResults || searchResults).filter(
      r => r.product_code === row.product_code
    )
    setActiveProduct({
      productId: row.id,
      productCode: row.product_code,
      productName: row.product_name,
      variants,
      selectedVariantId: row.variant_id,
      qty: 1,
      editedPrice: '',
      isPriceEdited: false
    })
    setSearchQuery('')
    setSearchResults([])
    setShowDropdown(false)
    setErrors([])
  }

  // Instant add (barcode scan) — directly to cart, no right panel
  const instantAddToCart = (row) => {
    const base = basePriceOf(row)   // ── WHOLESALE ──
    const item = makeCartItem(
      row.id, row.product_code, row.product_name,
      row.variant_id, row.variant_name, row.unit,
      row.stock, row.buying_price, base,
      1, base, false,
      row.selling_price, row.wholesale_price
    )
    if (item) {
      doAddToCart(item)
      setSearchQuery('')
      setSearchResults([])
      setShowDropdown(false)
      setActiveProduct(null)
      focusSearch()
    }
  }

  // ── WHOLESALE ──
  // Base price for a variant row. In wholesale mode we use wholesale_price,
  // but fall back to the retail price when no wholesale price has been set
  // (0 / null), so a bill can never be created at price 0.
  const basePriceOf = (row, wholesaleMode = isWholesale) => {
    const retail = parseFloat(row.selling_price) || 0
    const ws = parseFloat(row.wholesale_price) || 0
    return wholesaleMode && ws > 0 ? ws : retail
  }

  // Toggle the WHOLE bill between retail and wholesale pricing.
  // Re-prices every item already in the cart and clears manual price edits,
  // so the toggle is the single source of truth for the bill's pricing.
  const toggleWholesale = (checked) => {
    setIsWholesale(checked)
    setErrors([])

    const missing = []
    setCart(prev => prev.map(c => {
      const ws = parseFloat(c.wholesalePrice) || 0
      const retail = parseFloat(c.retailPrice) || 0
      if (checked && ws <= 0) missing.push(`${c.productName} — ${c.variantName}`)
      const base = checked && ws > 0 ? ws : retail
      return {
        ...c,
        originalPrice: base,
        soldPrice: base,
        isPriceEdited: false,
        discountAmount: 0,
        lineTotal: base * c.qty
      }
    }))

    if (checked && missing.length > 0) {
      setErrors([
        `No wholesale price set for: ${missing.join(', ')}. Retail price used for these items.`
      ])
    }
  }

  // Get currently selected variant from active product
  const getActiveVariant = () => {
    if (!activeProduct) return null
    return activeProduct.variants.find(
      v => v.variant_id === activeProduct.selectedVariantId
    ) || activeProduct.variants[0]
  }

  // Confirm active product → add to cart
  const confirmAddToCart = () => {
    if (!activeProduct) return
    setErrors([])
    const variant = getActiveVariant()
    if (!variant) return

    if (!activeProduct.qty || activeProduct.qty <= 0) {
  setErrors(['Quantity must be greater than 0'])
  return
}

    // ── WHOLESALE ── base price respects the wholesale toggle
    const base = basePriceOf(variant)
    const price = activeProduct.isPriceEdited
      ? parseFloat(activeProduct.editedPrice)
      : base

    // Validate price edit
    if (activeProduct.isPriceEdited) {
      const check = Validator.validatePriceEdit(activeProduct.editedPrice, variant.buying_price)
      if (!check.valid) { setErrors([check.message]); return }
    }

    // Check stock
    const existingQty = cart
      .filter(c => c.variantId === variant.variant_id)
      .reduce((s, c) => s + c.qty, 0)

    if (existingQty + activeProduct.qty > variant.stock) {
      setErrors([`Insufficient stock for ${variant.variant_name}. Available: ${variant.stock - existingQty}`])
      return
    }

    const item = makeCartItem(
      activeProduct.productId, activeProduct.productCode, activeProduct.productName,
      variant.variant_id, variant.variant_name, variant.unit,
      variant.stock, variant.buying_price, base,
      activeProduct.qty, price, activeProduct.isPriceEdited,
      variant.selling_price, variant.wholesale_price
    )

    doAddToCart(item)
    setActiveProduct(null)
    setErrors([])
    focusSearch()
  }

  const makeCartItem = (
    productId, productCode, productName,
    variantId, variantName, unit,
    stock, buyingPrice, originalPrice,
    qty, soldPrice, isPriceEdited,
    retailPrice, wholesalePrice   // ── WHOLESALE ── kept so the toggle can re-price
  ) => ({
    cartId: Date.now() + Math.random(),
    productId, productCode, productName,
    variantId, variantName, unit,
    stock, buyingPrice, originalPrice,
    qty, soldPrice, isPriceEdited,
    retailPrice: parseFloat(retailPrice) || 0,
    wholesalePrice: parseFloat(wholesalePrice) || 0,
    discountAmount: (originalPrice - soldPrice) * qty,
    lineTotal: soldPrice * qty
  })

  const doAddToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(
        c => c.variantId === item.variantId &&
             !item.isPriceEdited && !c.isPriceEdited
      )
      if (existing) {
        return prev.map(c =>
          c.cartId === existing.cartId
            ? { ...c, qty: c.qty + item.qty, lineTotal: c.soldPrice * (c.qty + item.qty), discountAmount: (c.originalPrice - c.soldPrice) * (c.qty + item.qty) }
            : c
        )
      }
      return [...prev, item]
    })
  }

  // Qty field Enter key → confirm add to cart
  const handleQtyKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmAddToCart() }
  }

  // Update active product fields
  const updateActive = (field, value) => {
    setActiveProduct(prev => prev ? { ...prev, [field]: value } : prev)
  }

  // ── Cart operations ──────────────────────────────────────────────────────────
  const removeFromCart = (cartId) => {
    setCart(prev => prev.filter(c => c.cartId !== cartId))
  }

  const updateCartQty = (cartId, newQty) => {
    if (newQty <= 0) { removeFromCart(cartId); return }
    setCart(prev => prev.map(c =>
      c.cartId === cartId
        ? { ...c, qty: newQty, lineTotal: c.soldPrice * newQty, discountAmount: (c.originalPrice - c.soldPrice) * newQty }
        : c
    ))
  }

  const updateCartPrice = (cartId, newPrice) => {
    const price = parseFloat(newPrice)
    if (isNaN(price) || price <= 0) return
    setCart(prev => prev.map(c =>
      c.cartId === cartId
        ? { ...c, soldPrice: price, isPriceEdited: price !== c.originalPrice, lineTotal: price * c.qty, discountAmount: (c.originalPrice - price) * c.qty }
        : c
    ))
  }

  const clearCart = () => {
    if (cart.length === 0 && !activeProduct) return
    if (window.confirm('Clear cart?')) {
      setCart([])
      setCustomerName('')
      setCashPaid('')
      setErrors([])
      setActiveProduct(null)
      setIsWholesale(false)   // ── WHOLESALE ──
      window.api.clearCartDraft(user?.userId)
      focusSearch()
    }
  }

  // ── Totals ──────────────────────────────────────────────────────────────────
  const grandTotal = cart.reduce((s, c) => s + c.lineTotal, 0)
  const totalDiscount = cart.reduce((s, c) => s + c.discountAmount, 0)
  const change = cashPaid !== '' ? Math.max(0, parseFloat(cashPaid) - grandTotal) : 0

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    let shiftPressTime = null
    let otherKeyDuringShift = false

    const onKeyDown = (e) => {
      if (e.key === 'Shift') {
        shiftPressTime = Date.now()
        otherKeyDuringShift = false
      } else if (e.shiftKey) {
        otherKeyDuringShift = true
      }
      if (e.key === 'Control') {
        e.preventDefault()
        handleSaveBill(true)
      }
    }

    const onKeyUp = (e) => {
      if (e.key === 'Shift') {
        const heldMs = Date.now() - shiftPressTime
        if (
          !otherKeyDuringShift &&
          heldMs < 300 &&
          document.activeElement !== cashRef.current &&
          !activeProduct
        ) {
          cashRef.current?.focus()
          cashRef.current?.select()
        }
        shiftPressTime = null
        otherKeyDuringShift = false
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [cart, cashPaid, customerName, activeProduct])

  // ── Save/Print ──────────────────────────────────────────────────────────────
  const handleSaveBill = async (directPrint = false, skipConfirm = false) => {
    setErrors([])
    const validation = Validator.validateBill({ items: cart, cashPaid: parseFloat(cashPaid), grandTotal })
    if (!validation.valid) { setErrors(validation.errors); return }

    if (!directPrint && !skipConfirm) {
      const confirmed = window.confirm('Print this bill?\n\nOK = Print    Cancel = Save only')
      if (confirmed) directPrint = true
    }

    setSaving(true)
    const result = await window.api.saveBill({
      items: cart, customerName,
      cashPaid: parseFloat(cashPaid),
      billedBy: user?.username,
      userId: user?.userId,
      isWholesale   // ── WHOLESALE ──
    })
    setSaving(false)

    if (result.success) {
      if (directPrint) {
          printBill(result, cart, customerName, grandTotal, totalDiscount, parseFloat(cashPaid), change, isWholesale)

      }
      setCart([])
      setCustomerName('')
      setCashPaid('')
      setErrors([])
      setActiveProduct(null)
      setIsWholesale(false)   // ── WHOLESALE ── reset so the NEXT bill is retail by default
      setSuccessMsg(skipConfirm ? 'Bill Saved' : `Bill ${result.billNumber} saved!`)
      setTimeout(() => setSuccessMsg(''), 3000)
      await refreshTodayTotal()
      await refreshAlerts()
      focusSearch()
    } else {
      setErrors([result.message])
    }
  }

  // NEW
async function handleEndDay() {
  if (!window.confirm('Are you sure you want to end today?')) return
  navigate('/day-end')
}

  const variant = getActiveVariant()
  const currentPrice = activeProduct?.isPriceEdited
    ? (parseFloat(activeProduct.editedPrice) || 0)
    : (variant ? basePriceOf(variant) : 0)   // ── WHOLESALE ──
  const currentTotal = currentPrice * (activeProduct?.qty || 1)

  return (
    <div style={styles.page}>

      {/* ── TOP ROW ── */}
      <div style={styles.topRow}>

        {/* LEFT — Search + today sell + buttons */}
        <div className="card" style={styles.leftCard}>
          <h2 style={styles.panelTitle}>Add Items to Bill</h2>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <input
              ref={searchRef}
              className="input-search"
              placeholder="Search by Product ID or Name..."
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              autoComplete="off"
              spellCheck={false}
            />

            {/* Status indicator */}
            <div style={styles.scanStatus}>
              <span style={{
                ...styles.scanDot,
                background: activeProduct ? '#f59e0b' : '#16a34a'
              }} />
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                {activeProduct ? 'Enter qty then press Enter' : 'Ready to scan'}
              </span>
            </div>

            {/* Dropdown */}
            {showDropdown && searchResults.length > 0 && (
              <div style={styles.dropdown}>
                {searchResults.map((row, i) => (
                  <button
                    key={i}
                    style={styles.dropRow}
                    onClick={() => showInRightPanel(row, searchResults)}
                  >
                    <span style={styles.dropCode}>{row.product_code}</span>
                    <span style={styles.dropName}>{row.product_name}</span>
                    <span style={styles.dropVariant}>{row.variant_name}</span>
                    <span style={styles.dropPrice}>Rs.{parseFloat(row.selling_price).toFixed(2)}</span>
                    <span style={{ ...styles.dropStock, color: row.stock <= 0 ? '#dc2626' : row.stock <= 5 ? '#d97706' : '#16a34a' }}>
                      Stock:{row.stock}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="alert alert-error">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          {/* Success */}
          {successMsg && <div className="alert alert-success">{successMsg}</div>}

          {/* Today sell */}
          <div style={styles.todayBar}>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Up to Now Sell:</div>
              <div style={styles.todayAmount}>{formatCurrency(todayTotal)}</div>
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-info btn-block" onClick={() => setShowTodaySales(true)}>
              📊 Check Up to Now Sell
            </button>
            <button className="btn btn-danger btn-block" onClick={handleEndDay}>
              🔴 End Sell Today
            </button>
          </div>
        </div>

        {/* RIGHT — Current Bill */}
        <div className="card" style={styles.rightCard}>
          <div style={styles.billHeader}>
            <h2 style={styles.panelTitle}>Current Bill</h2>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>{clock}</span>
          </div>

          {/* ── WHOLESALE ── Whole-bill wholesale toggle */}
          <label style={{
            ...styles.wholesaleBox,
            ...(isWholesale ? styles.wholesaleBoxOn : {})
          }}>
            <input
              type="checkbox"
              checked={isWholesale}
              onChange={e => toggleWholesale(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '700', fontSize: '14px', color: isWholesale ? '#7c2d12' : '#374151' }}>
                🏷️ Wholesale Bill
              </div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>
                {isWholesale
                  ? 'All items priced at wholesale rate'
                  : 'Tick to price the whole bill at wholesale rates'}
              </div>
            </div>
            {isWholesale && (
              <span style={styles.wholesaleTag}>WHOLESALE</span>
            )}
          </label>

          {/* Active product form — shown inside right panel */}
          {activeProduct && variant && (
            <div style={styles.activeBox}>
              <div style={styles.activeHeader}>
                <div>
                  <span style={styles.activeName}>{activeProduct.productName}</span>
                  <span style={styles.activeCode}> — ID: {activeProduct.productCode}</span>
                </div>
                <button
                  style={styles.closeBtn}
                  onClick={() => { setActiveProduct(null); focusSearch() }}
                >✕</button>
              </div>

              {/* Variant dropdown */}
              <div style={styles.activeRow}>
                <label style={styles.activeLabel}>Variant:</label>
                <select
                  className="input"
                  value={activeProduct.selectedVariantId}
                  onChange={e => updateActive('selectedVariantId', parseInt(e.target.value))}
                  style={{ flex: 1 }}
                >
                  {activeProduct.variants.map(v => (
                    <option key={v.variant_id} value={v.variant_id}>
                      {v.variant_name} — Rs.{v.selling_price.toFixed(2)} (Stock: {v.stock})
                    </option>
                  ))}
                </select>
              </div>

              {/* Qty */}
              <div style={styles.activeRow}>
                <label style={styles.activeLabel}>Qty ({variant.unit}):</label>
                <input
                  ref={qtyRef}
                  className="input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={activeProduct.qty}
                  onChange={e => updateActive('qty', parseFloat(e.target.value) || '')}
                  onKeyDown={handleQtyKeyDown}
                  style={{ maxWidth: '110px' }}
                />
              </div>

              {/* Price */}
              <div style={styles.activeRow}>
                <label style={styles.activeLabel}>Price:</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={activeProduct.isPriceEdited ? activeProduct.editedPrice : basePriceOf(variant)}
                    onChange={e => { updateActive('editedPrice', e.target.value); updateActive('isPriceEdited', true) }}
                    style={{ maxWidth: '110px' }}
                  />
                  {activeProduct.isPriceEdited && (
                    <span style={styles.editedTag}>✏️ Edited</span>
                  )}
                </div>
              </div>

              {/* Total preview */}
              <div style={styles.activeRow}>
                <label style={styles.activeLabel}>Total:</label>
                <span style={{ color: '#16a34a', fontWeight: '700', fontSize: '15px' }}>
                  Rs. {currentTotal.toFixed(2)}
                </span>
              </div>

              {/* Add to Cart button */}
              <button
                className="btn btn-primary btn-block"
                onClick={confirmAddToCart}
                style={{ marginTop: '6px' }}
              >
                + Add to Cart (or press Enter)
              </button>
            </div>
          )}

          {/* Cart items */}
          <div style={styles.cartArea}>
            {cart.length === 0 && !activeProduct ? (
              <div style={styles.emptyCart}>
                <span style={{ fontSize: '36px' }}>🛒</span>
                <p style={{ color: '#9ca3af', marginTop: '8px', fontSize: '13px' }}>No items in cart</p>
              </div>
            ) : (
              <table style={styles.cartTable}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={styles.cartTh}>Item</th>
                    <th style={{ ...styles.cartTh, textAlign: 'center' }}>Qty</th>
                    <th style={{ ...styles.cartTh, textAlign: 'right' }}>Price</th>
                    <th style={{ ...styles.cartTh, textAlign: 'right' }}>Total</th>
                    <th style={styles.cartTh}></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map(item => (
                    <CartRow
                      key={item.cartId}
                      item={item}
                      onRemove={removeFromCart}
                      onUpdateQty={updateCartQty}
                      onUpdatePrice={updateCartPrice}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Customer */}
          <div style={styles.billField}>
            <label style={styles.billLabel}>Customer:</label>
            <input
              className="input"
              placeholder="Optional name"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
            />
          </div>

          {/* Cash */}
          <div style={styles.billField}>
            <label style={styles.billLabel}>Cash:</label>
            <input
              ref={cashRef}
              className="input"
              type="number"
              step="0.01"
              placeholder="Amount received"
              value={cashPaid}
              onChange={e => setCashPaid(e.target.value)}
              onKeyDown={e => {
  if (e.key === 'Enter') {
    e.preventDefault()
    const cash = parseFloat(cashPaid)
    if (!cashPaid || isNaN(cash)) {
      setErrors(['Please enter cash amount.'])
      return
    }
    if (cash < grandTotal) {
      setErrors([`Insufficient cash. Short by Rs. ${(grandTotal - cash).toFixed(2)}`])
      return
    }
    handleSaveBill(false, true)  // save only, no print, no confirm
  }
}}
              style={{ textAlign: 'right' }}
            />
          </div>

          {/* Change */}
          <div style={styles.changeRow}>
            <span style={{ color: '#2563eb', fontWeight: '600' }}>Change:</span>
            <span style={{ color: '#2563eb', fontWeight: '700' }}>{formatCurrency(change)}</span>
          </div>

          {/* Total */}
          <div style={styles.totalRow}>
            <span style={{ fontWeight: '700', fontSize: '16px' }}>Total</span>
            <span style={{ color: '#16a34a', fontWeight: '800', fontSize: '22px' }}>{formatCurrency(grandTotal)}</span>
          </div>

          {totalDiscount > 0 && (
            <div style={{ textAlign: 'right', fontSize: '12px', color: '#d97706', marginBottom: '4px' }}>
              Total Discount: {formatCurrency(totalDiscount)}
            </div>
          )}

          {/* Bill errors */}
          {errors.length > 0 && !activeProduct && (
            <div className="alert alert-error">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-outline btn-sm" onClick={clearCart} style={{ minWidth: '65px' }}>
              Clear
            </button>
                          <button
                className="btn btn-warning btn-sm"
                onClick={() => setShowCustomerBill(true)}
                disabled={cart.length === 0}
              >
                👥 Add to Customer Bill
              </button>
                          <button
              className="btn btn-primary btn-block btn-lg"
              onClick={() => handleSaveBill(false)}
              disabled={saving || cart.length === 0}
            >
              {saving ? 'Saving...' : '🖨️ Print Bill / Save Bill'}
            </button>
          </div>
          <div style={styles.hint}>Ctrl = direct print · Shift = focus cash</div>
        </div>
      </div>

      {/* ── BOTTOM ROW ── */}
      <div style={styles.bottomRow}>
        <div style={{ minWidth: 0 }}><LowStockAlert /></div>
        <div style={{ minWidth: 0 }}><ExpiryWarning /></div>
      </div>

      {showTodaySales && <TodaySalesModal onClose={() => setShowTodaySales(false)} />}

      {showCustomerBill && (
  <CustomerBillModal
    cart={cart}
    grandTotal={grandTotal}
    totalDiscount={totalDiscount}
    billedBy={user?.username}
    userId={user?.userId}
    onClose={() => setShowCustomerBill(false)}
    onSuccess={async (result) => {
      setShowCustomerBill(false)
      setCart([])
      setCustomerName('')
      setCashPaid('')
      setActiveProduct(null)
      setSuccessMsg(`Customer bill saved for ${result.customerName}`)
      setTimeout(() => setSuccessMsg(''), 3000)
      await refreshTodayTotal()
      await refreshAlerts()
      focusSearch()
    }}
  />
)}
    </div>
  )
}

// ── Cart Row ──────────────────────────────────────────────────────────────────
function CartRow({ item, onRemove, onUpdateQty, onUpdatePrice }) {
  const [editingPrice, setEditingPrice] = useState(false)
  const [tempPrice, setTempPrice] = useState('')

  const startEdit = () => { setTempPrice(String(item.soldPrice)); setEditingPrice(true) }
  const saveEdit = () => {
    const p = parseFloat(tempPrice)
    if (!isNaN(p) && p > 0) onUpdatePrice(item.cartId, p)
    setEditingPrice(false)
  }

  return (
    <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
      <td style={styles.cartTd}>
        <div style={{ fontWeight: '500', fontSize: '13px' }}>{item.productName}</div>
        <div style={{ fontSize: '11px', color: '#6b7280', display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{item.productCode}</span><span>·</span><span>{item.variantName}</span>
          {item.isPriceEdited && <span style={styles.discTag}>✏️ disc</span>}
        </div>
      </td>
      <td style={{ ...styles.cartTd, textAlign: 'center' }}>
        <div style={styles.qtyControls}>
          <button style={styles.qtyBtn} onClick={() => onUpdateQty(item.cartId, item.qty - 1)}>−</button>
          <span style={{ minWidth: '22px', textAlign: 'center', fontWeight: '600', fontSize: '13px' }}>{item.qty}</span>
          <button style={styles.qtyBtn} onClick={() => onUpdateQty(item.cartId, item.qty + 1)}>+</button>
        </div>
      </td>
      <td style={{ ...styles.cartTd, textAlign: 'right' }}>
        {editingPrice ? (
          <input
            type="number" step="0.01" value={tempPrice}
            onChange={e => setTempPrice(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={e => e.key === 'Enter' && saveEdit()}
            style={styles.priceInput} autoFocus
          />
        ) : (
          <span
            style={{ cursor: 'pointer', textDecoration: 'underline dotted', fontSize: '13px', color: item.isPriceEdited ? '#d97706' : '#111827' }}
            onClick={startEdit} title="Click to edit price"
          >
            Rs.{item.soldPrice.toFixed(2)}
          </span>
        )}
      </td>
      <td style={{ ...styles.cartTd, textAlign: 'right', fontWeight: '600', color: '#16a34a', fontSize: '13px' }}>
        Rs.{item.lineTotal.toFixed(2)}
      </td>
      <td style={styles.cartTd}>
        <button style={styles.removeBtn} onClick={() => onRemove(item.cartId)}>✕</button>
      </td>
    </tr>
  )
}


// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  page: {
    display: 'flex', flexDirection: 'column', gap: '16px',
    padding: '16px', height: 'calc(100vh - 52px)',
    overflowY: 'auto', boxSizing: 'border-box'
  },
  topRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' },
  bottomRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' },
  leftCard: { padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' },
  rightCard: { padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' },
  panelTitle: { fontSize: '18px', fontWeight: '600', margin: 0 },
  billHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },

  scanStatus: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' },
  scanDot: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' },

  dropdown: {
    position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0,
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 500,
    maxHeight: '240px', overflowY: 'auto'
  },
  dropRow: {
    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
    padding: '9px 12px', background: 'none', border: 'none',
    borderBottom: '1px solid #f3f4f6', cursor: 'pointer', textAlign: 'left'
  },
  dropCode:    { fontWeight: '700', fontSize: '12px', minWidth: '36px' },
  dropName:    { flex: 1, fontSize: '13px' },
  dropVariant: { fontSize: '11px', background: '#ede9fe', color: '#5b21b6', padding: '1px 6px', borderRadius: '99px' },
  dropPrice:   { fontWeight: '600', color: '#16a34a', fontSize: '12px', minWidth: '75px', textAlign: 'right' },
  dropStock:   { fontSize: '11px', minWidth: '55px', textAlign: 'right' },

  // Active product box — inside RIGHT panel
  activeBox: {
    background: '#f0fdf4', border: '1px solid #86efac',
    borderRadius: '8px', padding: '14px',
    display: 'flex', flexDirection: 'column', gap: '8px'
  },
  activeHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  activeName: { fontWeight: '600', fontSize: '14px' },
  activeCode: { fontSize: '12px', color: '#6b7280' },
  closeBtn: { background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#6b7280' },
  activeRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  activeLabel: { minWidth: '75px', fontSize: '13px', fontWeight: '500', color: '#374151' },
  editedTag: { fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '99px' },

  todayBar: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px' },
  todayAmount: { fontSize: '18px', fontWeight: '700', color: '#2563eb' },

  cartArea: {
    minHeight: '120px', maxHeight: '260px', overflowY: 'auto',
    border: '1px solid #e5e7eb', borderRadius: '8px'
  },
  cartTable: { width: '100%', borderCollapse: 'collapse' },
  cartTh: {
    padding: '7px 10px', fontSize: '10px', fontWeight: '700',
    color: '#6b7280', borderBottom: '1px solid #e5e7eb',
    textTransform: 'uppercase', textAlign: 'left', position: 'sticky', top: 0, background: '#f9fafb'
  },
  cartTd: { padding: '7px 10px', verticalAlign: 'middle' },
  emptyCart: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '30px', color: '#9ca3af' },
  qtyControls: { display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' },
  qtyBtn: { width: '20px', height: '20px', border: '1px solid #d1d5db', borderRadius: '4px', background: '#f9fafb', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  priceInput: { width: '75px', padding: '2px 6px', border: '1px solid #16a34a', borderRadius: '4px', fontSize: '12px', textAlign: 'right' },
  removeBtn: { background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '13px', padding: '2px 4px' },
  discTag: { fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '1px 4px', borderRadius: '99px' },

  billField: { display: 'flex', alignItems: 'center', gap: '10px' },

  // ── WHOLESALE ──
  wholesaleBox: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '10px 12px', borderRadius: '8px',
    border: '1px solid #e5e7eb', background: '#f9fafb',
    cursor: 'pointer', userSelect: 'none'
  },
  wholesaleBoxOn: {
    border: '2px solid #f59e0b', background: '#fffbeb'
  },
  wholesaleTag: {
    fontSize: '10px', fontWeight: '800', letterSpacing: '0.5px',
    background: '#f59e0b', color: '#fff',
    padding: '3px 8px', borderRadius: '99px'
  },
  billLabel: { fontWeight: '600', minWidth: '72px', fontSize: '14px' },
  changeRow: { display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '4px 0' },
  totalRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid #e5e7eb', borderBottom: '2px solid #e5e7eb', marginBottom: '4px' },
  hint: { fontSize: '10px', color: '#9ca3af', textAlign: 'center', marginTop: '4px' }
}