'use client';

import React, { useEffect, useRef, useState } from 'react';

export default function CallSpeechControls({ callId, active, revision, onText, onError }: {
  callId: string; active: boolean; revision: number; onText: (text: string) => void; onError: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const audio = useRef<HTMLAudioElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const media = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      generation.current += 1;
      request.current?.abort();
      if (recorder.current?.state === 'recording') { recorder.current.onstop = null; recorder.current.stop(); }
      media.current?.getTracks().forEach(track => track.stop());
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    generation.current += 1;
    if (recorder.current?.state === 'recording') { recorder.current.onstop = null; recorder.current.stop(); }
    media.current?.getTracks().forEach(track => track.stop());
    if (timer.current) clearTimeout(timer.current);
    setRecording(false);
    audio.current?.pause();
    setAudioUrl('');
    request.current?.abort();
    setBusy(false);
  }, [callId, revision, active]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  async function listen() {
    if (busy || recording || !active) return;
    setBusy(true);
    const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch('/api/play/calls/' + encodeURIComponent(callId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'speech' }), signal: controller.signal });
      if (!response.ok) throw new Error((await response.json() as { error: string }).error);
      const url = URL.createObjectURL(await response.blob());
      setAudioUrl(url);
    } catch (error) { if (!controller.signal.aborted) onError(error instanceof Error ? error.message : 'Speech is unavailable. Continue by text.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function record() {
    if (recording) { recorder.current?.stop(); return; }
    if (busy || !active) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { onError('Recording is not available in this browser. Type your reply.'); return; }
    setBusy(true);
    const current = generation.current;
    try {
      audio.current?.pause();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current !== generation.current) { stream.getTracks().forEach(track => track.stop()); return; }
      media.current = stream;
      const capture = new MediaRecorder(stream);
      recorder.current = capture;
      const parts: Blob[] = [];
      capture.ondataavailable = event => { if (event.data.size) parts.push(event.data); };
      capture.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (timer.current) clearTimeout(timer.current);
        if (current !== generation.current) return;
        setRecording(false); setBusy(true);
        const controller = new AbortController(); request.current = controller;
        try {
          const form = new FormData();
          form.set('audio', new Blob(parts, { type: capture.mimeType }), 'reply.webm');
          const response = await fetch('/api/play/calls/' + encodeURIComponent(callId), { method: 'POST', body: form, signal: controller.signal });
          const result = await response.json() as { text: string; error?: string };
          if (!response.ok) throw new Error(result.error);
          onText(result.text);
        } catch (error) { if (!controller.signal.aborted) onError(error instanceof Error ? error.message : 'Transcription failed. Type your reply.'); }
        finally { if (!controller.signal.aborted) setBusy(false); }
      };
      capture.start(); setRecording(true); setBusy(false);
      timer.current = setTimeout(() => capture.stop(), 20000);
    } catch {
      media.current?.getTracks().forEach(track => track.stop());
      if (timer.current) clearTimeout(timer.current);
      recorder.current = null; setRecording(false);
      onError('The microphone could not start. You can type your reply.'); setBusy(false); }
  }
  return <section className="play-speech" aria-label="ElevenLabs speech controls">
    <button disabled={busy || recording || !active} onClick={() => void listen()}>Listen to caller</button>
    {active && <button disabled={busy} aria-pressed={recording} onClick={() => void record()}>{recording ? 'Stop recording' : 'Record a reply'}</button>}
    {busy && <p role="status">Waiting for ElevenLabs…</p>}
    {recording && <p role="status">Recording · stops after 20 seconds.</p>}
    {audioUrl && <audio ref={audio} controls autoPlay src={audioUrl}>Your browser does not support audio playback.</audio>}
    <p className="play-note">Audio goes to ElevenLabs. Tell stores the text, not the audio. Check the transcript before you send it. Use only fictional details.</p>
  </section>;
}
