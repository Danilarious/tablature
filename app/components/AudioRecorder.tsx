'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Upload, CheckCircle2, AlertCircle, Paperclip } from 'lucide-react';
import { extensionForMime, pickRecorderMimeType } from '@/app/lib/media/pending-media';
import { uploadAttachmentFile } from '@/app/lib/api/client';

export interface CapturedMedia {
  blob: Blob;
  filename: string;
  description: string;
}

export interface AudioRecorderProps {
  parentType: 'motif' | 'composition' | 'tuning' | 'instrument';
  /** Saved record to attach to immediately. Omit when using `onCapture` (pending mode). */
  parentId?: string | null;
  onUploaded?: (attachment: unknown) => void;
  /**
   * Pending mode: the recording/selected file is handed to the parent instead of uploaded,
   * so it can be attached once the real record ID exists.
   */
  onCapture?: (media: CapturedMedia) => void;
  /** Reports a live or stopped-but-not-kept recording so parent navigation can protect it. */
  onTransientMediaChange?: (hasTransientMedia: boolean) => void;
}

const ACCEPT = 'audio/*,.webm,.ogg,.mp3,.m4a,.wav,.flac,.aif,.aiff,.pdf,.png,.jpg,.jpeg';

export default function AudioRecorder({ parentType, parentId, onUploaded, onCapture, onTransientMediaChange }: AudioRecorderProps) {
  const pendingMode = typeof onCapture === 'function';
  const canUploadNow = !pendingMode && !!parentId;

  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [recordingLabel, setRecordingLabel] = useState('');
  const [captureSettings, setCaptureSettings] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
        setIsSupported(false);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    onTransientMediaChange?.(isRecording || audioBlob !== null);
  }, [audioBlob, isRecording, onTransientMediaChange]);

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      onTransientMediaChange?.(false);
    };
  }, [onTransientMediaChange]);

  const startRecording = async () => {
    try {
      setStatus(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: { ideal: 48000 },
        },
      });
      mediaStreamRef.current = stream;
      const settings = stream.getAudioTracks()[0]?.getSettings();
      setCaptureSettings(settings
        ? `Music capture · ${settings.sampleRate ?? '?'} Hz · AGC ${settings.autoGainControl === false ? 'off' : 'browser controlled'}`
        : 'Music capture requested');
      audioChunksRef.current = [];

      const mimeType = pickRecorderMimeType((t) => MediaRecorder.isTypeSupported(t));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        // Label the blob with what the browser actually produced (e.g. audio/mp4 on Safari).
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setIsRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setIsRecording(false);
      console.warn('Microphone access denied or error:', err);
      setStatus({ kind: 'error', text: 'Microphone access denied or unavailable.' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const discardRecording = () => {
    setAudioBlob(null);
    setAudioUrl(null);
  };

  const keepOrUploadRecording = async () => {
    if (!audioBlob) return;
    const safeLabel = recordingLabel.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const filename = `${safeLabel || 'memo'}-${new Date().toISOString().replace(/[:.]/g, '-')}${extensionForMime(audioBlob.type)}`;
    const description = recordingLabel.trim() || 'In-browser audio memo';
    if (pendingMode) {
      onCapture!({ blob: audioBlob, filename, description });
      setStatus({ kind: 'ok', text: 'Recording kept — it will be attached when the idea is saved.' });
      discardRecording();
      return;
    }
    if (!canUploadNow) return;
    setUploading(true);
    setStatus(null);
    try {
      const data = await uploadAttachmentFile(audioBlob, filename, parentType, parentId!, description);
      setStatus({ kind: 'ok', text: 'Audio memo saved.' });
      onUploaded?.(data);
      discardRecording();
    } catch (err) {
      // Keep the recording so the user can retry.
      setStatus({ kind: 'error', text: `Upload failed: ${err instanceof Error ? err.message : 'unknown error'}. The recording is still here; try again.` });
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const description = `Attached file: ${file.name}`;
    if (pendingMode) {
      onCapture!({ blob: file, filename: file.name, description });
      setStatus({ kind: 'ok', text: `${file.name} will be attached when the idea is saved.` });
      return;
    }
    if (!canUploadNow) return;
    setUploading(true);
    setStatus(null);
    try {
      const data = await uploadAttachmentFile(file, file.name, parentType, parentId!, description);
      setStatus({ kind: 'ok', text: `Attached ${file.name}.` });
      onUploaded?.(data);
    } catch (err) {
      setStatus({ kind: 'error', text: `Upload failed: ${err instanceof Error ? err.message : 'unknown error'}` });
    } finally {
      setUploading(false);
    }
  };

  const disabled = !pendingMode && !canUploadNow;

  return (
    <div className="border border-stone-300 rounded p-4 bg-paper-100 flex flex-col gap-3 font-mono text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold tracking-wider text-stone-900 uppercase">AUDIO MEMO &amp; ATTACHMENTS</span>
        <span className="text-[11px] text-stone-500">{pendingMode ? 'Attached on save' : 'Local Media Storage'}</span>
      </div>

      {disabled && <p className="text-[11px] text-stone-500">Save the record first to attach files.</p>}

      <label className="space-y-1">
        <span className="block text-[11px] text-stone-600">RECORDING LABEL (OPTIONAL)</span>
        <input
          value={recordingLabel}
          onChange={(e) => setRecordingLabel(e.target.value)}
          placeholder="Verse idea, quiet fingerstyle take, ending variation..."
          className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5"
        />
      </label>
      <div className="text-[10px] text-stone-500">
        Instrument-friendly capture requests browser gain control, noise suppression, and echo cancellation off.
        {captureSettings ? ` ${captureSettings}` : ''}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {isSupported && !disabled && (
          <>
            {!isRecording ? (
              <button
                type="button"
                onClick={startRecording}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 text-white rounded hover:bg-red-800 font-bold transition-colors shadow-sm"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>RECORD MEMO</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white rounded hover:bg-stone-800 font-bold animate-pulse transition-colors"
              >
                <Square className="w-3.5 h-3.5 text-red-400 fill-red-400" />
                <span>STOP RECORDING</span>
              </button>
            )}
          </>
        )}

        {audioUrl && (
          <div className="flex items-center gap-2">
            <audio src={audioUrl} controls className="h-8 max-w-[200px]" />
            <button
              type="button"
              disabled={uploading}
              onClick={keepOrUploadRecording}
              className="flex items-center gap-1 px-3 py-1.5 bg-stone-900 text-white rounded hover:bg-stone-800 disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{pendingMode ? 'KEEP RECORDING' : uploading ? 'SAVING...' : 'SAVE RECORDING'}</span>
            </button>
            <button type="button" onClick={discardRecording} className="px-2 py-1.5 text-stone-500 hover:text-stone-900">
              Discard
            </button>
          </div>
        )}

        {!disabled && (
          <div className="flex items-center gap-2 border-l border-stone-300 pl-3">
            <label className="flex items-center gap-1 px-2.5 py-1.5 border border-stone-400 bg-white text-stone-800 rounded hover:bg-stone-50 cursor-pointer">
              <Paperclip className="w-3.5 h-3.5 text-stone-600" />
              <span>ATTACH FILE</span>
              <input type="file" accept={ACCEPT} onChange={handleFileSelect} className="hidden" />
            </label>
          </div>
        )}
      </div>

      {status && (
        <div className={`flex items-center gap-1.5 text-[11px] pt-1 ${status.kind === 'error' ? 'text-red-800' : 'text-stone-700'}`}>
          {status.kind === 'error' ? <AlertCircle className="w-3.5 h-3.5 text-red-600" /> : <CheckCircle2 className="w-3.5 h-3.5 text-editorial-sage" />}
          <span>{status.text}</span>
        </div>
      )}
    </div>
  );
}
