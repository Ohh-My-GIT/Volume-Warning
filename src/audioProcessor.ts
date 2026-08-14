/**
 * Audio Distortion Engine & Media Exporter
 * Pure Web Audio API & MediaRecorder implementation
 */

export interface DistortionSettings {
  gain: number;            // 1 to 100 (Gain multiplier)
  clippingType: 'hard' | 'soft' | 'square' | 'extreme'; // WaveShaper curve style
  bassBoost: number;       // 0 to 30 dB (at 80Hz)
  highBoost: number;       // 0 to 24 dB (at 4000Hz)
  bitDepth: number;        // 2 to 16 bits (16 = off)
  masterVolume: number;    // 0 to 1 (Monitor safety level)
}

export const PRESETS: Record<string, { name: string; icon: string; desc: string; settings: DistortionSettings }> = {
  standard: {
    name: '定番・爆音音割れ',
    icon: 'fa-solid fa-volume-high',
    desc: '全体を大音量でクリッピングさせた王道の音割れ',
    settings: {
      gain: 25,
      clippingType: 'hard',
      bassBoost: 12,
      highBoost: 6,
      bitDepth: 16,
      masterVolume: 0.3,
    },
  },
  earrape: {
    name: 'スピーカー崩壊（極太爆音）',
    icon: 'fa-solid fa-bomb',
    desc: '低音を激しく増幅して画面ごと揺れる爆音歪み',
    settings: {
      gain: 50,
      clippingType: 'extreme',
      bassBoost: 24,
      highBoost: 12,
      bitDepth: 16,
      masterVolume: 0.2,
    },
  },
  bitcrush: {
    name: '8-Bit レトロノイズ',
    icon: 'fa-solid fa-gamepad',
    desc: 'ファミコン風の量子化ビットクラッシュ音割れ',
    settings: {
      gain: 15,
      clippingType: 'hard',
      bassBoost: 6,
      highBoost: 0,
      bitDepth: 4,
      masterVolume: 0.4,
    },
  },
  apocalypse: {
    name: '宇宙崩壊（次元の歪み）',
    icon: 'fa-solid fa-meteor',
    desc: '原形をとどめない極限限界まで破壊されたサウンド',
    settings: {
      gain: 100,
      clippingType: 'square',
      bassBoost: 30,
      highBoost: 18,
      bitDepth: 3,
      masterVolume: 0.15,
    },
  },
};

/**
 * Generate a WaveShaper curve for digital distortion / clipping
 */
function makeDistortionCurve(type: DistortionSettings['clippingType'], amount: number): Float32Array {
  const samples = 44100;
  const curve = new Float32Array(samples);

  for (let i = 0; i < samples; ++i) {
    const x = (i * 2) / samples - 1;

    if (type === 'hard') {
      // Hard digital clipping
      const y = x * amount;
      curve[i] = Math.max(-1, Math.min(1, y));
    } else if (type === 'soft') {
      // Tanh soft clipping
      curve[i] = Math.tanh(x * amount);
    } else if (type === 'square') {
      // Square wave foldback distortion
      const y = x * amount;
      curve[i] = y > 0 ? 1 : y < 0 ? -1 : 0;
    } else if (type === 'extreme') {
      // Extreme non-linear overload curve
      const y = x * amount;
      curve[i] = Math.sign(y) * (1 - Math.exp(-Math.abs(y)));
    }
  }
  return curve;
}

/**
 * Apply bit depth reduction (bitcrushing) directly on Float32 channel samples
 */
function applyBitcrush(buffer: AudioBuffer, bitDepth: number): AudioBuffer {
  if (bitDepth >= 16) return buffer;

  const step = Math.pow(2, bitDepth - 1); // e.g., 4 bits -> step = 8
  const channels = buffer.numberOfChannels;

  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      // Quantize sample
      data[i] = Math.round(data[i] * step) / step;
    }
  }
  return buffer;
}

/**
 * Process an AudioBuffer using Web Audio OfflineAudioContext
 */
export async function processAudioBuffer(
  inputBuffer: AudioBuffer,
  settings: DistortionSettings
): Promise<AudioBuffer> {
  const channels = Math.min(inputBuffer.numberOfChannels, 2);
  const sampleRate = inputBuffer.sampleRate;
  const length = inputBuffer.length;

  const OfflineContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offlineCtx = new OfflineContextClass(channels, length, sampleRate);

  // Source node
  const source = offlineCtx.createBufferSource();
  source.buffer = inputBuffer;

  // Pre-Gain Boost Node
  const preGain = offlineCtx.createGain();
  preGain.gain.value = settings.gain;

  // Bass Boost Filter (Low Shelf at 80Hz)
  const bassFilter = offlineCtx.createBiquadFilter();
  bassFilter.type = 'lowshelf';
  bassFilter.frequency.value = 80;
  bassFilter.gain.value = settings.bassBoost;

  // High Boost Filter (High Shelf at 4000Hz)
  const highFilter = offlineCtx.createBiquadFilter();
  highFilter.type = 'highshelf';
  highFilter.frequency.value = 4000;
  highFilter.gain.value = settings.highBoost;

  // WaveShaper Node for Distortion Clipping
  const waveshaper = offlineCtx.createWaveShaper();
  waveshaper.curve = makeDistortionCurve(settings.clippingType, settings.gain);
  waveshaper.oversample = '2x';

  // Connect Audio Graph
  // source -> preGain -> bassFilter -> highFilter -> waveshaper -> offlineCtx.destination
  source.connect(preGain);
  preGain.connect(bassFilter);
  bassFilter.connect(highFilter);
  highFilter.connect(waveshaper);
  waveshaper.connect(offlineCtx.destination);

  source.start(0);

  // Render processed buffer with callback fallback for older mobile Safari
  if (offlineCtx.startRendering) {
    try {
      const renderedBuffer = await offlineCtx.startRendering();
      return applyBitcrush(renderedBuffer, settings.bitDepth);
    } catch (e) {
      return new Promise((resolve, reject) => {
        offlineCtx.oncomplete = (e) => {
          resolve(applyBitcrush(e.renderedBuffer, settings.bitDepth));
        };
        offlineCtx.onerror = (err) => reject(err);
        offlineCtx.startRendering();
      });
    }
  } else {
    return new Promise((resolve, reject) => {
      offlineCtx.oncomplete = (e) => {
        resolve(applyBitcrush(e.renderedBuffer, settings.bitDepth));
      };
      offlineCtx.onerror = (err) => reject(err);
      offlineCtx.startRendering();
    });
  }
}

/**
 * Export AudioBuffer to uncompressed 16-bit PCM WAV file format
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new DataView(new ArrayBuffer(length));
  const channels: Float32Array[] = [];
  const sampleRate = buffer.sampleRate;
  let offset = 0;
  let pos = 0;

  function writeString(str: string) {
    for (let i = 0; i < str.length; i++) {
      out.setUint8(pos++, str.charCodeAt(i));
    }
  }

  function setUint16(data: number) {
    out.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    out.setUint32(pos, data, true);
    pos += 4;
  }

  // RIFF Chunk Descriptor
  writeString('RIFF');
  setUint32(length - 8);
  writeString('WAVE');

  // fmt Sub-chunk
  writeString('fmt ');
  setUint32(16); // SubChunk1Size (16 for PCM)
  setUint16(1);  // AudioFormat (1 for PCM)
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan); // ByteRate
  setUint16(numOfChan * 2);              // BlockAlign
  setUint16(16);                         // BitsPerSample

  // data Sub-chunk
  writeString('data');
  setUint32(length - pos - 4);

  for (let i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (offset < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      // Convert to 16-bit signed int
      sample = (sample < 0 ? sample * 32768 : sample * 32767) | 0;
      out.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([out.buffer], { type: 'audio/wav' });
}

/**
 * Render Video with Processed Distorted Audio
 * Muxes original video frames with new distorted AudioBuffer
 */
export async function renderDistortedVideo(
  videoFile: File,
  distortedAudioBuffer: AudioBuffer,
  onProgress: (percent: number) => void
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const videoEl = document.createElement('video');
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', 'true');
    videoEl.setAttribute('webkit-playsinline', 'true');
    videoEl.crossOrigin = 'anonymous';

    const videoUrl = URL.createObjectURL(videoFile);
    videoEl.src = videoUrl;

    videoEl.onloadedmetadata = async () => {
      try {
        const width = videoEl.videoWidth || 640;
        const height = videoEl.videoHeight || 360;
        const duration = videoEl.duration;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Canvas context initialization failed'));
          return;
        }

        // Setup Web Audio Stream for recorded distorted audio
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        const source = audioCtx.createBufferSource();
        source.buffer = distortedAudioBuffer;

        const streamDestination = audioCtx.createMediaStreamDestination();
        source.connect(streamDestination);

        // Canvas video stream (30 fps)
        const canvasStream = (canvas as any).captureStream
          ? (canvas as any).captureStream(30)
          : (canvas as any).mozCaptureStream
          ? (canvas as any).mozCaptureStream(30)
          : null;

        if (!canvasStream) {
          reject(new Error('お使いのブラウザは動画のキャンバスキャプチャに対応していません。'));
          return;
        }

        const combinedTracks = [
          ...canvasStream.getVideoTracks(),
          ...streamDestination.stream.getAudioTracks(),
        ];
        const combinedStream = new MediaStream(combinedTracks);

        // Pick supported mimeType for maximum mobile/desktop compatibility
        const possibleTypes = [
          'video/mp4;codecs=avc1,mp4a.40.2',
          'video/mp4;codecs=avc1',
          'video/mp4',
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm'
        ];
        let mimeType = possibleTypes.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) || '';

        if (!mimeType) {
          mimeType = 'video/mp4'; // fallback
        }

        const mediaRecorder = new MediaRecorder(combinedStream, {
          mimeType: mimeType || undefined
        });
        const chunks: Blob[] = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          URL.revokeObjectURL(videoUrl);
          audioCtx.close().catch(() => {});
          const finalBlob = new Blob(chunks, { type: mimeType || 'video/mp4' });
          resolve(finalBlob);
        };

        // Start playing video and audio in sync
        videoEl.currentTime = 0;
        await videoEl.play().catch((err) => {
          console.warn('Video play warning:', err);
        });
        source.start(0);
        mediaRecorder.start(100);

        const drawFrame = () => {
          if (videoEl.ended || videoEl.paused) {
            if (mediaRecorder.state !== 'inactive') {
              mediaRecorder.stop();
            }
            return;
          }
          ctx.drawImage(videoEl, 0, 0, width, height);

          // Update progress
          if (duration > 0) {
            const currentProgress = Math.min(100, Math.round((videoEl.currentTime / duration) * 100));
            onProgress(currentProgress);
          }

          requestAnimationFrame(drawFrame);
        };

        requestAnimationFrame(drawFrame);

        videoEl.onended = () => {
          onProgress(100);
          if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }
        };

      } catch (err) {
        URL.revokeObjectURL(videoUrl);
        reject(err);
      }
    };

    videoEl.onerror = () => {
      URL.revokeObjectURL(videoUrl);
      reject(new Error('動画の読み込みに失敗しました'));
    };
  });
}
