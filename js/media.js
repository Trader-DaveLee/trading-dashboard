export function isEmbeddedImageSource(value) {
  return /^data:image\//i.test(String(value || '').trim());
}

export function isImageLikeUrl(value) {
  const raw = String(value || '').trim();
  return isEmbeddedImageSource(raw) || /^blob:/i.test(raw) || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(raw);
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file provided'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function extractImageFilesFromClipboardEvent(event) {
  const items = Array.from(event?.clipboardData?.items || []);
  return items
    .filter(it => it.kind === 'file' && /^image\//i.test(it.type))
    .map(it => it.getAsFile())
    .filter(Boolean);
}

export function extractImageFileFromClipboardEvent(event) {
  return extractImageFilesFromClipboardEvent(event)[0] || null;
}

export function extractImageFilesFromDropEvent(event) {
  const files = Array.from(event?.dataTransfer?.files || []);
  return files.filter(file => /^image\//i.test(file.type));
}

export function extractImageFileFromDropEvent(event) {
  return extractImageFilesFromDropEvent(event)[0] || null;
}
