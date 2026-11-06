import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

function renderItemIcon(icon) {
  if (!icon) return null;
  if (React.isValidElement(icon)) {
    return React.cloneElement(icon, {
      size: icon.props?.size || 13,
      style: { flexShrink: 0, ...(icon.props?.style || {}) }
    });
  }
  const IconComponent = icon;
  return <IconComponent size={13} style={{ flexShrink: 0 }} />;
}

export default function ActionsDropdown({
  trigger,
  items = [],
  align = 'right',
  ariaLabel = 'More actions'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, isDropup: false, maxHeight: 360 });

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const menuWidth = 195;
    const activeItemCount = items.filter(Boolean).length;
    const estimatedHeight = Math.min(activeItemCount * 34 + 20, 360);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Drop up if space below is tighter than estimated height AND space above has more room
    const isDropup = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

    const top = isDropup ? rect.top - 4 : rect.bottom + 4;
    let left = align === 'left' ? rect.left : rect.right - menuWidth;

    // Viewport boundaries
    if (left + menuWidth > window.innerWidth - 10) {
      left = window.innerWidth - menuWidth - 10;
    }
    if (left < 10) left = 10;

    const maxHeight = isDropup ? Math.max(120, spaceAbove - 16) : Math.max(120, spaceBelow - 16);

    setCoords({
      top,
      left,
      isDropup,
      maxHeight
    });
  }, [align, items]);

  const toggleOpen = useCallback((e) => {
    e.stopPropagation();
    setIsOpen(prev => !prev);
  }, []);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Update position on open & on window scroll/resize
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e) => {
      const inTrigger = containerRef.current && containerRef.current.contains(e.target);
      const inMenu = menuRef.current && menuRef.current.contains(e.target);
      if (!inTrigger && !inMenu) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen, closeDropdown]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeDropdown();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeDropdown]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {trigger ? (
        React.cloneElement(trigger, {
          onClick: toggleOpen,
          'aria-haspopup': 'menu',
          'aria-expanded': isOpen,
          'aria-label': ariaLabel
        })
      ) : (
        <button
          type="button"
          onClick={toggleOpen}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={ariaLabel}
          className="btn btn-secondary btn-xs"
          style={{
            padding: '3px 6px',
            color: isOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
            backgroundColor: isOpen ? 'rgba(255, 255, 255, 0.08)' : 'var(--bg-surface-raised)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)'
          }}
        >
          <MoreVertical size={13} />
        </button>
      )}

      {isOpen && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            transform: coords.isDropup ? 'translateY(-100%)' : 'none',
            minWidth: '190px',
            maxHeight: `${coords.maxHeight}px`,
            overflowY: 'auto',
            backgroundColor: 'var(--bg-surface-raised, #181d28)',
            border: '1px solid var(--border-default, rgba(255, 255, 255, 0.12))',
            borderRadius: 'var(--radius-md, 8px)',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255, 255, 255, 0.15)',
            zIndex: 999999,
            padding: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
            animation: 'fadeIn 0.12s ease-out'
          }}
        >
          {items.map((item, idx) => {
            if (!item) return null;
            if (item.divider) {
              return (
                <div
                  key={`div-${idx}`}
                  style={{
                    height: '1px',
                    backgroundColor: 'var(--border-subtle, rgba(255, 255, 255, 0.08))',
                    margin: '4px 0'
                  }}
                />
              );
            }

            const Icon = item.icon;
            const isDanger = item.danger;

            return (
              <button
                key={item.id || idx}
                role="menuitem"
                type="button"
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  closeDropdown();
                  if (item.onClick) item.onClick();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: isDanger ? 'var(--accent-rose, #f43f5e)' : 'var(--text-secondary, #cbd5e1)',
                  fontSize: '12px',
                  fontWeight: '500',
                  textAlign: 'left',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  opacity: item.disabled ? 0.5 : 1,
                  transition: 'background-color 0.1s ease, color 0.1s ease'
                }}
                onMouseEnter={(e) => {
                  if (!item.disabled) {
                    e.currentTarget.style.backgroundColor = isDanger
                      ? 'rgba(244, 63, 94, 0.15)'
                      : 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.color = isDanger ? 'var(--accent-rose, #f43f5e)' : 'var(--text-primary, #ffffff)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!item.disabled) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = isDanger ? 'var(--accent-rose, #f43f5e)' : 'var(--text-secondary, #cbd5e1)';
                  }
                }}
              >
                {renderItemIcon(item.icon)}
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && (
                  <span
                    className={`badge badge-${item.badgeVariant || 'blue'}`}
                    style={{ fontSize: '9px', padding: '1px 4px' }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
