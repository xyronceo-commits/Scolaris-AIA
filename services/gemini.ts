import { getCurrentUserId, getAccessToken } from '../lib/supabase';

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
 * Validates media bytes structure before creating blob
 */
function validateAudioBytes(bytes: Uint8Array): { valid: boolean; error?: string } {
  if (!bytes || bytes.length < 44) {
    return { valid: false, error: 'The audio buffer is missing or too short to contain a valid media header (< 44 bytes).' };
  }

  // RIFF header check
  const isRiff = bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70;
  if (isRiff) {
    const isWave = bytes[8] === 87 && bytes[9] === 65 && bytes[10] === 86 && bytes[11] === 69;
    if (!isWave) {
      return { valid: false, error: 'The audio stream container is missing the WAVE header.' };
    }
    const isFmt = bytes[12] === 102 && bytes[13] === 109 && bytes[14] === 116 && bytes[15] === 32;
    if (!isFmt) {
      return { valid: false, error: 'The audio stream is missing the fmt subchunk header.' };
    }
  }

  return { valid: true };
}

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

/** Safe, one-time cleanup of obsolete legacy browser-stored API credentials */
export function cleanupLegacyApiKeyStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const LEGACY_STORAGE_KEYS = [
      'scolaris_custom_gemini_api_key',
      'scolaris_custom_groq_api_key',
      'scolaris_custom_scolaris_ai_key',
      'scolaris_custom_ai_key',
      'groq_api_key',
      'gemini_api_key',
      'scolaris_ai_api_key',
      'scolaris_user_api_key',
      'user_ai_key',
      'custom_ai_key',
      'custom_groq_key',
      'custom_gemini_key',
      'ai_api_key'
    ];

    LEGACY_STORAGE_KEYS.forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && /(?:custom.*ai.*key|groq.*key|gemini.*key)/i.test(k) && !k.startsWith('sb-')) {
        localStorage.removeItem(k);
      }
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && /(?:custom.*ai.*key|groq.*key|gemini.*key)/i.test(k) && !k.startsWith('sb-')) {
        sessionStorage.removeItem(k);
      }
    }
  } catch {
    // Non-blocking browser storage access error handling
  }
}

// Automatically execute once on script initialization
cleanupLegacyApiKeyStorage();

export const getHeaders = async (): Promise<HeadersInit> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

async function safeFetchJson(url: string, options: RequestInit, fallbackErrorMessage: string) {
  let attempts = 0;
  const maxAttempts = 2;
  let lastError: any = null;

  while (attempts < maxAttempts) {
    try {
      attempts++;
      const response = await fetch(url, options);
      let data: any = {};
      const resText = await response.text();
      try {
        data = JSON.parse(resText);
      } catch {
        data = { error: fallbackErrorMessage };
      }
      if (!response.ok || (data && typeof data === 'object' && data.error)) {
        const errObj: any = new Error((data && data.error) || fallbackErrorMessage);
        errObj.status = response.status;
        if (data && typeof data === 'object') {
          errObj.code = data.code;
          errObj.balance = data.balance;
          errObj.required = data.required;
          errObj.allowance = data.allowance;
          errObj.resetDate = data.resetDate;
        }
        throw errObj;
      }
      return data;
    } catch (err: any) {
      lastError = err;
      if (err?.status === 402 || err?.code === 'INSUFFICIENT_CREDITS') {
        break;
      }
      if (attempts < maxAttempts && (err.message?.includes('Failed to fetch') || err.name === 'TypeError')) {
        await new Promise(r => setTimeout(r, 400));
        continue;
      }
      break;
    }
  }

  throw lastError || new Error(fallbackErrorMessage);
}

export const GeminiService = {
  async magicImport(text: string) {
    return await safeFetchJson('/api/ai/import', {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ text })
    }, 'Course outline extraction failed. Please ensure the text contains course codes.');
  },

  async urlImport(url: string) {
    return await safeFetchJson('/api/ai/import', {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ text: `Extract from URL: ${url}` })
    }, 'URL outline ingestion failed.');
  },

  async generateSchedule(courses: any[], university: string) {
    return await safeFetchJson('/api/ai/schedule', {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ courses, university })
    }, 'Schedule generation failed.');
  },

  async generateStudyMaterials(content: string, type: 'summary' | 'flashcards' | 'quiz' | 'test') {
    return await safeFetchJson('/api/ai/materials', {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ content, type })
    }, 'Study material generation failed.');
  },

  async generatePodcast(topic: string) {
    const data = await safeFetchJson('/api/ai/podcast', {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ topic })
    }, 'Podcast service unavailable.');

    const script = data?.script || '';
    let wavUrl: string | null = null;

    if (data?.audioBase64) {
      try {
        const bytes = decode(data.audioBase64);
        const validation = validateAudioBytes(bytes);
        if (!validation.valid) {
          console.error('Audio stream validation failed:', validation.error);
          throw new Error(`Corrupt audio output: ${validation.error}`);
        }

        if (bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70) {
          const blob = new Blob([bytes], { type: 'audio/wav' });
          wavUrl = URL.createObjectURL(blob);
        } else {
          const wavBlob = pcmToWav(bytes, 16000);
          wavUrl = URL.createObjectURL(wavBlob);
        }
      } catch (err: any) {
        console.error('Error validating or decoding audio stream:', err);
      }
    }

    if (!script) {
      throw new Error('No podcast dialogue could be generated for this topic.');
    }

    return { script, wavUrl };
  },

  async scolarisGenerate(studyMaterial: string, mode: 'quiz' | 'flashcards') {
    return await safeFetchJson('/api/scolaris/generate', {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ studyMaterial, mode })
    }, 'KorsIQ generation failed. Please verify that your document has readable text.');
  },

  async scolarisChat(
    messages: any[],
    courseContext?: string,
    fileContent?: string,
    academicProfile?: any,
    options?: { conversationId?: string | null; courseId?: string | null; message?: string }
  ) {
    try {
      return await safeFetchJson('/api/scolaris/chat', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({
          messages,
          message: options?.message,
          conversationId: options?.conversationId || undefined,
          courseId: options?.courseId || undefined,
          courseContext,
          fileContent,
          academicProfile
        })
      }, 'KorsIQ chatbot request failed');
    } catch (err: any) {
      console.warn("KorsIQ chat warning:", err?.message || err);
      return { text: `[KorsIQ Assistant] I encountered an issue: ${err?.message || 'Connection error'}. Please verify your AI API key is set in hosting environment variables.` };
    }
  },

  async extractUrlText(url: string): Promise<{ success: boolean; extractedText?: string; fileName?: string; error?: string }> {
    try {
      const response = await fetch('/api/files/extract-url', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ url })
      });
      const data = await response.json().catch(() => ({}));
      if (data && typeof data.success === 'boolean') {
        return data;
      }
      if (!response.ok) {
        return { success: false, error: data?.error || "We couldn't read that link. Check the URL and try again." };
      }
      return { success: true, extractedText: data?.extractedText || '', fileName: data?.fileName };
    } catch (err: any) {
      return { success: false, error: err?.message || "We couldn't read that link. Please try another URL." };
    }
  },

  async extractFileText(fileName: string, fileType: string, contentBase64: string): Promise<{ success: boolean; extractedText?: string; error?: string; isScannedPdf?: boolean; fileName?: string; fileTypeDetected?: string; pageCount?: number }> {
    try {
      const response = await fetch('/api/files/extract', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ fileName, fileType, contentBase64 })
      });
      const data = await response.json().catch(() => ({}));
      if (data && typeof data.success === 'boolean') {
        return data;
      }
      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Server file extraction request failed.',
          fileName
        };
      }
      return data;
    } catch (err: any) {
      console.warn("File text extraction request error:", err);
      return {
        success: false,
        error: err?.message || 'Network connection failed while extracting text.',
        fileName
      };
    }
  },

  async scanDocumentWithVision(fileName: string, fileType: string, contentBase64: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch('/api/vision/scan', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ fileName, fileType, contentBase64 })
      });
      const data = await response.json().catch(() => ({}));
      if (data && typeof data.success === 'boolean') {
        return data;
      }
      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Vision document scan failed.'
        };
      }
      return data;
    } catch (err: any) {
      console.warn("Vision document scan request error:", err);
      return {
        success: false,
        error: err?.message || 'Vision document scan failed.'
      };
    }
  },

  async parseTranscript(text: string): Promise<{ success: boolean; courses?: any[]; error?: string }> {
    try {
      const response = await fetch('/api/ai/transcript-parse', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ text })
      });
      return await response.json();
    } catch (err: any) {
      console.warn('parseTranscript error:', err);
      return { success: false, error: err?.message || 'Failed to parse transcript.' };
    }
  },

  async analyzeCgpa(payload: any): Promise<{ success: boolean; analysis?: any; error?: string }> {
    try {
      const response = await fetch('/api/ai/cgpa-analysis', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify(payload)
      });
      return await response.json();
    } catch (err: any) {
      console.warn('analyzeCgpa error:', err);
      return { success: false, error: err?.message || 'Failed to analyze CGPA.' };
    }
  },

  async generateAcademicPlan(payload: any): Promise<{ success: boolean; timetable?: any[]; revisionPlans?: any[]; error?: string }> {
    try {
      const response = await fetch('/api/ai/academic-planner', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify(payload)
      });
      return await response.json();
    } catch (err: any) {
      console.warn('generateAcademicPlan error:', err);
      return { success: false, error: err?.message || 'Failed to generate academic plan.' };
    }
  },

  async sendAcademicChat(messages: any[], academicContext: any): Promise<{ text: string }> {
    try {
      const response = await fetch('/api/ai/academic-chat', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ messages, academicContext })
      });
      return await response.json();
    } catch (err: any) {
      console.warn('sendAcademicChat error:', err);
      return { text: "Focus on mastering high-credit units with active recall practice problem sets." };
    }
  },

  // ==========================================
  // KORSIQ ACADEMIC STUDIO & CREDITS WRAPPERS
  // ==========================================

  async getCreditBalance(): Promise<{
    tier: string;
    allowance: number;
    used: number;
    remaining: number;
    balance: number;
    periodStart: string;
    periodEnd: string;
    resetDate: string;
  } | null> {
    try {
      const response = await fetch('/api/credits/balance', {
        method: 'GET',
        headers: await getHeaders()
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  },

  async generateStudioPlan(payload: {
    title: string;
    docType: string;
    subject?: string;
    instructions?: string;
    targetWordCount: number;
    citationStyle: string;
    references?: any[];
    requestId?: string;
  }): Promise<{ abstractPlan?: string; totalEstimatedWords?: number; outline: any[]; creditsRemaining?: number }> {
    return await safeFetchJson('/api/ai/studio/plan', {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify(payload)
    }, 'Failed to generate academic outline.');
  },

  async generateStudioSection(payload: {
    docTitle: string;
    docType: string;
    sectionTitle: string;
    sectionDescription?: string;
    sectionRationale?: string;
    targetWords: number;
    citationStyle: string;
    studentInstructions?: string;
    previousSectionSummary?: string;
    nextSectionTitle?: string;
    references?: any[];
    existingContent?: string;
    mode?: string;
    isFullDocumentFirstSection?: boolean;
    isFullDocumentContinuation?: boolean;
    requestId?: string;
  }): Promise<{ content: string; wordCount: number; creditsRemaining?: number }> {
    return await safeFetchJson('/api/ai/studio/generate-section', {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify(payload)
    }, 'Failed to write section.');
  },

  async reviewStudioDocument(payload: {
    docTitle: string;
    docType: string;
    fullContent: string;
    citationStyle: string;
    references?: any[];
    requestId?: string;
  }): Promise<{
    academicQualityScore: number;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    suggestions: any[];
    creditsRemaining?: number;
  }> {
    return await safeFetchJson('/api/ai/studio/review', {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify(payload)
    }, 'Failed to review academic document.');
  },

  async assistStudioText(payload: {
    selectedText: string;
    instruction: string;
    docTitle?: string;
    sectionTitle?: string;
    requestId?: string;
  }): Promise<{ text: string; creditsRemaining?: number }> {
    return await safeFetchJson('/api/ai/studio/assist', {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify(payload)
    }, 'Failed to rewrite text.');
  }
};
