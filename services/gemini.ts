
import { Type } from "@google/genai";

// Standard decoding for binary audio
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts raw PCM 16-bit Mono data to a playable WAV Blob
 */
function pcmToWav(pcmData: Uint8Array, sampleRate: number = 24000): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF identifier
  view.setUint32(0, 0x52494646, false); // "RIFF"
  // file length
  view.setUint32(4, 36 + pcmData.length, true);
  // RIFF type
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // format chunk identifier
  view.setUint32(12, 0x666d7420, false); // "fmt "
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format
  view.setUint16(20, 1, true); // PCM
  // channel count
  view.setUint16(22, 1, true); // Mono
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  view.setUint32(36, 0x64617461, false); // "data"
  // data chunk length
  view.setUint32(40, pcmData.length, true);

  return new Blob([header, pcmData], { type: 'audio/wav' });
}

const getHeaders = (): HeadersInit => {
  return { 'Content-Type': 'application/json' };
};

export const GeminiService = {
  async magicImport(text: string) {
    const response = await fetch('/api/ai/import', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ text })
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || 'Extraction failed');
    }
    return data;
  },

  async urlImport(url: string) {
    const response = await fetch('/api/ai/import', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ text: `Extract from URL: ${url}` })
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || 'URL ingestion failed');
    }
    return data;
  },

  async generateSchedule(courses: any[], university: string) {
    const response = await fetch('/api/ai/schedule', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ courses, university })
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || 'Schedule generation failed');
    }
    return data;
  },

  async generateStudyMaterials(content: string, type: 'summary' | 'flashcards' | 'quiz' | 'test') {
    const response = await fetch('/api/ai/materials', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ content, type })
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || 'Material generation failed');
    }
    return data;
  },

  async generatePodcast(topic: string) {
    const response = await fetch('/api/ai/podcast', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ topic })
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || 'Podcast generation failed');
    }

    let wavUrl = null;
    if (data.audioBase64) {
      try {
        const pcmData = decode(data.audioBase64);
        const wavBlob = pcmToWav(pcmData, 24000);
        wavUrl = URL.createObjectURL(wavBlob);
      } catch (err) {
        console.error('Error decoding TTS PCM audio:', err);
      }
    }

    return { script: data.script, wavUrl };
  },

  async groupChat(messages: any[], groupName: string, groupDesc: string) {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ messages, groupName, groupDesc })
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || 'Group chat failed');
    }
    return data.text;
  },

  async validateGroupMessage(text: string, groupName: string, groupDesc: string) {
    const response = await fetch('/api/ai/validate', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ text, groupName, groupDesc })
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || 'Validation failed');
    }
    return data;
  }
};
