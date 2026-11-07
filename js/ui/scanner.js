// QR code scanner: camera (or a photo) -> text.
//
// Uses the browser's own BarcodeDetector where it exists (Chrome on Android,
// Chrome / Edge on macOS); everywhere else (iPhone Safari, Firefox) it loads
// the bundled jsQR decoder on first use.

const MAX_SIDE = 720; // frames are scaled down before decoding: faster, just as reliable

let decoderPromise = null;

/** -> async (source: CanvasImageSource, w, h) => string[] (every code found) */
function getDecoder() {
  decoderPromise ??= (async () => {
    if ('BarcodeDetector' in self) {
      try {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (formats.includes('qr_code')) {
          const det = new BarcodeDetector({ formats: ['qr_code'] });
          return async (source) => (await det.detect(source)).map((c) => c.rawValue).filter(Boolean);
        }
      } catch {
        /* fall through to jsQR */
      }
    }
    await import('../vendor/jsQR.min.js'); // sets self.jsQR
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return async (source, w, h) => {
      const k = Math.min(1, MAX_SIDE / Math.max(w, h));
      canvas.width = Math.max(1, Math.round(w * k));
      canvas.height = Math.max(1, Math.round(h * k));
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const text = self.jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data;
      return text ? [text] : [];
    };
  })();
  return decoderPromise;
}

/** Start fetching the decoder early (so it is cached for offline use). */
export function warmUpDecoder() {
  getDecoder().catch(() => {});
}

export const hasCamera = () => !!navigator.mediaDevices?.getUserMedia;

export class Scanner {
  /**
   * hooks: { accept(text) -> bool, onResult(text), onStatus(text) }
   * Codes that `accept` turns down are skipped and scanning goes on.
   */
  constructor(video, hooks) {
    this.video = video;
    this.hooks = hooks;
    this.stream = null;
    this.timer = 0;
    this.running = false;
  }

  async start() {
    this.stop();
    this.running = true;
    if (!hasCamera()) {
      this.hooks.onStatus('This browser cannot use the camera here. Choose a photo of the QR code instead.');
      return false;
    }
    this.hooks.onStatus('Starting the camera…');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } },
      });
    } catch (e) {
      this.running = false;
      this.hooks.onStatus(
        e?.name === 'NotAllowedError'
          ? 'Camera access was not allowed. You can choose a photo of the QR code instead.'
          : 'No camera is available. You can choose a photo of the QR code instead.',
      );
      return false;
    }
    if (!this.running) {
      this.stop(); // closed while the permission prompt was up
      return false;
    }
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    this.hooks.onStatus('');
    const decode = await getDecoder();
    const tick = async () => {
      if (!this.running) return;
      const v = this.video;
      if (v.readyState >= 2 && v.videoWidth) {
        try {
          const text = (await decode(v, v.videoWidth, v.videoHeight)).find(this.hooks.accept);
          if (text && this.running) {
            this.stop();
            this.hooks.onResult(text);
            return;
          }
        } catch {
          /* a bad frame: try the next one */
        }
      }
      this.timer = setTimeout(tick, 120);
    };
    tick();
    return true;
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }

  /** Decode a QR code from an image file. -> { found: any code at all, text: an accepted one or null } */
  async decodeFile(file) {
    const decode = await getDecoder();
    const bitmap = await createImageBitmap(file);
    try {
      const codes = await decode(bitmap, bitmap.width, bitmap.height);
      return { found: codes.length > 0, text: codes.find(this.hooks.accept) ?? null };
    } finally {
      bitmap.close?.();
    }
  }
}
