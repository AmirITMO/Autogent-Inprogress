"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const PREVIEW_SIZE = 260;
const OUTPUT_SIZE = 320;
const MAX_ZOOM = 3;

export function AvatarCropModal({
  file,
  onCancel,
  onCropped,
}: {
  file: File;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const imgUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imgUrl;
    return () => URL.revokeObjectURL(imgUrl);
  }, [imgUrl]);

  // baseScale — минимальный масштаб, при котором картинка полностью закрывает
  // квадрат превью (object-fit: cover). zoom (1..MAX_ZOOM) накручивается поверх.
  const baseScale = imgSize ? Math.max(PREVIEW_SIZE / imgSize.w, PREVIEW_SIZE / imgSize.h) : 1;
  const scale = baseScale * zoom;
  const dispW = imgSize ? imgSize.w * scale : 0;
  const dispH = imgSize ? imgSize.h * scale : 0;
  const maxOffsetX = Math.max(0, (dispW - PREVIEW_SIZE) / 2);
  const maxOffsetY = Math.max(0, (dispH - PREVIEW_SIZE) / 2);

  function clamp(o: { x: number; y: number }) {
    return {
      x: Math.min(maxOffsetX, Math.max(-maxOffsetX, o.x)),
      y: Math.min(maxOffsetY, Math.max(-maxOffsetY, o.y)),
    };
  }

  function handlePointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset(clamp({ x: dragState.current.origX + dx, y: dragState.current.origY + dy }));
  }
  function handlePointerUp() {
    dragState.current = null;
  }

  function handleZoomChange(v: number) {
    setZoom(v);
    // После смены зума область смещения сузилась/расширилась — поджимаем,
    // чтобы по краям не оставалось пустоты.
    setOffset((o) => clamp(o));
  }

  async function handleConfirm() {
    if (!imgSize || !imgUrl) return;
    setSaving(true);
    const img = new window.Image();
    img.src = imgUrl;
    await new Promise((resolve) => {
      if (img.complete) resolve(null);
      else img.onload = () => resolve(null);
    });

    // Левый верхний угол отображаемой картинки в координатах превью, и обратный
    // пересчёт видимого окна [0,PREVIEW_SIZE] в пиксели исходного изображения.
    const left = PREVIEW_SIZE / 2 - dispW / 2 + offset.x;
    const top = PREVIEW_SIZE / 2 - dispH / 2 + offset.y;
    const sx = -left / scale;
    const sy = -top / scale;
    const sSize = PREVIEW_SIZE / scale;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setSaving(false);
      return;
    }
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    canvas.toBlob(
      (blob) => {
        setSaving(false);
        if (blob) onCropped(blob);
      },
      "image/png",
      0.92
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Обрезка фото</h3>
        <div
          className="relative mx-auto touch-none select-none overflow-hidden rounded-lg bg-surface-2"
          style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, cursor: "grab" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {imgUrl && imgSize && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgUrl}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                left: PREVIEW_SIZE / 2 - dispW / 2 + offset.x,
                top: PREVIEW_SIZE / 2 - dispH / 2 + offset.y,
                width: dispW,
                height: dispH,
                maxWidth: "none",
              }}
            />
          )}
          {/* Круглая маска: сам div — прозрачный круг диаметром PREVIEW_SIZE,
              box-shadow заливает всё вокруг него, обрезано overflow-hidden родителя. */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
          />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-muted">Масштаб</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            className="flex-1"
          />
        </div>
        <p className="mt-2 text-[11px] text-muted">Перетащите фото, чтобы выровнять по лицу</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || !imgSize}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
