import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tiny dependency-free D-pad focus system for TV screens.
 *
 * Buttons are laid out in a single row (Left/Right) or column (Up/Down).
 * `layout: 'row'` moves with Left/Right, `'column'` with Up/Down, `'both'` with all arrows.
 * Enter (or the Fire TV Select key, which arrives as Enter) activates the focused id.
 *
 *   const { focused, bind } = useFocusGroup(['ok', 'msgs', 'help'], { onSelect });
 *   <button {...bind('ok')}>...</button>
 */
export interface FocusGroupOptions {
  onSelect?: (id: string) => void;
  layout?: 'row' | 'column' | 'both';
  initial?: string;
  /** Disable key handling (e.g. when an overlay screen is on top). */
  enabled?: boolean;
  wrap?: boolean;
}

export function useFocusGroup(ids: string[], opts: FocusGroupOptions = {}) {
  const { onSelect, layout = 'row', initial, enabled = true, wrap = false } = opts;
  const [focused, setFocused] = useState<string>(initial ?? ids[0]);
  const refs = useRef(new Map<string, HTMLElement>());
  const idsKey = ids.join('|');

  // If the focused id disappears, fall back to the first one: focus is never lost.
  useEffect(() => {
    if (!ids.includes(focused) && ids.length) setFocused(ids[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    if (enabled) refs.current.get(focused)?.focus({ preventScroll: true });
  }, [focused, enabled]);

  const move = useCallback(
    (delta: number) => {
      setFocused((cur) => {
        const i = ids.indexOf(cur);
        let n = i + delta;
        if (wrap) n = (n + ids.length) % ids.length;
        n = Math.max(0, Math.min(ids.length - 1, n));
        return ids[n] ?? cur;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey, wrap],
  );

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const horiz = layout !== 'column';
      const vert = layout !== 'row';
      switch (e.key) {
        case 'ArrowLeft':
          if (horiz) { e.preventDefault(); move(-1); }
          break;
        case 'ArrowRight':
          if (horiz) { e.preventDefault(); move(1); }
          break;
        case 'ArrowUp':
          if (vert) { e.preventDefault(); move(-1); }
          break;
        case 'ArrowDown':
          if (vert) { e.preventDefault(); move(1); }
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          onSelect?.(focused);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, layout, move, onSelect, focused]);

  const bind = useCallback(
    (id: string) => ({
      ref: (el: HTMLElement | null) => {
        if (el) refs.current.set(id, el);
        else refs.current.delete(id);
      },
      tabIndex: -1,
      'data-focused': focused === id ? 'true' : undefined,
      onClick: () => {
        setFocused(id);
        onSelect?.(id);
      },
      onMouseEnter: () => setFocused(id),
    }),
    [focused, onSelect],
  );

  return { focused, setFocused, bind };
}
