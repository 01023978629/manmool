(function attach(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ManmulOfficePhoto = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPhotoApi() {
  const browser = typeof globalThis !== 'undefined' ? globalThis : {};
  const MAX_BYTES = 2 * 1024 * 1024;
  const MAX_LONGEST_SIDE = 1600;
  const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

  function photoError(code) { const error = new Error(code); error.code = code; return error; }
  function jpegName(name) { return `${String(name || 'photo').replace(/\.[^.]*$/, '') || 'photo'}.jpg`; }
  function blobToBase64(blob, FileReaderCtor) {
    return new Promise((resolve, reject) => {
      const reader = new FileReaderCtor();
      reader.onerror = () => reject(photoError('invalid-file'));
      reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^,]*,/, ''));
      reader.readAsDataURL(blob);
    });
  }
  async function decode(file, env) {
    if (typeof env.createImageBitmap === 'function') return env.createImageBitmap(file);
    if (!env.Image || !env.URL || typeof env.URL.createObjectURL !== 'function') throw photoError('invalid-file');
    return new Promise((resolve, reject) => {
      const url = env.URL.createObjectURL(file);
      const image = new env.Image();
      image.onload = () => { env.URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { env.URL.revokeObjectURL(url); reject(photoError('invalid-file')); };
      image.src = url;
    });
  }
  function toBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(photoError('invalid-file')), 'image/jpeg', 0.82));
  }
  async function compressOfficePhoto(file, dependencies) {
    const env = dependencies || browser;
    if (!file || !TYPES.has(String(file.type || ''))) throw photoError('unsupported-type');
    const bitmap = await decode(file, env);
    try {
      const width = Number(bitmap.width) || 0;
      const height = Number(bitmap.height) || 0;
      if (!width || !height || !env.document || typeof env.document.createElement !== 'function') throw photoError('invalid-file');
      const scale = Math.min(1, MAX_LONGEST_SIDE / Math.max(width, height));
      const canvas = env.document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw photoError('invalid-file');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await toBlob(canvas);
      if (blob.size > MAX_BYTES) throw photoError('too-large');
      const dataB64 = await blobToBase64(blob, env.FileReader || browser.FileReader);
      if (!dataB64) throw photoError('invalid-file');
      return { name: jpegName(file.name), mimeType: 'image/jpeg', dataB64, bytes: blob.size };
    } finally {
      if (bitmap && typeof bitmap.close === 'function') bitmap.close();
    }
  }
  return { compressOfficePhoto, MAX_BYTES, MAX_LONGEST_SIDE };
});
