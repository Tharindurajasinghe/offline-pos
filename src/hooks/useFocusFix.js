import { useEffect } from 'react'

export function useFocusFix() {
  useEffect(() => {
    const fix = (e) => {
      const el = e.target
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        requestAnimationFrame(() => {
          el.focus()
        })
      }
    }
    document.addEventListener('click', fix, true)
    return () => document.removeEventListener('click', fix, true)
  }, [])
}