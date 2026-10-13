'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Upload, CheckCircle2, AlertCircle } from 'lucide-react';

export interface AudioRecorderProps {
  parentType: 'motif' | 'composition' | 'tuning' | 'instrument';
  parentId: string;
  onUploaded?: (attachment: any) => void;
}

export default function AudioRecorder({
  parentType,
  parentId,
  onUploaded,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setIsSupported(false);
      }
    }
  }, []);

  const startRecording = async () => {
    try {
      setStatusMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.warn('Microphone access denied or error:', err);
      setStatusMessage('Microphone access denied or unavailable.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadRecording = async () => {
    if (!audioBlob) return;
    setUploading(true);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      const filename = `memo-${Date.now()}.webm`;
      formData.append('file', audioBlob, filename);
      formData.append('parentType', parentType);
      formData.append('parentId', parentId);
      formData.append('description', 'In-browser voice/guitar audio memo');

      const res = await fetch('/api/attachments', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      const data = await res.json();
      setStatusMessage('Audio memo saved to storage/media/ successfully!');
      onUploaded?.(data);
      setAudioBlob(null);
      setAudioUrl(null);
    } catch (err: any) {
      setStatusMessage(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('parentType', parentType);
      formData.append('parentId', parentId);
      formData.append('description', `Uploaded file: ${file.name}`);

      const res = await fetch('/api/attachments', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setStatusMessage(`Uploaded ${file.name} successfully!`);
      onUploaded?.(data);
    } catch (err: any) {
      setStatusMessage(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border border-stone-300 rounded p-4 bg-paper-100 flex flex-col gap-3 font-mono text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold tracking-wider text-stone-900 uppercase">
          AUDIO MEMO & ATTACHMENTS
        </span>
        <span className="text-[11px] text-stone-500">Local Media Storage</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Record / Stop Button */}
        {isSupported && (
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

        {/* Existing recording preview */}
        {audioUrl && (
          <div className="flex items-center gap-2">
            <audio src={audioUrl} controls className="h-8 max-w-[200px]" />
            <button
              type="button"
              disabled={uploading}
              onClick={uploadRecording}
              className="flex items-center gap-1 px-3 py-1.5 bg-stone-900 text-white rounded hover:bg-stone-800 disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{uploading ? 'SAVING...' : 'SAVE RECORDING'}</span>
            </button>
          </div>
        )}

        {/* File upload alternative */}
        <div className="flex items-center gap-2 border-l border-stone-300 pl-3">
          <label className="flex items-center gap-1 px-2.5 py-1.5 border border-stone-400 bg-white text-stone-800 rounded hover:bg-stone-50 cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-stone-600" />
            <span>ATTACH FILE</span>
            <input
              type="file"
              accept="audio/*,.pdf,.png,.jpg,.jpeg"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {statusMessage && (
        <div className="flex items-center gap-1.5 text-stone-700 text-[11px] pt-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-editorial-sage" />
          <span>{statusMessage}</span>
        </div>
      )}
    </div>
  );
}
