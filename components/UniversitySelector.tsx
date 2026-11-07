import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, Building2, X } from 'lucide-react';
import { NIGERIAN_UNIVERSITIES, NigerianUniversity, filterNigerianUniversities } from '../utils/nigerianUniversities';

interface UniversitySelectorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export const UniversitySelector: React.FC<UniversitySelectorProps> = ({
  value,
  onChange,
  placeholder = 'Select or search your institution...',
  required = false,
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered universities based on current search query
  const filteredUniversities = useMemo(() => {
    return filterNigerianUniversities(searchQuery);
  }, [searchQuery]);

  const handleSelect = (uniName: string) => {
    onChange(uniName);
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleOpenDropdown = () => {
    if (disabled) return;
    setIsOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Enter' && isOpen && filteredUniversities.length > 0) {
      e.preventDefault();
      handleSelect(filteredUniversities[0].name);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Hidden input for HTML form validation */}
      {required && (
        <input
          type="text"
          value={value}
          required={required}
          onChange={() => {}}
          tabIndex={-1}
          className="absolute opacity-0 pointer-events-none -bottom-1 left-0 h-0 w-0"
        />
      )}

      {/* Trigger Button / Input Display */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={handleOpenDropdown}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpenDropdown();
          }
        }}
        className={`w-full min-h-[44px] px-3 py-2 bg-white dark:bg-slate-800 border rounded-lg text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors shadow-xs ${
          isOpen
            ? 'border-[#2563EB] ring-2 ring-[#2563EB]/15'
            : 'border-[#E5E7EB] dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Search size={15} className="text-[#5B6472] dark:text-slate-400 shrink-0" />
          <span
            className={`truncate ${
              value
                ? 'text-[#111827] dark:text-white font-medium'
                : 'text-[#5B6472] dark:text-slate-400'
            }`}
          >
            {value || placeholder}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear university selection"
              className="p-1 text-[#5B6472] hover:text-[#111827] dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X size={13} />
            </button>
          )}
          <ChevronDown
            size={15}
            className={`text-[#5B6472] dark:text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </div>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          className="absolute z-50 left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg shadow-lg overflow-hidden animate-in fade-in-50 zoom-in-95 duration-100"
          onKeyDown={handleKeyDown}
        >
          {/* Search Header inside selector */}
          <div className="p-2 border-b border-[#E5E7EB] dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70">
            <div className="relative flex items-center">
              <Search
                size={14}
                className="absolute left-2.5 text-[#5B6472] dark:text-slate-400 pointer-events-none"
              />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type university name or acronym (e.g. UNILAG, OAU, Covenant)..."
                className="w-full pl-8 pr-7 py-2 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-md text-xs text-[#111827] dark:text-white placeholder-[#5B6472] outline-none focus:border-[#2563EB]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search text"
                  className="absolute right-2 p-1 text-[#5B6472] hover:text-[#111827] dark:hover:text-white"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between px-1 pt-1.5 text-[10px] text-[#5B6472] dark:text-slate-400">
              <span>{filteredUniversities.length} institutions</span>
              <span>Federal · State · Private</span>
            </div>
          </div>

          {/* List of Universities */}
          <div
            role="listbox"
            className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-1"
          >
            {filteredUniversities.length > 0 ? (
              filteredUniversities.map((uni: NigerianUniversity) => {
                const isSelected = value.toLowerCase() === uni.name.toLowerCase();
                return (
                  <div
                    key={uni.name}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(uni.name)}
                    className={`flex items-start justify-between gap-2 px-3 py-2.5 rounded-md text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#EFF6FF] dark:bg-blue-950/40 text-[#2563EB] font-semibold'
                        : 'text-[#111827] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="truncate">{uni.name}</span>
                        {uni.acronym && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-[#5B6472] dark:text-slate-300 rounded">
                            {uni.acronym}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#5B6472] dark:text-slate-400 flex items-center gap-2 mt-0.5">
                        <span
                          className={`font-medium ${
                            uni.type === 'Federal'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : uni.type === 'State'
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-purple-600 dark:text-purple-400'
                          }`}
                        >
                          {uni.type}
                        </span>
                        <span>•</span>
                        <span>{uni.state} State</span>
                      </div>
                    </div>

                    {isSelected && (
                      <Check size={14} className="text-[#2563EB] shrink-0 mt-0.5" />
                    )}
                  </div>
                );
              })
            ) : (
              // Empty State
              <div className="p-4 text-center space-y-2">
                <div className="w-8 h-8 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#5B6472]">
                  <Building2 size={16} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[#111827] dark:text-white">
                    No matching university found
                  </p>
                  <p className="text-[11px] text-[#5B6472] dark:text-slate-400">
                    "{searchQuery}" is not in the recognised universities directory.
                  </p>
                </div>
                {searchQuery.trim().length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleSelect(searchQuery.trim())}
                    className="mt-2 px-3 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-medium rounded-md cursor-pointer transition-colors"
                  >
                    Use "{searchQuery.trim()}" anyway
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UniversitySelector;
