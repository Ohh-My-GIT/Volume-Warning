import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Download,
  Share2,
  Settings2,
  Zap,
  Music,
  Video,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  FileAudio,
  FileVideo,
  Smartphone
} from 'lucide-react';
import {
  DistortionSettings,
  PRESETS,
  processAudioBuffer,
  audioBufferToWavBlob,
  renderDistortedVideo
} from './audioProcessor';

export default function App() {
  // State
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'audio' | 'video' | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [processingPercent, setProcessingPercent] = useState<number>(0);

  // Audio Processing Buffers
  const [rawAudioBuffer, setRawAudioBuffer] = useState<AudioBuffer | null>(null);
  const [distortedAudioBuffer, setDistortedAudioBuffer] = useState<AudioBuffer | null>(null);

  // Preset & Distortion Settings
  const [selectedPreset, setSelectedPreset] = useState<string>('standard');
  const [settings, setSettings] = useState<DistortionSettings>(PRESETS.standard.settings);

  // Exported Results
  const [exportWavBlob, setExportWavBlob] = useState<Blob | null>(null);
  const [exportWavUrl, setExportWavUrl] = useState<string | null>(null);
  const [exportVideoBlob, setExportVideoBlob] = useState<Blob | null>(null);
  const [exportVideoUrl, setExportVideoUrl] = useState<string | null>(null);

  // Playback Control
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Video Element Ref
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  // Web Audio Context Refs for Live Playback Preview
  const audioCtxRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Reset exported states
  const clearExports = () => {
    if (exportWavUrl) URL.revokeObjectURL(exportWavUrl);
    if (exportVideoUrl) URL.revokeObjectURL(exportVideoUrl);
    setExportWavBlob(null);
    setExportWavUrl(null);
    setExportVideoBlob(null);
    setExportVideoUrl(null);
    setIsPlaying(false);
    stopPlayback();
  };

  // Stop live audio playback
  const stopPlayback = () => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch (e) {
        // ignore if already stopped
      }
      currentSourceRef.current = null;
    }
    setIsPlaying(false);

    if (videoPreviewRef.current) {
      videoPreviewRef.current.pause();
      videoPreviewRef.current.currentTime = 0;
    }
  };

  // Handle File Select / Drop
  const handleFileChange = async (selectedFile: File) => {
    if (!selectedFile) return;

    stopPlayback();
    clearExports();
    setFile(selectedFile);

    const isVid = selectedFile.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(selectedFile.name);
    const isAud = selectedFile.type.startsWith('audio/') || /\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(selectedFile.name);

    if (!isVid && !isAud) {
      alert('動画ファイル（MP4, WEBM, MOVなど）または音声ファイル（WAV, MP3, M4Aなど）を選択してください。');
      return;
    }

    setFileType(isVid ? 'video' : 'audio');
    setIsProcessing(true);
    setProgressText('ファイルを解析中...');
    setProcessingPercent(10);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const tempCtx = new AudioContext();
      setProcessingPercent(40);
      setProgressText('音声をデコード中...');

      const decodedBuffer = await tempCtx.decodeAudioData(arrayBuffer);
      await tempCtx.close();

      setRawAudioBuffer(decodedBuffer);
      setProcessingPercent(70);
      setProgressText('音割れエフェクトを適用中...');

      // Apply current distortion settings
      const processed = await processAudioBuffer(decodedBuffer, settings);
      setDistortedAudioBuffer(processed);

      // Create WAV Blob
      const wavBlob = audioBufferToWavBlob(processed);
      const wavUrl = URL.createObjectURL(wavBlob);
      setExportWavBlob(wavBlob);
      setExportWavUrl(wavUrl);

      setProcessingPercent(100);
      setIsProcessing(false);
    } catch (err) {
      console.error(err);
      alert('ファイルの読み込みに失敗しました。対応している音声/動画ファイルを選択してください。');
      setIsProcessing(false);
    }
  };

  // Re-process audio when distortion settings change
  const reprocessAudio = useCallback(async (newSettings: DistortionSettings) => {
    if (!rawAudioBuffer) return;

    setIsProcessing(true);
    setProgressText('音割れ再加工中...');
    stopPlayback();

    try {
      const processed = await processAudioBuffer(rawAudioBuffer, newSettings);
      setDistortedAudioBuffer(processed);

      // Re-create WAV Blob
      if (exportWavUrl) URL.revokeObjectURL(exportWavUrl);
      const wavBlob = audioBufferToWavBlob(processed);
      const wavUrl = URL.createObjectURL(wavBlob);
      setExportWavBlob(wavBlob);
      setExportWavUrl(wavUrl);

      // Clear video export until re-generated
      if (exportVideoUrl) URL.revokeObjectURL(exportVideoUrl);
      setExportVideoBlob(null);
      setExportVideoUrl(null);

      setIsProcessing(false);
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
    }
  }, [rawAudioBuffer, exportWavUrl, exportVideoUrl]);

  // Apply preset
  const handlePresetChange = (presetKey: string) => {
    setSelectedPreset(presetKey);
    if (PRESETS[presetKey]) {
      const newSt = PRESETS[presetKey].settings;
      setSettings(newSt);
      reprocessAudio(newSt);
    }
  };

  // Update slider setting
  const handleSettingChange = <K extends keyof DistortionSettings>(key: K, value: DistortionSettings[K]) => {
    setSelectedPreset('custom');
    const updated = { ...settings, [key]: value };
    setSettings(updated);

    // Update live monitor gain immediately if playing
    if (key === 'masterVolume' && monitorGainRef.current) {
      monitorGainRef.current.gain.value = isMuted ? 0 : Number(value);
    } else {
      reprocessAudio(updated);
    }
  };

  // Generate Distorted Video (Mux video + processed audio)
  const handleGenerateVideo = async () => {
    if (!file || fileType !== 'video' || !distortedAudioBuffer) return;

    setIsProcessing(true);
    setProgressText('音割れ動画をレンダリング中...');
    setProcessingPercent(0);

    try {
      const videoBlob = await renderDistortedVideo(file, distortedAudioBuffer, (pct) => {
        setProcessingPercent(pct);
        setProgressText(`動画出力中... (${pct}%)`);
      });

      if (exportVideoUrl) URL.revokeObjectURL(exportVideoUrl);
      const videoUrl = URL.createObjectURL(videoBlob);
      setExportVideoBlob(videoBlob);
      setExportVideoUrl(videoUrl);

      setIsProcessing(false);
    } catch (err) {
      console.error(err);
      alert('動画のレンダリングに失敗しました。');
      setIsProcessing(false);
    }
  };

  // Live audio visualization loop
  const drawVisualizer = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const renderFrame = () => {
      animFrameRef.current = requestAnimationFrame(renderFrame);
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#050a33';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = isPlaying ? '#ffd400' : '#2b3ca0';
      ctx.beginPath();

      const sliceWidth = (canvas.width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    renderFrame();
  }, [isPlaying]);

  // Toggle Play / Pause for Preview
  const togglePlay = async () => {
    if (!distortedAudioBuffer) return;

    if (isPlaying) {
      stopPlayback();
      return;
    }

    // Start Audio Context if needed
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const source = ctx.createBufferSource();
    source.buffer = distortedAudioBuffer;

    const monitorGain = ctx.createGain();
    monitorGain.gain.value = isMuted ? 0 : settings.masterVolume;
    monitorGainRef.current = monitorGain;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyserRef.current = analyser;

    source.connect(monitorGain);
    monitorGain.connect(analyser);
    analyser.connect(ctx.destination);

    source.onended = () => {
      setIsPlaying(false);
      if (videoPreviewRef.current) {
        videoPreviewRef.current.pause();
      }
    };

    source.start(0);
    currentSourceRef.current = source;
    setIsPlaying(true);

    if (videoPreviewRef.current) {
      videoPreviewRef.current.currentTime = 0;
      videoPreviewRef.current.play().catch(() => {});
    }

    drawVisualizer();
  };

  // Toggle Mute
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (monitorGainRef.current) {
      monitorGainRef.current.gain.value = nextMuted ? 0 : settings.masterVolume;
    }
  };

  // Format file output name according to user rule
  // Rule: "ファイル拡張子がWAVでもmp3に変換せずに「音割れしたWAV」のする。"
  const getWavOutputFilename = () => {
    if (!file) return '音割れファイル.wav';
    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    return `${baseName}_音割れ.wav`;
  };

  const getVideoOutputFilename = () => {
    if (!file) return '音割れ動画.mp4';
    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    const isMp4 = exportVideoBlob?.type.includes('mp4');
    return `${baseName}_音割れ.${isMp4 ? 'mp4' : 'webm'}`;
  };

  // Mobile Web Share / Camera Roll download trigger
  const handleShareOrDownload = async (blob: Blob, filename: string) => {
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: blob.type })] })) {
      try {
        await navigator.share({
          files: [new File([blob], filename, { type: blob.type })],
          title: '音割れファイル',
          text: '音割れ加工したファイルです',
        });
        return;
      } catch (err) {
        // User cancelled or share failed, fallback to download link
      }
    }

    // Direct download anchor
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Clean up canvas loop on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      stopPlayback();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#080f48] text-[#ffd400] flex flex-col font-sans">
      {/* Header */}
      <header className="bg-[#ffd400] text-[#080f48] shadow-md sticky top-0 z-30 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-[#080f48] text-[#ffd400] p-2 rounded-lg font-black flex items-center justify-center">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight flex items-center gap-2 text-[#080f48]">
                音割れマシーン
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#080f48] text-[#ffd400]">
                  極限歪み加工
                </span>
              </h1>
              <p className="text-xs text-[#080f48]/80 font-medium">
                動画・音声をわざと超爆音・音割れ加工してカメラロールに保存
              </p>
            </div>
          </div>

          {file && (
            <button
              onClick={() => {
                stopPlayback();
                clearExports();
                setFile(null);
                setRawAudioBuffer(null);
                setDistortedAudioBuffer(null);
              }}
              className="text-xs font-bold text-[#ffd400] bg-[#080f48] hover:bg-[#121e82] flex items-center gap-1 px-3 py-1.5 rounded-md transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              やり直す
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Step 1: File Upload Dropzone */}
        {!file && (
          <div className="bg-[#050a33] border-2 border-dashed border-[#ffd400]/40 hover:border-[#ffd400] rounded-2xl p-8 sm:p-12 text-center cursor-pointer group shadow-xl">
            <input
              type="file"
              accept="audio/*,video/*,.wav,.mp3,.m4a,.aac,.ogg,.flac,.mp4,.webm,.mov,.m4v"
              onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer block space-y-4">
              <div className="w-16 h-16 bg-[#ffd400] text-[#080f48] rounded-2xl flex items-center justify-center mx-auto shadow-md">
                <Upload className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#ffd400]">
                  動画または音声ファイルをアップロード
                </h3>
                <p className="text-sm text-[#ffd400]/80 max-w-md mx-auto">
                  クリックまたはファイルをドロップしてください（MP4, WEBM, MOV, WAV, MP3など）
                </p>
              </div>
              <div className="inline-flex items-center gap-4 text-xs text-[#ffd400] bg-[#080f48] px-4 py-2 rounded-full border border-[#ffd400]/30">
                <span className="flex items-center gap-1">
                  <FileVideo className="w-4 h-4 text-[#ffd400]" /> 動画音声を自動抽出
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <FileAudio className="w-4 h-4 text-[#ffd400]" /> WAVはWAVのまま出力
                </span>
              </div>
            </label>
          </div>
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="bg-[#050a33] border border-[#ffd400] rounded-2xl p-6 text-center space-y-3 shadow-lg">
            <div className="text-3xl">🔊💥</div>
            <p className="text-sm font-bold text-[#ffd400]">{progressText}</p>
            <div className="w-full bg-[#080f48] h-3 rounded-full overflow-hidden border border-[#ffd400]/30">
              <div
                className="bg-[#ffd400] h-full"
                style={{ width: `${processingPercent}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Workspace when file is uploaded */}
        {file && !isProcessing && (
          <div className="space-y-6">
            {/* File Info Banner */}
            <div className="bg-[#050a33] border border-[#ffd400]/40 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#ffd400] text-[#080f48] rounded-lg">
                  {fileType === 'video' ? <Video className="w-6 h-6" /> : <Music className="w-6 h-6" />}
                </div>
                <div>
                  <h2 className="font-bold text-[#ffd400] text-sm sm:text-base truncate max-w-xs sm:max-w-md">
                    {file.name}
                  </h2>
                  <p className="text-xs text-[#ffd400]/80">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB • {fileType === 'video' ? '動画ファイル' : '音声ファイル'}
                  </p>
                </div>
              </div>

              {/* Safety Volume Control for Preview */}
              <div className="flex items-center gap-2 bg-[#080f48] px-3 py-1.5 rounded-lg border border-[#ffd400]/30 w-full sm:w-auto">
                <button
                  onClick={toggleMute}
                  className="text-[#ffd400] p-1"
                  title="試聴用ミュート切替"
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <span className="text-xs text-[#ffd400] whitespace-nowrap">試聴音量:</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : settings.masterVolume}
                  onChange={(e) => handleSettingChange('masterVolume', parseFloat(e.target.value))}
                  className="w-24 cursor-pointer"
                />
              </div>
            </div>

            {/* Video preview if video uploaded */}
            {fileType === 'video' && (
              <div className="bg-[#050a33] border border-[#ffd400]/40 rounded-xl overflow-hidden text-center relative max-h-72 flex items-center justify-center bg-black">
                <video
                  ref={videoPreviewRef}
                  src={URL.createObjectURL(file)}
                  className="max-h-72 w-auto mx-auto object-contain"
                  muted
                  playsInline
                />
              </div>
            )}

            {/* Audio Waveform / Visualizer */}
            <div className="bg-[#050a33] border border-[#ffd400]/40 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-[#ffd400]">
                <span className="font-mono font-bold">波形モニター（音割れ試聴）</span>
                <span className="text-[#ffd400] text-xs flex items-center gap-1 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5" /> イヤホンの音量にご注意ください
                </span>
              </div>
              <canvas
                ref={canvasRef}
                width={700}
                height={90}
                className="w-full h-20 bg-[#080f48] rounded-lg border border-[#ffd400]/30"
              />
              <div className="flex justify-center pt-1">
                <button
                  onClick={togglePlay}
                  className={`px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-md ${
                    isPlaying
                      ? 'bg-red-500 text-white'
                      : 'bg-[#ffd400] text-[#080f48]'
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4 fill-current" /> 試聴停止
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" /> 音割れ音声を試聴する
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Step 2: Preset Selector */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[#ffd400] flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#ffd400]" /> 1. 音割れプリセットを選択
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(PRESETS).map(([key, p]) => (
                  <button
                    key={key}
                    onClick={() => handlePresetChange(key)}
                    className={`p-3.5 rounded-xl border text-left flex items-start gap-3 ${
                      selectedPreset === key
                        ? 'bg-[#ffd400] text-[#080f48] border-[#ffd400] font-bold'
                        : 'bg-[#050a33] border-[#ffd400]/40 text-[#ffd400]'
                    }`}
                  >
                    <span className={`text-2xl p-1 rounded-lg border ${
                      selectedPreset === key ? 'bg-[#080f48] text-[#ffd400] border-[#080f48]' : 'bg-[#080f48] border-[#ffd400]/30'
                    }`}>{p.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`font-bold text-sm ${selectedPreset === key ? 'text-[#080f48]' : 'text-[#ffd400]'}`}>{p.name}</div>
                      <div className={`text-xs mt-0.5 leading-snug ${selectedPreset === key ? 'text-[#080f48]/80' : 'text-[#ffd400]/80'}`}>{p.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: Custom Distortion Fine-Tuning */}
            <div className="bg-[#050a33] border border-[#ffd400]/40 rounded-xl p-4 sm:p-5 space-y-4">
              <h3 className="text-sm font-bold text-[#ffd400] flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-[#ffd400]" /> 2. 細かい歪み調整（カスタム）
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Gain Booster */}
                <div className="space-y-1.5 bg-[#080f48] p-3 rounded-lg border border-[#ffd400]/30">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#ffd400] font-medium">ゲイン（増幅・倍率）</span>
                    <span className="text-[#ffd400] font-mono font-bold">{settings.gain}x</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    step="1"
                    value={settings.gain}
                    onChange={(e) => handleSettingChange('gain', parseInt(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                  <p className="text-[10px] text-[#ffd400]/70">値を大きくするほど全体が潰れて大爆音になります</p>
                </div>

                {/* Bass Boost */}
                <div className="space-y-1.5 bg-[#080f48] p-3 rounded-lg border border-[#ffd400]/30">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#ffd400] font-medium">爆音低音ブースト (80Hz)</span>
                    <span className="text-[#ffd400] font-mono font-bold">+{settings.bassBoost} dB</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    step="1"
                    value={settings.bassBoost}
                    onChange={(e) => handleSettingChange('bassBoost', parseInt(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                  <p className="text-[10px] text-[#ffd400]/70">低音域を強調して「重低音割れ」を作ります</p>
                </div>

                {/* Clipping Curve */}
                <div className="space-y-1.5 bg-[#080f48] p-3 rounded-lg border border-[#ffd400]/30">
                  <span className="text-xs text-[#ffd400] font-medium block">波形潰し方式 (クリッピング)</span>
                  <select
                    value={settings.clippingType}
                    onChange={(e) => handleSettingChange('clippingType', e.target.value as any)}
                    className="w-full bg-[#050a33] border border-[#ffd400]/40 rounded text-xs p-1.5 text-[#ffd400] focus:outline-none"
                  >
                    <option value="hard">ハードクリッピング (王道デジタル割れ)</option>
                    <option value="extreme">エクストリーム限界破断 (極太爆音)</option>
                    <option value="square">スクエアフォールドバック (矩形波風潰し)</option>
                    <option value="soft">ソフトマイルド歪み (オーバードライブ)</option>
                  </select>
                </div>

                {/* Bitcrusher */}
                <div className="space-y-1.5 bg-[#080f48] p-3 rounded-lg border border-[#ffd400]/30">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#ffd400] font-medium">ビットクラッシュ (量子化)</span>
                    <span className="text-[#ffd400] font-mono font-bold">
                      {settings.bitDepth === 16 ? 'OFF (16-bit)' : `${settings.bitDepth}-bit`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="16"
                    step="1"
                    value={settings.bitDepth}
                    onChange={(e) => handleSettingChange('bitDepth', parseInt(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                  <p className="text-[10px] text-[#ffd400]/70">2~4ビットに落とすとゲーム風ざらざらノイズ化します</p>
                </div>
              </div>
            </div>

            {/* Step 4: Export & Save Options */}
            <div className="bg-[#050a33] border border-[#ffd400] rounded-2xl p-5 space-y-4 shadow-xl">
              <h3 className="text-base font-bold text-[#ffd400] flex items-center gap-2">
                <Download className="w-5 h-5" /> 3. 音割れ加工済みファイルのダウンロード・保存
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Export 1: Distorted Audio WAV */}
                <div className="bg-[#080f48] p-4 rounded-xl border border-[#ffd400]/30 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-sm text-[#ffd400]">
                      <FileAudio className="w-4 h-4 text-[#ffd400]" /> 音声をWAVで保存
                    </div>
                    <p className="text-xs text-[#ffd400]/80 mt-1">
                      {file.name.toLowerCase().endsWith('.wav')
                        ? '※ご指定通りWAV拡張子のまま「音割れしたWAV」として保存します。'
                        : '無圧縮高品質WAVフォーマットで音割れ音声を保存します。'}
                    </p>
                  </div>
                  {exportWavBlob && (
                    <button
                      onClick={() => handleShareOrDownload(exportWavBlob, getWavOutputFilename())}
                      className="w-full bg-[#ffd400] text-[#080f48] font-bold py-2.5 px-4 rounded-lg text-sm flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" /> {getWavOutputFilename()} を保存
                    </button>
                  )}
                </div>

                {/* Export 2: Distorted Video (if video file uploaded) */}
                {fileType === 'video' && (
                  <div className="bg-[#080f48] p-4 rounded-xl border border-[#ffd400]/30 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center gap-2 font-bold text-sm text-[#ffd400]">
                        <FileVideo className="w-4 h-4 text-[#ffd400]" /> 動画として保存 (映像+音割れ)
                      </div>
                      <p className="text-xs text-[#ffd400]/80 mt-1">
                        映像に音割れ音声を結合して動画ファイルとして出力します。
                      </p>
                    </div>

                    {exportVideoBlob ? (
                      <button
                        onClick={() => handleShareOrDownload(exportVideoBlob, getVideoOutputFilename())}
                        className="w-full bg-[#ffd400] text-[#080f48] font-bold py-2.5 px-4 rounded-lg text-sm flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" /> {getVideoOutputFilename()} を保存
                      </button>
                    ) : (
                      <button
                        onClick={handleGenerateVideo}
                        className="w-full bg-[#080f48] text-[#ffd400] border border-[#ffd400] font-bold py-2.5 px-4 rounded-lg text-sm flex items-center justify-center gap-2"
                      >
                        <FilmIcon className="w-4 h-4" /> 音割れ動画を作成・書き出し
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Camera Roll Guidance for Mobile Users */}
              <div className="bg-[#080f48] border border-[#ffd400]/30 rounded-xl p-4 text-xs space-y-2">
                <div className="font-bold text-[#ffd400] flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-[#ffd400]" /> スマホ（iPhone/Android）のカメラロール・写真アプリへ保存する方法
                </div>
                <ul className="text-[#ffd400]/80 space-y-1 list-disc list-inside">
                  <li>
                    <span className="font-semibold text-[#ffd400]">iPhone (Safari):</span> 上記の保存ボタンをタップ後、共有メニューから<span className="text-[#ffd400] font-bold">「ビデオを保存」</span>または<span className="text-[#ffd400] font-bold">「ファイルに保存」</span>を選択します。
                  </li>
                  <li>
                    <span className="font-semibold text-[#ffd400]">Android (Chrome):</span> ダウンロード後、通知や「ダウンロード」フォルダから写真/ギャラリーアプリに保存されます。
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#ffd400]/20 py-4 text-center text-xs text-[#ffd400]/70">
        音割れマシーン • Web Audio API 高速音声ディストーション処理
      </footer>
    </div>
  );
}

function FilmIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h18M3 16h18" />
    </svg>
  );
}
