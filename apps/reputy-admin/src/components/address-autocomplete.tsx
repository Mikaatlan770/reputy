'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { MapPin, Loader2, X } from 'lucide-react'
import { usePlacesAutocomplete, type PlaceGeometry } from '@/lib/competitors/use-competitors'

interface AddressAutocompleteProps {
  /** Current address value */
  value: string
  /** Called when user selects a suggestion and geometry is resolved */
  onSelect: (place: PlaceGeometry) => void
  /** Called when input text changes (optional) */
  onInputChange?: (value: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Disabled state */
  disabled?: boolean
  /** className for the wrapper */
  className?: string
}

/**
 * Address autocomplete component using Google Places API (proxied via backend).
 * 
 * When user types 3+ characters, fetches suggestions from backend.
 * When a suggestion is selected, resolves geometry (lat/lng) and calls onSelect.
 */
export function AddressAutocomplete({
  value,
  onSelect,
  onInputChange,
  placeholder = 'Rechercher une adresse...',
  disabled = false,
  className = '',
}: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value || '')
  const [showDropdown, setShowDropdown] = useState(false)
  const [resolving, setResolving] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { suggestions, loading, search, getGeometry, clear } = usePlacesAutocomplete()

  // Sync external value changes
  useEffect(() => {
    setInputValue(value || '')
  }, [value])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      setInputValue(val)
      onInputChange?.(val)

      // Debounce search
      if (debounceRef.current) clearTimeout(debounceRef.current)

      if (val.length >= 3) {
        debounceRef.current = setTimeout(() => {
          search(val)
          setShowDropdown(true)
        }, 350)
      } else {
        clear()
        setShowDropdown(false)
      }
    },
    [search, clear, onInputChange]
  )

  const handleSelect = useCallback(
    async (placeId: string, description: string) => {
      setShowDropdown(false)
      setInputValue(description)
      setResolving(true)

      try {
        const geo = await getGeometry(placeId)
        if (geo) {
          onSelect(geo)
        }
      } catch (err) {
        console.error('Failed to resolve place geometry:', err)
      } finally {
        setResolving(false)
      }
    },
    [getGeometry, onSelect]
  )

  const handleClear = useCallback(() => {
    setInputValue('')
    clear()
    setShowDropdown(false)
    onInputChange?.('')
  }, [clear, onInputChange])

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0) setShowDropdown(true)
          }}
          placeholder={placeholder}
          disabled={disabled || resolving}
          className="pl-9 pr-8"
        />
        {(loading || resolving) && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {!loading && !resolving && inputValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown suggestions */}
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b last:border-b-0 flex items-start gap-3"
              onClick={() => handleSelect(suggestion.placeId, suggestion.description)}
            >
              <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {suggestion.mainText}
                </p>
                {suggestion.secondaryText && (
                  <p className="text-xs text-muted-foreground truncate">
                    {suggestion.secondaryText}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {showDropdown && !loading && inputValue.length >= 3 && suggestions.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg p-4 text-sm text-muted-foreground text-center">
          Aucune adresse trouvée
        </div>
      )}
    </div>
  )
}
