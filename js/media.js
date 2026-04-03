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

export function extractImageFileFromClipboardEvent(event) {
  const items = Array.from(event?.clipboardData?.items || []);
  const item = items.find(it => it.kind === 'file' && /^image\//i.test(it.type));
  return item ? item.getAsFile() : null;
}

export function extractImageFileFromDropEvent(event) {
  const files = Array.from(event?.dataTransfer?.files || []);
  return files.find(file => /^image\//i.test(file.type)) || null;
}
