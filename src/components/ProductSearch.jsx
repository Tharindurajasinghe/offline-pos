import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'

const ProductSearch = forwardRef(({ onProductSelect, onBarcodeDetected }, ref) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const searchTimeout = useRef(null)

  // Expose focus method to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus()
    },
    clear: () => {
      setQuery('')
      setResults([])
      setShowDropdown(false)
    }
  }))

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        !inputRef.current?.contains(e.target)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleChange = async (e) => {
    const val = e.target.value
    setQuery(val)
    setHighlightedIndex(0)

    if (!val.trim()) {
      setResults([])
      setShowDropdown(false)
      return
    }

    // Debounce search
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setLoading(true)
      const result = await window.api.searchProduct(val.trim())
      setLoading(false)

      if (result.success && result.data.length > 0) {
        setResults(result.data)
        setShowDropdown(true)

        // Barcode exact match — auto select instantly
        const exactBarcode = result.data.find(r => r.barcode === val.trim())
        if (exactBarcode) {
          setShowDropdown(false)
          setResults([])
          setQuery('')
          if (onBarcodeDetected) onBarcodeDetected(exactBarcode)
          return
        }
      } else {
        setResults([])
        setShowDropdown(false)
      }
    }, 120)
  }

  const handleKeyDown = (e) => {
    if (!showDropdown) {
      if (e.key === 'Enter' && query.trim()) {
        // Try search on enter even if dropdown not shown
        handleEnterSearch()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev => Math.min(prev + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (results[highlightedIndex]) {
          selectResult(results[highlightedIndex])
        }
        break
      case 'Escape':
        setShowDropdown(false)
        setQuery('')
        setResults([])
        break
      default:
        break
    }
  }

  const handleEnterSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    const result = await window.api.searchProduct(query.trim())
    setLoading(false)
    if (result.success && result.data.length > 0) {
      if (result.data.length === 1) {
        selectResult(result.data[0])
      } else {
        setResults(result.data)
        setShowDropdown(true)
      }
    }
  }

  const selectResult = (row) => {
    // Group all variants for this product from results
    const allVariants = results.filter(r => r.product_code === row.product_code)
    const product = {
      id: row.id,
      productId: row.id,
      productCode: row.product_code,
      productName: row.product_name,
      categoryName: row.category_name,
      variants: allVariants.map(v => ({
        variant_id: v.variant_id,
        variant_name: v.variant_name,
        unit: v.unit,
        stock: v.stock,
        buying_price: v.buying_price,
        selling_price: v.selling_price,
        barcode: v.barcode
      })),
      // Default to clicked variant
      defaultVariantId: row.variant_id
    }
    setQuery('')
    setResults([])
    setShowDropdown(false)
    if (onProductSelect) onProductSelect(product)
  }

  const getStockColor = (stock, threshold = 5) => {
    if (stock <= 0) return '#dc2626'
    if (stock <= threshold) return '#d97706'
    return '#16a34a'
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.inputWrapper}>
        <input
          ref={inputRef}
          style={styles.input}
          type="text"
          placeholder="Search by Product ID or Name..."
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <div style={styles.loadingDot} />}
      </div>

      {/* Dropdown */}
      {showDropdown && results.length > 0 && (
        <div ref={dropdownRef} style={styles.dropdown}>
          {/* Group by product */}
          {groupByProduct(results).map((group, gi) => (
            <div key={gi}>
              {/* Product header */}
              <div style={styles.groupHeader}>
                <span style={styles.groupCode}>{group.productCode}</span>
                <span style={styles.groupName}>{group.productName}</span>
                <span style={styles.groupCategory}>{group.categoryName}</span>
              </div>

              {/* Variants */}
              {group.variants.map((v, vi) => {
                const globalIndex = getGlobalIndex(results, group.productCode, vi)
                const isHighlighted = globalIndex === highlightedIndex
                return (
                  <button
                    key={vi}
                    style={{
                      ...styles.variantRow,
                      ...(isHighlighted ? styles.variantRowHighlighted : {})
                    }}
                    onClick={() => selectResult(v)}
                    onMouseEnter={() => setHighlightedIndex(globalIndex)}
                  >
                    <span style={styles.variantName}>
                      {v.variant_name}
                    </span>
                    <span style={styles.variantUnit}>{v.unit}</span>
                    <span style={styles.variantPrice}>
                      Rs. {parseFloat(v.selling_price).toFixed(2)}
                    </span>
                    <span style={{
                      ...styles.variantStock,
                      color: getStockColor(v.stock)
                    }}>
                      Stock: {v.stock}
                    </span>
                    {v.barcode && (
                      <span style={styles.variantBarcode}>🔖</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}

          <div style={styles.dropdownHint}>
            ↑↓ Navigate · Enter to select · Esc to close
          </div>
        </div>
      )}
    </div>
  )
})

// Helper: group flat results by product
function groupByProduct(results) {
  const map = {}
  results.forEach(r => {
    if (!map[r.product_code]) {
      map[r.product_code] = {
        productCode: r.product_code,
        productName: r.product_name,
        categoryName: r.category_name,
        variants: []
      }
    }
    map[r.product_code].variants.push(r)
  })
  return Object.values(map)
}

// Helper: get global flat index for keyboard nav
function getGlobalIndex(results, productCode, variantIndex) {
  let index = 0
  let found = false
  const groups = groupByProduct(results)
  for (const group of groups) {
    if (group.productCode === productCode) {
      index += variantIndex
      found = true
      break
    }
    index += group.variants.length
  }
  return found ? index : 0
}

ProductSearch.displayName = 'ProductSearch'

export default ProductSearch

const styles = {
  wrapper: {
    position: 'relative',
    width: '100%'
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    border: '2px solid #16a34a',
    borderRadius: '8px',
    fontSize: '15px',
    background: '#fff',
    outline: 'none',
    color: '#111827',
    fontFamily: 'inherit'
  },
  loadingDot: {
    position: 'absolute',
    right: '12px',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#16a34a',
    animation: 'pulse 1s infinite'
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    zIndex: 1000,
    maxHeight: '320px',
    overflowY: 'auto'
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px 4px',
    background: '#f9fafb',
    borderBottom: '1px solid #f3f4f6',
    position: 'sticky',
    top: 0
  },
  groupCode: {
    fontWeight: '800',
    fontSize: '13px',
    color: '#111827',
    minWidth: '36px'
  },
  groupName: {
    fontWeight: '600',
    fontSize: '13px',
    color: '#111827',
    flex: 1
  },
  groupCategory: {
    fontSize: '11px',
    background: '#dbeafe',
    color: '#1e40af',
    padding: '2px 7px',
    borderRadius: '99px'
  },
  variantRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '9px 14px 9px 24px',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid #f9fafb',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '13px',
    transition: 'background 0.1s'
  },
  variantRowHighlighted: {
    background: '#f0fdf4'
  },
  variantName: {
    flex: 1,
    color: '#374151',
    fontWeight: '500'
  },
  variantUnit: {
    fontSize: '11px',
    background: '#f3f4f6',
    color: '#4b5563',
    padding: '2px 6px',
    borderRadius: '4px'
  },
  variantPrice: {
    fontWeight: '700',
    color: '#16a34a',
    minWidth: '90px',
    textAlign: 'right'
  },
  variantStock: {
    fontSize: '11px',
    minWidth: '65px',
    textAlign: 'right'
  },
  variantBarcode: {
    fontSize: '12px'
  },
  dropdownHint: {
    padding: '6px 14px',
    fontSize: '10px',
    color: '#9ca3af',
    borderTop: '1px solid #f3f4f6',
    textAlign: 'center'
  }
}