import { useRef, useEffect, useState, useCallback } from 'react';
import type { TextLayer } from '@orra/shared';
import { computeOverlayGeometry } from './textEditHelpers';

interface Props {
  layer: TextLayer;
  frameW: number;
  frameH: number;
  docW: number;
  docH: number;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

export default function TextEditOverlay({ layer, frameW, frameH, docW, docH, onCommit, onCancel }: Props) {
  const [text, setText] = useState(layer.content);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(layer.content);
  const exitedRef = useRef(false);

  // Keep textRef in sync with state
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const doCommit = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    onCommit(textRef.current);
  }, [onCommit]);

  const doCancel = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    onCancel();
  }, [onCancel]);

  // Auto-focus on mount; commit on unmount if not already exited
  useEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.focus();
      ta.select();
    }
    return () => {
      if (!exitedRef.current) {
        exitedRef.current = true;
        onCommit(textRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { left, top, width, height, scale } = computeOverlayGeometry(layer, frameW, frameH, docW, docH);

  return (
    <textarea
      ref={taRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={doCommit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          doCancel();
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          doCommit();
          return;
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          doCommit();
          return;
        }
      }}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        minHeight: height,
        fontFamily: layer.fontFamily,
        fontSize: `${layer.fontSize * scale}px`,
        fontWeight: layer.fontWeight,
        color: layer.color,
        textAlign: layer.align as React.CSSProperties['textAlign'],
        lineHeight: layer.lineHeight,
        letterSpacing: `${(layer.letterSpacing ?? 0) * scale}px`,
        background: 'transparent',
        border: 'none',
        outline: '2px solid rgba(53,78,83,0.75)',
        borderRadius: '3px',
        resize: 'none',
        overflow: 'hidden',
        padding: 0,
        margin: 0,
        boxSizing: 'border-box',
        zIndex: 20,
        caretColor: layer.color,
      }}
    />
  );
}
