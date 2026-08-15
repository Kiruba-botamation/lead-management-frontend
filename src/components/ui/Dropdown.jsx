import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import '../../styles/components/dropdown.css';

/* ============================================================
   Dropdown component — consumes CSS variable tokens
   ============================================================ */

/**
 * Dropdown
 *
 * Props:
 *   trigger   – React node that opens the menu (required)
 *   align     – 'left' | 'right' | 'center'  (default 'left')
 *   direction – 'bottom' | 'top'              (default 'bottom')
 *   portal    – render menu via createPortal to avoid overflow clipping (default false)
 *   children  – <DropdownItem>, <DropdownSection>, <DropdownSeparator> etc.
 */
export function Dropdown({
  trigger,
  align = 'left',
  direction = 'bottom',
  portal = false,
  className = '',
  children,
}) {
  const [open, setOpen]       = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const ref        = useRef(null);
  const triggerRef = useRef(null);
  const menuRef    = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      const inTrigger = ref.current && ref.current.contains(e.target);
      const inMenu    = menuRef.current && menuRef.current.contains(e.target);
      if (!inTrigger && !inMenu) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Compute portal menu position from trigger bounding rect
  const handleOpen = () => {
    if (portal && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const style = { position: 'fixed', zIndex: 9999, minWidth: rect.width };

      if (direction === 'top') {
        style.bottom = window.innerHeight - rect.top;
        style.top    = 'auto';
      } else {
        style.top    = rect.bottom;
        style.bottom = 'auto';
      }

      if (align === 'right') {
        style.right = window.innerWidth - rect.right;
        style.left  = 'auto';
      } else if (align === 'center') {
        style.left = rect.left + rect.width / 2;
        style.transform = 'translateX(-50%)';
      } else {
        style.left  = rect.left;
        style.right = 'auto';
      }

      setMenuStyle(style);
    }
    setOpen((v) => !v);
  };

  const menuClasses = [
    'ds-dropdown__menu',
    portal ? '' : `ds-dropdown__menu--${align}`,
    portal ? '' : `ds-dropdown__menu--${direction}`,
  ].filter(Boolean).join(' ');

  const menu = open && (
    <div
      ref={menuRef}
      className={menuClasses}
      role="menu"
      style={portal ? menuStyle : undefined}
      onMouseDown={portal ? (e) => e.preventDefault() : undefined}
      onClick={() => setOpen(false)}
    >
      {children}
    </div>
  );

  return (
    <div
      ref={ref}
      className={['ds-dropdown', open ? 'ds-dropdown--open' : '', className].filter(Boolean).join(' ')}
    >
      {/* Trigger */}
      <div ref={triggerRef} onClick={handleOpen} aria-haspopup="true" aria-expanded={open}>
        {trigger}
      </div>

      {/* Menu — portalled or inline */}
      {portal ? createPortal(menu, document.body) : menu}
    </div>
  );
}

/** Individual menu item */
export function DropdownItem({
  as: Component = 'button',
  danger = false,
  active = false,
  disabled = false,
  icon,
  shortcut,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'ds-dropdown__item',
    danger   ? 'ds-dropdown__item--danger'  : '',
    active   ? 'ds-dropdown__item--active'  : '',
    disabled ? 'ds-dropdown__item--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const props =
    Component === 'button'
      ? { type: 'button', disabled, ...rest }
      : { 'aria-disabled': disabled || undefined, ...rest };

  return (
    <Component className={classes} role="menuitem" {...props}>
      {icon && <span className="ds-dropdown__item-icon" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
      {shortcut && <kbd className="ds-dropdown__shortcut">{shortcut}</kbd>}
    </Component>
  );
}

/** Thin horizontal rule between groups */
export function DropdownSeparator({ className = '', ...rest }) {
  return <hr className={['ds-dropdown__separator', className].filter(Boolean).join(' ')} {...rest} />;
}

/** Small all-caps label above a group of items */
export function DropdownHeading({ className = '', children, ...rest }) {
  return (
    <div className={['ds-dropdown__heading', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

// ---- Prop types --------------------------------------------------------------
Dropdown.propTypes = {
  trigger:   PropTypes.node.isRequired,
  align:     PropTypes.oneOf(['left', 'right', 'center']),
  direction: PropTypes.oneOf(['bottom', 'top']),
  portal:    PropTypes.bool,
  className: PropTypes.string,
  children:  PropTypes.node,
};

DropdownItem.propTypes = {
  as:        PropTypes.elementType,
  danger:    PropTypes.bool,
  active:    PropTypes.bool,
  disabled:  PropTypes.bool,
  icon:      PropTypes.node,
  shortcut:  PropTypes.string,
  className: PropTypes.string,
  children:  PropTypes.node,
};

DropdownSeparator.propTypes = { className: PropTypes.string };
DropdownHeading.propTypes   = { className: PropTypes.string, children: PropTypes.node };
