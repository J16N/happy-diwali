// Records the show (canvas + synthesised sound) into a video file with
// MediaRecorder. MP4 is preferred (plays everywhere, WhatsApp included);
// browsers that cannot write MP4 produce WebM.
//
// Keeping sound and picture in sync: the file is written in one piece when
// recording stops. Asking for chunks as it goes (start(timeslice)) made
// Chrome's MP4 writer drop audio at chunk boundaries, and because MP4 audio
// is laid end to end, every dropped piece moved the rest of the soundtrack
// earlier (we measured up to 0.6 s). See also Sound.captureStream().

const TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export const canRecord = () =>
  typeof MediaRecorder !== 'undefined' &&
  typeof HTMLCanvasElement !== 'undefined' &&
  'captureStream' in HTMLCanvasElement.prototype &&
  TYPES.some((t) => MediaRecorder.isTypeSupported(t));

export class Recorder {
  constructor() {
    this.rec = null;
    this.chunks = [];
    this.started = 0;
  }

  get active() {
    return !!this.rec && this.rec.state !== 'inactive';
  }

  /** canvas: the show's canvas; audio: a MediaStream (or null). */
  start(canvas, audio) {
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const stream = canvas.captureStream(30);
    for (const track of audio?.getAudioTracks() ?? []) stream.addTrack(track);
    this.type = type;
    this.chunks = [];
    this.rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_200_000, audioBitsPerSecond: 128_000 });
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.done = new Promise((res) => {
      this.rec.onstop = () => {
        stream.getVideoTracks().forEach((t) => t.stop());
        res(new Blob(this.chunks, { type: type.split(';')[0] }));
      };
    });
    this.rec.start(); // no timeslice: see the note at the top
    this.started = performance.now();
  }

  /** Resolves to the finished video Blob. */
  stop() {
    if (!this.active) return Promise.resolve(null);
    this.rec.stop();
    return this.done;
  }

  get seconds() {
    return this.active ? (performance.now() - this.started) / 1000 : 0;
  }

  get extension() {
    return this.type?.startsWith('video/mp4') ? 'mp4' : 'webm';
  }
}
