class Validator {
  // Bill validation before save/print
  static validateBill({ items, cashPaid, grandTotal }) {
    const errors = []

    if (!items || items.length === 0) {
      errors.push('Cart is empty. Add at least one item.')
    }

    if (grandTotal <= 0) {
      errors.push('Grand total must be greater than 0.')
    }

    if (!cashPaid || cashPaid === '' || isNaN(parseFloat(cashPaid))) {
      errors.push('Cash paid field is required.')
    } else if (parseFloat(cashPaid) < grandTotal) {
      errors.push(`Cash paid (Rs. ${parseFloat(cashPaid).toFixed(2)}) is less than total (Rs. ${grandTotal.toFixed(2)}).`)
    }

    // Check each item
    if (items) {
      for (const item of items) {
        if (item.isPriceEdited && item.soldPrice < item.buyingPrice) {
          errors.push(`Edited price for "${item.variantName}" must be ≥ buying price (Rs. ${item.buyingPrice}).`)
        }
        if (item.qty <= 0) {
          errors.push(`Quantity for "${item.variantName}" must be greater than 0.`)
        }
        if (item.qty > item.stock) {
          errors.push(`Insufficient stock for "${item.variantName}". Available: ${item.stock}.`)
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }

  // Product form validation
  static validateProduct({ name, categoryId, variants }) {
    const errors = []

    if (!name || !name.trim()) errors.push('Product name is required.')
    if (!categoryId) errors.push('Category is required.')
    if (!variants || variants.length === 0) errors.push('At least one variant is required.')

    if (variants) {
      variants.forEach((v, i) => {
        const label = v.name || `Variant ${i + 1}`
        if (v.sellingPrice === '' || isNaN(parseFloat(v.sellingPrice))) {
          errors.push(`Selling price is required for ${label}.`)
        }
        if (v.buyingPrice === '' || isNaN(parseFloat(v.buyingPrice))) {
          errors.push(`Buying price is required for ${label}.`)
        }
        if (parseFloat(v.sellingPrice) < parseFloat(v.buyingPrice)) {
          errors.push(`Selling price must be ≥ buying price for ${label}.`)
        }
        if (v.stock === '' || isNaN(parseInt(v.stock))) {
          errors.push(`Stock is required for ${label}.`)
        }
        // ── WHOLESALE ── optional, but if set it must cover the buying price
        if (v.wholesalePrice !== '' && v.wholesalePrice !== undefined && v.wholesalePrice !== null) {
          const wp = parseFloat(v.wholesalePrice)
          if (!isNaN(wp) && wp > 0 && wp < parseFloat(v.buyingPrice)) {
            errors.push(`Wholesale price must be ≥ buying price for ${label}.`)
          }
        }
      })
    }

    return { valid: errors.length === 0, errors }
  }

  // Category validation
  static validateCategory({ name }) {
    const errors = []
    if (!name || !name.trim()) errors.push('Category name is required.')
    if (name && name.trim().length > 50) errors.push('Category name must be under 50 characters.')
    return { valid: errors.length === 0, errors }
  }

  // User validation
  static validateUser({ username, password, isNew = true }) {
    const errors = []
    if (!username || !username.trim()) errors.push('Username is required.')
    if (username && username.trim().length < 3) errors.push('Username must be at least 3 characters.')
    if (isNew) {
      if (!password) errors.push('Password is required.')
      if (password && password.length < 4) errors.push('Password must be at least 4 characters.')
    }
    return { valid: errors.length === 0, errors }
  }

  // Price edit validation during billing
  static validatePriceEdit(newPrice, buyingPrice) {
    const np = parseFloat(newPrice)
    const bp = parseFloat(buyingPrice)
    if (isNaN(np)) return { valid: false, message: 'Invalid price' }
    if (np < bp) return { valid: false, message: `Price must be ≥ buying price (Rs. ${bp.toFixed(2)})` }
    if (np <= 0) return { valid: false, message: 'Price must be greater than 0' }
    return { valid: true }
  }
}

export default Validator