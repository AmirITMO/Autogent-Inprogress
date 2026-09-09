"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function HorizontalScrollbar({
  targetRef,
}: {
  targetRef: React.RefObject<HTMLDivElement | null>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ widthPct: 100, leftPct: 0 });
  const [visible, setVisible] = useState(false);

  const sync = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    setVisible(scrollWidth > clientWidth + 1);
    const widthPct = Math.max((clientWidth / scrollWidth) * 100, 4);
    const maxLeftPct = 100 - widthPct;
    const scrollableRange = scrollWidth - clientWidth;
    const leftPct = scrollableRange > 0 ? (scrollLeft / scrollableRange) * maxLeftPct : 0;
    setThumb({ widthPct, leftPct });
  }, [targetRef]);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync);
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [targetRef, sync]);

  function scrollToClientX(clientX: number) {
    const el = targetRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const rect = track.getBoundingClientRect();
    const widthPct = thumb.widthPct;
    const usable = rect.width * (1 - widthPct / 100);
    const ratio = usable > 0 ? (clientX - rect.left - (rect.width * widthPct) / 100 / 2) / usable : 0;
    el.scrollLeft = Math.max(0, Math.min(1, ratio)) * (el.scrollWidth - el.clientWidth);
  }

  function handleThumbPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = targetRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const trackWidth = track.getBoundingClientRect().width;
    const startX = e.clientX;
    const startScrollLeft = el.scrollLeft;
    const scrollableRange = el.scrollWidth - el.clientWidth;

    function handleMove(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const usable = trackWidth * (1 - thumb.widthPct / 100);
      const delta = usable > 0 ? (dx / usable) * scrollableRange : 0;
      el!.scrollLeft = Math.max(0, Math.min(scrollableRange, startScrollLeft + delta));
    }
    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  if (!visible) return null;

  return (
    <div
      ref={trackRef}
      onPointerDown={(e) => scrollToClientX(e.clientX)}
      className="relative mx-4 h-2.5 shrink-0 cursor-pointer rounded-full bg-surface-2"
    >
      <div
        onPointerDown={handleThumbPointerDown}
        style={{ width: `${thumb.widthPct}%`, left: `${thumb.leftPct}%` }}
        className="absolute top-0 h-2.5 cursor-grab rounded-full bg-border transition-colors hover:bg-accent/50 active:cursor-grabbing active:bg-accent/70"
      />
    </div>
  );
}
