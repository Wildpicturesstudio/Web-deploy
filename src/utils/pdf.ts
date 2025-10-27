import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export interface GeneratePdfOptions {
  quality?: number; // 0..1 JPEG quality
  scale?: number;   // html2canvas scale
  returnType?: 'url' | 'blob';
  marginTopPt?: number;
  marginBottomPt?: number;
  longSinglePage?: boolean; // if true, render one very tall page, no side margins
}

export async function generatePDF(element: HTMLElement, opts: GeneratePdfOptions = {}): Promise<string | Blob> {
  const quality = Math.max(0.3, Math.min(1, opts.quality ?? 0.6));
  const scale = Math.max(1, Math.min(3, opts.scale ?? (typeof window !== 'undefined' && (window.devicePixelRatio || 0) > 1 ? Math.min(3, window.devicePixelRatio) : 2)));
  const marginTopPt = Math.max(0, opts.marginTopPt ?? 20);
  const marginBottomPt = Math.max(0, opts.marginBottomPt ?? 20);

  // Render the full element preserving styles
  const canvas = await html2canvas(element, { scale, useCORS: true, backgroundColor: '#ffffff' });

  // If long single-page requested, render one tall page without side margins
  if (opts.longSinglePage) {
    const imgWidthPx = canvas.width;
    const imgHeightPx = canvas.height;
    const targetWidthPt = 595; // A4 width in pt
    const ratio = targetWidthPt / imgWidthPx;
    const renderHeightPt = imgHeightPx * ratio;

    const pdf = new jsPDF({ unit: 'pt', format: [targetWidthPt, Math.max(50, renderHeightPt)], compress: false });
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, targetWidthPt, renderHeightPt);
    const blob = pdf.output('blob') as Blob;
    if (opts.returnType === 'blob') return blob;
    return URL.createObjectURL(blob);
  }

  // Create A4 PDF (multi-page)
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: false });
  const pageWidthPt = pdf.internal.pageSize.getWidth();
  const pageHeightPt = pdf.internal.pageSize.getHeight();

  // Scale factor from canvas px -> PDF pt (fit width)
  const imgWidthPx = canvas.width;
  const imgHeightPx = canvas.height;
  const ratio = pageWidthPt / imgWidthPx;
  const usableHeightPx = Math.floor((pageHeightPt - marginTopPt - marginBottomPt) / ratio);

  // Build block boundaries using markers when available, else immediate children
  const parentRect = element.getBoundingClientRect();
  const markerEls = Array.from(element.querySelectorAll('[data-pdf-block]')) as HTMLElement[];
  const sectionEls = markerEls.length ? markerEls : Array.from(element.children) as HTMLElement[];
  let blocks: { startPx: number; endPx: number }[] = sectionEls
    .map((child) => {
      const r = child.getBoundingClientRect();
      const top = Math.max(0, (r.top - parentRect.top) * scale);
      const bottom = Math.min(imgHeightPx, (r.bottom - parentRect.top) * scale);
      return { startPx: Math.floor(top), endPx: Math.ceil(bottom) };
    })
    .filter((b) => b.endPx > b.startPx);

  // Fallback to single block if structure is flat
  if (!blocks.length) {
    blocks = [{ startPx: 0, endPx: imgHeightPx }];
  }

  // Merge overlapping/adjacent blocks to avoid micro-slices
  blocks.sort((a, b) => a.startPx - b.startPx);
  const merged: { startPx: number; endPx: number }[] = [];
  for (const b of blocks) {
    if (!merged.length) merged.push({ ...b });
    else {
      const last = merged[merged.length - 1];
      if (b.startPx <= last.endPx + 2) last.endPx = Math.max(last.endPx, b.endPx);
      else merged.push({ ...b });
    }
  }

  // Pack blocks into A4 pages without splitting; if a single block exceeds capacity, split that block only
  const capacity = usableHeightPx;
  const pages: { slices: { startPx: number; heightPx: number }[] }[] = [];
  let current: { slices: { startPx: number; heightPx: number }[]; used: number } = { slices: [], used: 0 };

  const pushPage = () => {
    if (current.slices.length) pages.push({ slices: current.slices });
    current = { slices: [], used: 0 };
  };

  const pushSlice = (startPx: number, heightPx: number) => {
    if (heightPx > capacity) {
      // Split this large block across multiple pages
      let remaining = heightPx;
      let offset = 0;
      while (remaining > 0) {
        const take = Math.min(capacity, remaining);
        if (current.used + take > capacity && current.used > 0) pushPage();
        current.slices.push({ startPx: startPx + offset, heightPx: take });
        current.used += take;
        if (current.used >= capacity) pushPage();
        remaining -= take;
        offset += take;
      }
    } else {
      if (current.used + heightPx > capacity && current.used > 0) pushPage();
      current.slices.push({ startPx, heightPx });
      current.used += heightPx;
      if (current.used >= capacity) pushPage();
    }
  };

  for (const b of merged) {
    const h = b.endPx - b.startPx;
    pushSlice(b.startPx, h);
  }
  pushPage();

  // Draw each page by stitching its slices into a page-sized image (leaves blank space if not filled)
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    const page = pages[i];
    const usedHeightPx = page.slices.reduce((s, sl) => s + sl.heightPx, 0);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = imgWidthPx;
    pageCanvas.height = usedHeightPx;
    const pageCtx = pageCanvas.getContext('2d');
    if (!pageCtx) throw new Error('Page canvas 2D context not available');
    pageCtx.fillStyle = '#ffffff';
    pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

    let y = 0;
    for (const sl of page.slices) {
      pageCtx.drawImage(canvas, 0, sl.startPx, imgWidthPx, sl.heightPx, 0, y, imgWidthPx, sl.heightPx);
      y += sl.heightPx;
    }

    const imgData = pageCanvas.toDataURL('image/png');
    const renderHeightPt = usedHeightPx * ratio;
    pdf.addImage(imgData, 'PNG', 0, marginTopPt, pageWidthPt, renderHeightPt);
  }

  const blob = pdf.output('blob') as Blob;
  if (opts.returnType === 'blob') return blob;
  return URL.createObjectURL(blob);
}
