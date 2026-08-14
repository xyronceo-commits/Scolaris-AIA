

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
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const customKey = localStorage.getItem('scolaris_custom_scolaris_ai_key') || localStorage.getItem('scolaris_custom_groq_api_key') || localStorage.getItem('scolaris_custom_gemini_api_key');
  if (customKey) {
    headers['X-Scolaris-AI-Key'] = customKey;
    headers['X-Groq-API-Key'] = customKey;
    headers['X-Gemini-API-Key'] = customKey;
  }
  return headers;
};

async function safeFetchJson(url: string, options: RequestInit, fallbackErrorMessage: string) {
  try {
    const response = await fetch(url, options);
    let data: any = {};
    try {
      data = await response.json();
    } catch {
      data = { error: 'Invalid JSON response from server' };
    }
    if (!response.ok || data.error) {
      throw new Error(data.error || fallbackErrorMessage);
    }
    return data;
  } catch (err: any) {
    if (err.message && err.message.includes('Failed to fetch')) {
      throw new Error('Network request failed. Please check your internet connection or server state.');
    }
    throw err;
  }
}

export const GeminiService = {
  async magicImport(text: string) {
    return await safeFetchJson('/api/ai/import', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ text })
    }, 'Extraction failed');
  },

  async urlImport(url: string) {
    return await safeFetchJson('/api/ai/import', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ text: `Extract from URL: ${url}` })
    }, 'URL ingestion failed');
  },

  async generateSchedule(courses: any[], university: string) {
    return await safeFetchJson('/api/ai/schedule', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ courses, university })
    }, 'Schedule generation failed');
  },

  async generateStudyMaterials(content: string, type: 'summary' | 'flashcards' | 'quiz' | 'test') {
    return await safeFetchJson('/api/ai/materials', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ content, type })
    }, 'Material generation failed');
  },

  async generatePodcast(topic: string) {
    const data = await safeFetchJson('/api/ai/podcast', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ topic })
    }, 'Podcast generation failed');

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

    if (!wavUrl && data.script) {
      try {
        const sampleRate = 24000;
        // Approximate 25 seconds of podcast audio
        const numSamples = sampleRate * 25;
        const pcmData = new Uint8Array(numSamples * 2);
        const view = new DataView(pcmData.buffer);

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          const charCode = data.script.charCodeAt(i % data.script.length) || 70;
          const freq = 200 + (charCode % 15) * 20;
          const val = (Math.sin(2 * Math.PI * freq * t) * 0.3 + Math.sin(2 * Math.PI * (freq * 1.5) * t) * 0.15) * Math.min(1, Math.min(t * 2, (numSamples - i) / (sampleRate * 2)));
          const intVal = Math.floor(Math.max(-1, Math.min(1, val)) * 32767);
          view.setInt16(i * 2, intVal, true);
        }

        const wavBlob = pcmToWav(pcmData, sampleRate);
        wavUrl = URL.createObjectURL(wavBlob);
      } catch (err) {
        console.error('Error creating synthetic audio:', err);
      }
    }

    return { script: data.script, wavUrl };
  },

  async groupChat(messages: any[], groupName: string, groupDesc: string) {
    const data = await safeFetchJson('/api/ai/chat', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ messages, groupName, groupDesc })
    }, 'Group chat failed');
    return data.text;
  },

  async validateGroupMessage(text: string, groupName: string, groupDesc: string) {
    return await safeFetchJson('/api/ai/validate', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ text, groupName, groupDesc })
    }, 'Validation failed');
  },

  async scolarisGenerate(studyMaterial: string, mode: 'quiz' | 'flashcards') {
    return await safeFetchJson('/api/scolaris/generate', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ studyMaterial, mode })
    }, 'Scolaris generation failed');
  },

  async scolarisChat(messages: any[], courseContext?: string, fileContent?: string) {
    return await safeFetchJson('/api/scolaris/chat', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ messages, courseContext, fileContent })
    }, 'Scolaris chatbot request failed');
  },

  async extractFileText(fileName: string, fileType: string, contentBase64: string) {
    return await safeFetchJson('/api/files/extract', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ fileName, fileType, contentBase64 })
    }, 'File text extraction failed');
  },

  async scanDocumentWithVision(fileName: string, fileType: string, contentBase64: string) {
    return await safeFetchJson('/api/vision/scan', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ fileName, fileType, contentBase64 })
    }, 'Vision document scan failed');
  }
};
