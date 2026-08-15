import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Tooltip — dark theme, matches lead-app-frontend design language.
 *
 * Uses a plain wrapper div + getBoundingClientRect + position:fixed portal.
 * No external positioning library — coordinates are computed directly from
 * the trigger's bounding rect so the tooltip always appears next to the element.
 *
 * @param {React.ReactNode} children   — trigger element
 * @param {string}          content    — tooltip label
 * @param {'top'|'bottom'|'left'|'right'} placement
 * @param {number}          delay      — open delay in ms (default 300)
 * @param {boolean}         disabled   — suppress tooltip entirely
 */
export default function Tooltip({
  children,
  content,
  placement = 'top',
  delay = 300,
  disabled = false,
}) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef(null);
  const timerRef = useRef(null);
  const tooltipRef = useRef(null);

  const GAP = 8; // px between trigger and tooltip

  const computeCoords = useCallback(() => {
    const trigger = wrapperRef.current;
    const tip = tooltipRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const tipW = tip ? tip.offsetWidth : 0;
    const tipH = tip ? tip.offsetHeight : 0;

    let top = 0;
    let left = 0;

    switch (placement) {
      case 'bottom':
        top = rect.bottom + GAP;
        left = rect.left + rect.width / 2 - tipW / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tipH / 2;
        left = rect.left - tipW - GAP;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tipH / 2;
        left = rect.right + GAP;
        break;
      case 'top':
      default:
        top = rect.top - tipH - GAP;
        left = rect.left + rect.width / 2 - tipW / 2;
        break;
    }

    // Clamp to viewport edges
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    left = Math.max(8, Math.min(left, vw - tipW - 8));
    top  = Math.max(8, Math.min(top,  vh - tipH - 8));

    setCoords({ top, left });
  }, [placement]);

  const show = useCallback(() => {
    if (disabled || !content) return;
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  }, [disabled, content, delay]);

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  // Recompute position whenever tooltip becomes visible or window scrolls/resizes
  useEffect(() => {
    if (!visible) return;
    computeCoords();
    window.addEventListener('scroll', computeCoords, true);
    window.addEventListener('resize', computeCoords);
    return () => {
      window.removeEventListener('scroll', computeCoords, true);
      window.removeEventListener('resize', computeCoords);
    };
  }, [visible, computeCoords]);

  // After the tooltip renders, recompute once more so tipW/tipH are real
  useEffect(() => {
    if (visible) computeCoords();
  }, [visible, computeCoords]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!content || disabled) return children;

  return (
    <>
      <span
        ref={wrapperRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onMouseDown={hide}
        onFocus={show}
        onBlur={hide}
        style={{ display: 'inline-flex' }}
      >
        {children}
      </span>

      {visible && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            zIndex: 9999,
            pointerEvents: 'none',
          }}
          className="
            max-w-[220px] break-words
            rounded-lg bg-gray-900 px-3 py-1.5
            ring-1 ring-inset ring-indigo-500/30
            text-xs font-medium leading-snug text-white
            shadow-xl animate-tooltip-in
          "
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  );
}
