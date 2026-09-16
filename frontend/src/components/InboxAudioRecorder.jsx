import { useEffect, useRef, useState } from "react";

export default function InboxAudioRecorder({ onSend, disabled }) {
  const recorder = useRef(null), stream = useRef(null), chunks = useRef([]), canceled = useRef(false);
  const [recording, setRecording] = useState(false), [audio, setAudio] = useState(null), [error, setError] = useState("");
  useEffect(() => () => {
    canceled.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach(t => t.stop());
  }, []);
  useEffect(() => { if (!audio) return; return () => URL.revokeObjectURL(audio.url); }, [audio]);
  const start = async () => {
    setError(""); canceled.current = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("Este navegador no permite grabar audio. Usa Chrome o Edge con HTTPS.");
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4"].find(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
      recorder.current = rec; chunks.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        stream.current?.getTracks().forEach(t => t.stop()); setRecording(false);
        if (canceled.current) return;
        const blob = new Blob(chunks.current, { type: rec.mimeType });
        if (!blob.size) return;
        const ext = rec.mimeType.includes("ogg") ? "ogg" : rec.mimeType.includes("mp4") ? "m4a" : "webm";
        setAudio({ file: new File([blob], `audio-${Date.now()}.${ext}`, { type: rec.mimeType }), url: URL.createObjectURL(blob) });
      };
      rec.start(); setRecording(true);
    } catch (e) { stream.current?.getTracks().forEach(t => t.stop()); setError(e.name === "NotAllowedError" ? "Permite el acceso al micrófono para grabar." : e.message); }
  };
  return <div className="flex flex-wrap items-center gap-2">
    {recording ? <><span className="text-xs text-red-600 animate-pulse">● Grabando</span><button type="button" onClick={() => recorder.current.stop()} className="border rounded-lg p-2 text-xs">Detener</button><button type="button" onClick={() => { canceled.current = true; recorder.current.stop(); }} className="text-xs text-red-600">Cancelar</button></>
      : audio ? <><audio controls src={audio.url} className="h-9 max-w-48" /><button type="button" disabled={disabled} onClick={async () => { if (await onSend(audio.file)) setAudio(null); }} className="bg-green-600 text-white rounded-lg p-2 text-xs">Enviar audio</button><button type="button" onClick={() => setAudio(null)} className="text-xs">Descartar</button></>
      : <button type="button" onClick={start} disabled={disabled} title="Grabar mensaje de audio" aria-label="Grabar mensaje de audio" className="border rounded-xl px-3 py-2 disabled:opacity-40">🎙</button>}
    {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
  </div>;
}
