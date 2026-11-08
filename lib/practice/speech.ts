import { PracticeError } from './nvidia.ts';
import { redact } from '../voice/routes.ts';

// Speech is an adapter. Nemotron plans the call; ElevenLabs only speaks and transcribes it.
export function createPracticeSpeech(env = process.env) {
  function key() {
    if (!env.ELEVENLABS_API_KEY) throw new PracticeError('ElevenLabs speech is not configured. You can continue by text.');
    return env.ELEVENLABS_API_KEY;
  }
  async function checked(response: Response) {
    if (!response.ok) throw new PracticeError(`ElevenLabs returned HTTP ${response.status}. You can continue by text.`);
    return response;
  }
  return {
    async speak(text: string) {
      const response = await checked(await fetch('https://api.elevenlabs.io/v1/text-to-speech/XrExE9yKIg1WjnnlVkGX?output_format=mp3_44100_128', {
        method: 'POST', headers: { 'xi-api-key': key(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }), signal: AbortSignal.timeout(20000),
      }));
      return new Response(response.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
    },
    async transcribe(file: File) {
      if (file.size > 5_000_000 || !file.size || !/^(audio\/|video\/webm)/.test(file.type)) throw new PracticeError('Record an audio reply under 5 MB.', 400);
      const form = new FormData();
      form.set('file', file); form.set('model_id', 'scribe_v2'); form.set('language_code', 'en'); form.set('tag_audio_events', 'false');
      const response = await checked(await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST', headers: { 'xi-api-key': key() }, body: form, signal: AbortSignal.timeout(25000),
      }));
      const result = await response.json() as { text?: unknown };
      if (typeof result.text !== 'string' || result.text.length > 1000) throw new PracticeError('Try a shorter reply, or type your reply.', 400);
      return redact(result.text);
    },
  };
}
