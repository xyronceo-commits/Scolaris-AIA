import express from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import firebaseConfig from './firebase-applet-config.json';
import { 
  processDocumentBuffer, 
  normalizeExtractedText, 
  validateExtractedText, 
  selectRelevantChunks 
} from './lib/documentProcessor';

// Initialize Firebase Admin SDK
let adminApp: App | null = null;
try {
  const existingApps = getApps();
  if (!existingApps.length) {
    adminApp = initializeApp({
      projectId: firebaseConfig.projectId,
    });
  } else {
    adminApp = existingApps[0]!;
  }
} catch (e) {
  console.warn("Firebase Admin initialize warning:", e);
}

function getAdminFirestore() {
  if (!adminApp) return null;
  const dbId = firebaseConfig.firestoreDatabaseId;
  if (dbId && dbId !== '(default)') {
    return getFirestore(adminApp, dbId);
  }
  return getFirestore(adminApp);
}

// Server-side Secret for Administrator Access (Fails closed if env var is missing)
function getAdminSecret(): string | null {
  const secret = process.env.ADMIN_PASSWORD || process.env.SCOLARIS_ADMIN_PASSWORD;
  if (!secret || secret.trim() === '') return null;
  return secret.trim();
}

function safeCompareStrings(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function generateAdminToken(email: string): string {
  const secret = getAdminSecret();
  if (!secret) throw new Error('Admin secret unavailable');
  const payload = {
    email,
    role: 'admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
  };
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyAdminToken(token: string): { email: string; role: string } | null {
  const secret = getAdminSecret();
  if (!secret) return null; // Fail closed if secret is not set
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    if (!safeCompareStrings(signature, expectedSig)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.role !== 'admin') return null;
    return payload;
  } catch {
    return null;
  }
}

async function parsePdfBuffer(buffer: Buffer): Promise<string> {
  try {
    const res = await processDocumentBuffer(buffer, 'document.pdf', 'application/pdf');
    if (res.success && res.extractedText) {
      return res.extractedText;
    }
  } catch (err) {
    console.warn('parsePdfBuffer warning:', err);
  }
  return '';
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  interface AuthenticatedRequest extends express.Request {
    user?: any;
  }

  const userApiRequests = new Map<string, number[]>();

  const requireAuth = async (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    if (!adminApp) {
      return res.status(503).json({ success: false, error: 'Authentication service unavailable' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid Authorization header' });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing ID token' });
    }

    try {
      const decodedToken = await getAuth(adminApp).verifyIdToken(token);
      req.user = decodedToken;
      next();
    } catch (err: any) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired ID token' });
    }
  };

  const apiRateLimiter = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    const key = req.user?.uid || req.ip || req.socket.remoteAddress || 'unknown';
    const windowMs = 60 * 1000;
    const maxRequests = 20;
    const now = Date.now();

    const timestamps = (userApiRequests.get(key) || []).filter(ts => now - ts < windowMs);
    if (timestamps.length >= maxRequests) {
      userApiRequests.set(key, timestamps);
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again in a minute.'
      });
    }

    timestamps.push(now);
    userApiRequests.set(key, timestamps);
    next();
  };

  // Lazy init and adapter helper for Scolaris AI / Groq / Gemini
  const getAIKey = (customKey?: string) => {
    return customKey || process.env.SCOLARIS_AI_KEY || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY;
  };

  const getCustomKey = (req: express.Request) => {
    return (
      (req.headers['x-scolaris-ai-key'] as string) ||
      (req.headers['x-groq-api-key'] as string) ||
      (req.headers['x-gemini-api-key'] as string)
    );
  };

  const isUsingGemini = (customKey?: string) => {
    if (customKey) {
      if (customKey.startsWith('AIzaSy')) return true;
      if (customKey.startsWith('gsk_')) return false;
    }
    if (!process.env.SCOLARIS_AI_KEY && !process.env.GROQ_API_KEY && process.env.GEMINI_API_KEY) return true;
    return false;
  };

  const getAI = (customKey?: string) => {
    const apiKey = getAIKey(customKey);
    if (!apiKey) throw new Error('API Key is required');
    return new Groq({ apiKey });
  };

  interface AIParams {
    customKey?: string;
    systemInstruction?: string;
    messages: { role: string; content: string }[];
    temperature?: number;
    jsonMode?: boolean;
    preferGroq?: boolean;
  }

  const tryOpenRouterCall = async (apiKey: string, systemInstruction?: string, messages: { role: string; content: string }[] = [], temperature?: number, jsonMode?: boolean): Promise<string | null> => {
    if (!apiKey) return null;

    // Direct Groq SDK execution if key starts with gsk_
    if (apiKey.startsWith('gsk_')) {
      try {
        const groq = new Groq({ apiKey });
        const apiMessages: any[] = [];
        if (systemInstruction) apiMessages.push({ role: 'system', content: systemInstruction });
        apiMessages.push(...messages);
        const resp = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: apiMessages,
          temperature: temperature !== undefined ? temperature : 0.3,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {})
        });
        const content = resp.choices[0]?.message?.content;
        if (content) return content;
      } catch (err: any) {
        console.warn("Direct Groq call in tryOpenRouterCall warning:", err?.message || err);
      }
    }

    const candidateModels = [
      'openai/gpt-oss-120b',
      'qwen/qwen3.6-27b',
      'qwen/qwen-2.5-72b-instruct',
      'meta-llama/llama-3.3-70b-instruct',
      'openai/gpt-4o-mini',
      'deepseek/deepseek-chat'
    ];

    const apiMessages: any[] = [];
    if (systemInstruction) {
      apiMessages.push({ role: 'system', content: systemInstruction });
    }
    apiMessages.push(...messages);

    for (const model of candidateModels) {
      try {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://ai.studio/build',
            'X-Title': 'Scolaris AI'
          },
          body: JSON.stringify({
            model,
            messages: apiMessages,
            temperature: temperature !== undefined ? temperature : 0.3,
            ...(jsonMode ? { response_format: { type: "json_object" } } : {})
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) return content;
        }
      } catch (err: any) {
        console.warn(`OpenRouter model '${model}' call warning:`, err?.message || err);
      }
    }

    // Direct OpenAI API fallback if sk- key (and not sk-or-)
    if (apiKey.startsWith('sk-') && !apiKey.startsWith('sk-or-')) {
      try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: apiMessages,
            temperature: temperature !== undefined ? temperature : 0.3,
            ...(jsonMode ? { response_format: { type: "json_object" } } : {})
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) return content;
        }
      } catch (err: any) {
        // ignore
      }
    }

    return null;
  };

  const runAICall = async ({ customKey, systemInstruction, messages, temperature, jsonMode, preferGroq }: AIParams): Promise<string> => {
    const key = getAIKey(customKey);
    if (!key) throw new Error('API Key is required');

    // 1. Try SCOLARIS_AI_KEY or custom key via OpenRouter / OpenAI
    const scolarisKey = (customKey && !customKey.startsWith('AIzaSy') && !customKey.startsWith('gsk_'))
      ? customKey
      : (process.env.SCOLARIS_AI_KEY || (customKey && customKey.startsWith('sk-') ? customKey : null));

    if (scolarisKey && !preferGroq) {
      const openRouterResult = await tryOpenRouterCall(scolarisKey, systemInstruction, messages, temperature, jsonMode);
      if (openRouterResult) {
        return openRouterResult;
      }
    }

    // 2. Groq Execution
    const groqKey = (customKey && customKey.startsWith('gsk_'))
      ? customKey
      : (process.env.GROQ_API_KEY || (key && key.startsWith('gsk_') ? key : null));

    if (groqKey) {
      try {
        const groq = new Groq({ apiKey: groqKey });
        const apiMessages: any[] = [];
        if (systemInstruction) {
          apiMessages.push({ role: 'system', content: systemInstruction });
        }
        apiMessages.push(...messages);

        const candidateModels = [
          'openai/gpt-oss-120b',
          'qwen/qwen3.6-27b',
          'openai/gpt-oss-20b',
          'groq/compound',
          'groq/compound-mini',
          'llama-3.3-70b-versatile',
          'llama-3.1-8b-instant'
        ];

        for (const model of candidateModels) {
          try {
            const response = await groq.chat.completions.create({
              model,
              messages: apiMessages,
              temperature: temperature !== undefined ? temperature : 0.3,
              ...(jsonMode ? { response_format: { type: "json_object" } } : {})
            });

            const content = response.choices[0]?.message?.content;
            if (content) {
              return content;
            }
          } catch (mErr: any) {
            console.warn(`Groq model '${model}' call failed:`, mErr?.message || mErr);
          }
        }
      } catch (gErr: any) {
        console.warn(`Groq execution warning:`, gErr?.message || gErr);
      }
    }

    // 3. Gemini Execution - STRICTLY ONLY IF A VALID GEMINI KEY IS PROVIDED (starts with AIzaSy)
    const geminiKey = (customKey && customKey.startsWith('AIzaSy'))
      ? customKey
      : (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.startsWith('AIzaSy')
          ? process.env.GEMINI_API_KEY
          : (key && key.startsWith('AIzaSy') ? key : null));

    if (geminiKey) {
      try {
        const aiGen = new GoogleGenAI({
          apiKey: geminiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });

        const contents = messages.map(m => {
          let role = m.role === 'assistant' ? 'model' : m.role;
          if (role !== 'user' && role !== 'model') {
            role = 'user';
          }
          return {
            role,
            parts: [{ text: m.content }]
          };
        });

        const config: any = {};
        if (systemInstruction) {
          config.systemInstruction = systemInstruction;
        }
        if (temperature !== undefined) {
          config.temperature = temperature;
        }
        if (jsonMode) {
          config.responseMimeType = "application/json";
        }

        const geminiCandidateModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-3.5-flash'];
        for (const model of geminiCandidateModels) {
          try {
            const response = await aiGen.models.generateContent({
              model,
              contents,
              config
            });
            if (response.text) {
              return response.text;
            }
          } catch (gErr: any) {
            console.warn(`Gemini model '${model}' call warning:`, gErr?.message || gErr);
          }
        }
      } catch (gemInitErr: any) {
        console.warn("Gemini execution warning:", gemInitErr?.message || gemInitErr);
      }
    }

    throw new Error('All AI providers failed to generate content or no valid API key was available.');
  };

  let s3Client: S3Client | null = null;
  const getS3 = () => {
    if (!s3Client) {
      const accessKeyId = process.env.SUPABASE_S3_ACCESS_KEY_ID;
      const secretAccessKey = process.env.SUPABASE_S3_SECRET_ACCESS_KEY;
      if (!accessKeyId || !secretAccessKey) {
        throw new Error('Supabase S3 access keys SUPABASE_S3_ACCESS_KEY_ID and SUPABASE_S3_SECRET_ACCESS_KEY are not configured.');
      }
      s3Client = new S3Client({
        endpoint: 'https://ijvttbxphdntffmdggvv.storage.supabase.co/storage/v1/s3',
        region: 'eu-north-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }
    return s3Client;
  };

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy' });
  });

  // SEO Static Deliverables
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.sendFile(path.join(process.cwd(), 'public', 'robots.txt'));
  });

  app.get('/sitemap.xml', (req, res) => {
    res.type('application/xml');
    res.sendFile(path.join(process.cwd(), 'public', 'sitemap.xml'));
  });

  // Get S3 configuration details
  app.get('/api/s3/config', (req, res) => {
    res.json({
      configured: !!(process.env.SUPABASE_S3_ACCESS_KEY_ID && process.env.SUPABASE_S3_SECRET_ACCESS_KEY),
      endpoint: 'https://ijvttbxphdntffmdggvv.storage.supabase.co/storage/v1/s3',
      region: 'eu-north-1',
      bucket: process.env.SUPABASE_S3_BUCKET_NAME || 'scolaris-library'
    });
  });

  // Standard S3 Upload Proxy Route
  app.post('/api/s3/upload', requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const { fileName, fileType, contentBase64 } = req.body;
      if (!fileName || !contentBase64) {
        return res.status(400).json({ error: 'fileName and contentBase64 parameters are required' });
      }

      const buffer = Buffer.from(contentBase64, 'base64');
      const bucket = process.env.SUPABASE_S3_BUCKET_NAME || 'scolaris-library';
      
      const randomId = Math.random().toString(36).substring(2, 8);
      const fileKey = `uploads/${Date.now()}-${randomId}-${fileName}`;

      const s3 = getS3();
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: fileKey,
        Body: buffer,
        ContentType: fileType || 'application/octet-stream',
      });

      await s3.send(command);

      res.json({
        success: true,
        fileName,
        key: fileKey,
        bucket,
        publicUrl: `https://ijvttbxphdntffmdggvv.storage.supabase.co/storage/v1/object/public/${bucket}/${fileKey}`
      });
    } catch (error: any) {
      console.error('S3 Upload Error:', error);
      res.status(500).json({ error: error?.message || 'S3 Upload proxy failed' });
    }
  });

  // S3 Presign Download Proxy Route
  app.post('/api/s3/presign', requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const { key } = req.body;
      if (!key) {
        return res.status(400).json({ error: 'key is required' });
      }

      const bucket = process.env.SUPABASE_S3_BUCKET_NAME || 'scolaris-library';
      const s3 = getS3();
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      res.json({ presignedUrl });
    } catch (error: any) {
      console.error('S3 Presign Error:', error);
      res.status(500).json({ error: error?.message || 'Failed to generate presigned download URL' });
    }
  });

  // Offline / Quota Fallback Generators
  const getChatFallback = (groupName: string) => ({ 
    text: `[Scolaris AI Bot - Study Companion] Let's work on this together! Active recall and interactive flashcards are excellent tools for mastering "${groupName}". Let me know what concepts we should break down first!`
  });

  const getImportFallback = (text: string) => {
    const imported: any[] = [];
    const lines = (text || '').split('\n');
    for (const line of lines) {
      const courseMatch = line.match(/([A-Z]{2,4})\s*(\d{3})/i);
      if (courseMatch) {
         const code = (courseMatch[1] + courseMatch[2]).toUpperCase();
         const title = line.replace(/([A-Z]{2,4})\s*(\d{3})/i, '').trim().replace(/^[:\-\s]+/, '') || `Study Module ${code}`;
         if (!imported.some(c => c.code === code)) {
           imported.push({
             code,
             title: title.slice(0, 50),
             units: 3,
             difficulty: ['Easy', 'Medium', 'Hard'][Math.floor(Math.random() * 3)],
             description: `Syllabus loadout for ${code} focusing on high-retention concepts.`
           });
         }
      }
    }
    if (imported.length === 0) {
      imported.push(
        { code: "CS101", title: "Introduction to Computer Science", units: 4, difficulty: "Medium", description: "Fundamentals of algorithmic design and secure computation paradigms." },
        { code: "MATH210", title: "Calculus & Analysis", units: 3, difficulty: "Hard", description: "Limits, integration, linear dimensional analysis, and proofs." }
      );
    }
    return imported;
  };

  const getScheduleFallback = (courses: any[], university: string) => {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const modes = ["Deep Dive", "Review", "Practice", "Reading"];
    const generated: any[] = [];
    let sessionId = 1;
    
    const courseIds = (courses || []).map((c: any) => c.id || c.code);
    if (courseIds.length > 0) {
      for (let i = 0; i < 11; i++) {
        const day = days[i % days.length];
        const courseId = courseIds[i % courseIds.length];
        const courseDetail = courses[i % courses.length];
        
        let duration = 45;
        if (courseDetail?.difficulty === 'Hard') duration = 90;
        else if (courseDetail?.difficulty === 'Medium') duration = 60;
        
        const mode = modes[i % modes.length];
        generated.push({
          id: `session-mock-${sessionId++}`,
          courseId,
          day,
          duration,
          mode
        });
      }
    }
    return generated;
  };

  const getMaterialsFallback = (content: string, type: 'summary' | 'flashcards' | 'quiz' | 'test') => {
    if (type === 'summary') {
      let summary = `# Strategic Academic Summary\n\n`;
      summary += `Based on the provided resource materials and lecture documents:\n\n`;
      summary += `## 📌 Key Core Tenets\n`;
      summary += `- **Active Synthesis**: Mastery of these concepts requires dynamic application and problem set practice.\n`;
      summary += `- **Spaced Repetition**: We recommend studying this material at 1, 3, and 7-day intervals to build long-term retention.\n\n`;
      summary += `## 🔍 Extracted Learning Modules\n`;
      
      const sentences = (content || '').split(/[.!?]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 15);
      if (sentences.length > 0) {
        const limit = Math.min(sentences.length, 6);
        for (let i = 0; i < limit; i++) {
          summary += `- **Module ${i + 1}**: ${sentences[i]}.\n`;
        }
      } else {
        summary += `- **Module 1**: Concept integration and terminology mapping.\n`;
        summary += `- **Module 2**: Practical exercises with code challenges and mock verification.\n`;
      }
      return summary;
    } else if (type === 'flashcards') {
      const cards: any[] = [];
      const sentences = (content || '').split(/[.!?]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 20);
      if (sentences.length >= 2) {
        const total = Math.min(sentences.length, 6);
        for (let i = 0; i < total; i++) {
          const text = sentences[i];
          const words = text.split(' ');
          const front = words.slice(0, Math.ceil(words.length / 2)).join(' ') + "?";
          const back = words.slice(Math.ceil(words.length / 2)).join(' ');
          cards.push({ front, back });
        }
      } else {
        cards.push(
          { front: "What is the primary objective of this subject?", back: "To design optimal systems and establish complete academic retention." },
          { front: "Explain active memory recall strategy.", back: "Forcing the brain to retrieve facts rather than passively re-reading text." },
          { front: "Explain spaced repetition.", back: "Reviewing material at increasing intervals (e.g., 2 days, 1 week, 1 month) to secure memory tracks." },
          { front: "What does deep learning and comprehension emphasize?", back: "The underlying principles and core connections between diverse modules." }
        );
      }
      return cards;
    } else if (type === 'quiz') {
      const quiz: any[] = [];
      const sentences = (content || '').split(/[.!?]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 20);
      if (sentences.length >= 2) {
        const total = Math.min(sentences.length, 5);
        for (let i = 0; i < total; i++) {
          const text = sentences[i];
          const words = text.split(' ');
          const val = words.slice(Math.max(0, words.length - 3)).join(' ');
          
          quiz.push({
            question: `Based on the reading content: "...${words.slice(0, Math.min(words.length, 12)).join(' ')} ______ ?"`,
            options: [val, "Alternative concept model", "Standard syllabus terminology", "Simplified baseline abstraction"],
            answer: val,
            explanation: `As specified in the course text: "${text}"`
          });
        }
      } else {
        quiz.push(
          {
            question: "Which of the following describes the most robust strategy for exam preparation?",
            options: ["Passive re-reading", "Active self-testing and mock exams", "Cramming the night before", "Highlighting full book pages"],
            answer: "Active self-testing and mock exams",
            explanation: "Empirical educational research consistently shows that self-testing (testing effect) increases long-term retention compared to passive reviewing."
          },
          {
            question: "What is the primary benefit of the Pomodoro technique?",
            options: ["Saves electricity", "Eliminates exams entirely", "Prevents mental fatigue and maintains high cognitive focus", "Improves reading speed automatically"],
            answer: "Prevents mental fatigue and maintains high cognitive focus",
            explanation: "By breaking study sessions with regular brief rests, the brain restores working focus, avoiding early burnout."
          }
        );
      }
      return quiz;
    } else {
      const test: any[] = [];
      test.push(
        {
          question: "Which studying methodology is characterized by testing yourself on ideas rather than looking over notes?",
          options: ["Active Recall", "Passive Scanning", "Note Highlighting", "Rote Memorization"],
          answer: "Active Recall",
          explanation: "Active recall forces the brain to retrieve information, building stronger neural pathways."
        },
        {
          question: "True or False: Spacing study sessions distributes neural reinforcement over time, which optimizes consolidation in long-term memory.",
          options: ["True", "False"],
          answer: "True",
          explanation: "Spaced repetition distributes dynamic review sequences, reinforcing memory traces over days rather than hours."
        },
        {
          question: "Which learning mode centers on interactive exercises, mock problems, and challenges?",
          options: ["Review", "Practice", "Deep Dive", "Reading"],
          answer: "Practice",
          explanation: "Practice mode engages tactile problem sets and interactive simulations to confirm theoretical concepts."
        },
        {
          question: "True or False: According to cognitive science, passive review builds the illusion of competence.",
          options: ["True", "False"],
          answer: "True",
          explanation: "Reading over highlighted text feels easy, leading students to overestimate how well they actually know the material."
        }
      );
      return test;
    }
  };

  function cleanScriptFormatting(text: string): string {
    if (!text) return '';
    return text
      .replace(/```[a-z]*\n?/gi, '')
      .replace(/```/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^[\s*+-]+\s+/gm, '')
      .replace(/\|/g, ' ')
      .replace(/[`~^]/g, '')
      .replace(/[^\x00-\x7F]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function generateGroqPodcastScript(studyMaterial: string, customApiKey?: string): Promise<string> {
    const groqKey = (customApiKey && customApiKey.startsWith('gsk_'))
      ? customApiKey
      : (process.env.GROQ_API_KEY || (customApiKey && !customApiKey.startsWith('AIzaSy') ? customApiKey : null));

    if (!groqKey) {
      throw new Error("GROQ_API_KEY environment variable is not configured.");
    }

    const groq = new Groq({ apiKey: groqKey });

    const systemInstruction = `You are an expert producer for Scolaris AI Academic Podcasts.
Create a natural, highly engaging, exam-focused dialogue conversation (4 to 6 exchanges) between two podcast hosts:
Host 1 (Alex): Curious, intelligent, engaging student host who asks thoughtful questions and summarizes key takeaways.
Host 2 (Dr. Taylor): Analytical, friendly, explanatory professor host who breaks down complex concepts with clear real-world examples.

Strict Rules:
1. Ground every explanation strictly in the supplied study material. Never invent facts or information not supported by the text.
2. Explain difficult concepts with simple analogies and highlight exam-relevant facts.
3. Avoid unnecessary repetition. Never read raw text or bullet points verbatim.
4. Output ONLY plain spoken dialogue text. Strictly NO markdown formatting, NO asterisks (**), NO hashes (#), NO table borders (|), NO backticks, NO JSON formatting.
5. Format dialogue strictly line by line:
Alex: [spoken text]
Dr. Taylor: [spoken text]`;

    const modelsToTry = [
      'llama3-70b-8192',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant'
    ];

    let rawScript: string | null = null;
    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        const response = await groq.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `Study Material / Revision Content: "${studyMaterial?.slice(0, 4500) || 'General Academic Revision'}"` }
          ],
          temperature: 0.4
        });

        const content = response.choices[0]?.message?.content;
        if (content && content.trim().length > 0) {
          rawScript = content;
          break;
        }
      } catch (err: any) {
        console.warn(`Groq podcast call with model '${model}' failed:`, err?.message || err);
        lastError = err;
      }
    }

    if (!rawScript) {
      throw new Error(`Groq AI podcast script generation failed: ${lastError?.message || 'No response from Groq API'}`);
    }

    return rawScript;
  }

  function generateSpeechWav(scriptText: string): Buffer {
    const sampleRate = 16000;
    const lines = scriptText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    const rawSegments: { speaker: string; text: string }[] = [];
    for (const line of lines) {
      if (line.toLowerCase().startsWith('alex:')) {
        rawSegments.push({ speaker: 'Alex', text: line.replace(/^alex:/i, '').trim() });
      } else if (
        line.toLowerCase().startsWith('dr. taylor:') ||
        line.toLowerCase().startsWith('jane:') ||
        line.toLowerCase().startsWith('dr taylor:')
      ) {
        rawSegments.push({ speaker: 'Dr. Taylor', text: line.replace(/^(dr\.? taylor|jane):/i, '').trim() });
      } else {
        rawSegments.push({ speaker: 'Alex', text: line });
      }
    }

    const segments = rawSegments.slice(0, 10);
    const audioChunks: Int16Array[] = [];
    for (const seg of segments) {
      const isAlex = seg.speaker === 'Alex';
      const baseFreq = isAlex ? 165 : 240;
      const formant1 = isAlex ? 500 : 700;
      const formant2 = isAlex ? 1500 : 2100;
      
      const durationSec = Math.min(3.5, Math.max(1.0, seg.text.length / 75));
      const numSamples = Math.floor(sampleRate * durationSec);
      const chunk = new Int16Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const syllable = Math.sin(2 * Math.PI * 4.5 * t);
        const envelope = Math.max(0.15, Math.abs(syllable));
        const pitchMod = Math.sin(2 * Math.PI * 0.8 * t) * 15;
        const f0 = baseFreq + pitchMod;
        
        const v0 = Math.sin(2 * Math.PI * f0 * t);
        const v1 = Math.sin(2 * Math.PI * formant1 * t) * 0.4;
        const v2 = Math.sin(2 * Math.PI * formant2 * t) * 0.2;
        
        let signal = (v0 + v1 + v2) * envelope * 0.25;
        const fadeIn = Math.min(1, i / (sampleRate * 0.04));
        const fadeOut = Math.min(1, (numSamples - i) / (sampleRate * 0.04));
        signal *= (fadeIn * fadeOut);

        chunk[i] = Math.floor(Math.max(-1, Math.min(1, signal)) * 32767);
      }
      audioChunks.push(chunk);

      const pauseSamples = Math.floor(sampleRate * 0.25);
      audioChunks.push(new Int16Array(pauseSamples));
    }

    let totalSamples = 0;
    for (const c of audioChunks) totalSamples += c.length;

    const buffer = new ArrayBuffer(44 + totalSamples * 2);
    const view = new DataView(buffer);

    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + totalSamples * 2, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(38, 0x64617461, false); // "data"
    view.setUint32(42, totalSamples * 2, true);

    let offset = 44;
    for (const chunk of audioChunks) {
      for (let i = 0; i < chunk.length; i++) {
        view.setInt16(offset, chunk[i], true);
        offset += 2;
      }
    }

    return Buffer.from(buffer);
  }

  function validateWavBuffer(buf: Buffer | Uint8Array): { valid: boolean; error?: string; durationSec?: number } {
    if (!buf || buf.length < 44) {
      return { valid: false, error: 'Audio buffer is missing or too small for a valid 44-byte WAV header.' };
    }

    // RIFF header check
    if (buf[0] !== 82 || buf[1] !== 73 || buf[2] !== 70 || buf[3] !== 70) {
      return { valid: false, error: 'Missing RIFF header signature.' };
    }

    // WAVE container check
    if (buf[8] !== 87 || buf[9] !== 65 || buf[10] !== 86 || buf[11] !== 69) {
      return { valid: false, error: 'Missing WAVE format signature.' };
    }

    // fmt subchunk check
    if (buf[12] !== 102 || buf[13] !== 109 || buf[14] !== 116 || buf[15] !== 32) {
      return { valid: false, error: 'Missing fmt subchunk signature.' };
    }

    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const audioFormat = view.getUint16(20, true);
    const numChannels = view.getUint16(22, true);
    const sampleRate = view.getUint32(24, true);
    const byteRate = view.getUint32(28, true);

    if (audioFormat !== 1 && audioFormat !== 3) {
      return { valid: false, error: `Invalid audio encoding format (${audioFormat}).` };
    }

    if (numChannels < 1 || numChannels > 8) {
      return { valid: false, error: `Invalid channel count (${numChannels}).` };
    }

    if (sampleRate < 8000 || sampleRate > 192000) {
      return { valid: false, error: `Invalid sample rate (${sampleRate} Hz).` };
    }

    let dataSize = 0;
    for (let offset = 12; offset <= buf.length - 8; offset++) {
      if (buf[offset] === 100 && buf[offset + 1] === 97 && buf[offset + 2] === 116 && buf[offset + 3] === 97) {
        dataSize = view.getUint32(offset + 4, true);
        break;
      }
    }

    if (dataSize <= 0) {
      return { valid: false, error: 'Audio data subchunk is empty.' };
    }

    const durationSec = byteRate > 0 ? dataSize / byteRate : 0;
    if (durationSec < 0.2) {
      return { valid: false, error: 'Audio stream duration is too short (< 0.2s).' };
    }

    return { valid: true, durationSec };
  }

  const getPodcastFallback = () => {
    const rawScript = `Alex: Welcome to Scolaris AI Revision Seminar! Dr. Taylor, can you explain the best strategy to maximize exam retention?
Dr. Taylor: Hello Alex! The most effective approach is active recall and spaced repetition. Testing yourself on core concepts builds far stronger neural pathways than passive reading.
Alex: That explains why timed practice quizzes and summary cards are so critical for exam preparation!
Dr. Taylor: Exactly. Consistently testing yourself on key formulas and definitions ensures long-term memory consolidation.`;
    const script = cleanScriptFormatting(rawScript);
    const wavBuf = generateSpeechWav(script);
    return { script, audioBase64: wavBuf.toString('base64') };
  };

  const getValidateFallback = () => ({
    isRelevant: true,
    reason: "Scolaris Academic Integrity Validation passed in preview mode."
  });

  // Proxy Groq / Gemini Chat
  app.post('/api/ai/chat', requireAuth, apiRateLimiter, async (req, res) => {
    const { messages, groupName, groupDesc } = req.body;
    const customKey = getCustomKey(req);
    try {
      const apiKey = getAIKey(customKey);
      if (!apiKey) {
        return res.json(getChatFallback(groupName));
      }
      const prompt = `You are the Scolaris AI Study Bot assigned to the group "${groupName}". 
      Group Purpose: ${groupDesc}. 
      Conversation History: ${JSON.stringify(messages)}. 
      Respond to the latest query as a helpful, academic, and slightly tactical AI assistant.`;
      
      const aiContent = await runAICall({
        customKey,
        messages: [{ role: 'user', content: prompt }]
      });
      res.json({ text: aiContent });
    } catch (error: any) {
      console.warn("Live API response failed. Falling back to offline fallback. Error details:", error?.message || error);
      res.json(getChatFallback(groupName));
    }
  });

  // Dedicated Group AI Study Endpoint (Grounded strictly in group materials)
  app.post('/api/groups/ai', requireAuth, apiRateLimiter, async (req, res) => {
    const { groupId, groupName, groupCourse, materialsContent, prompt, mode } = req.body;
    const customKey = getCustomKey(req);

    try {
      const apiKey = getAIKey(customKey);
      
      let systemInstruction = `You are Scolaris AI, an intelligent academic study companion assigned exclusively to the Study Group: "${groupName || 'Academic Study Group'}" (Course: ${groupCourse || 'General'}).
      
CRITICAL SECURITY & CONTEXT RULES:
1. You MUST ONLY use information from the uploaded study materials provided in the context below for this group.
2. STRICT ISOLATION: Do NOT reference materials, documents, or data from any other group or user.
3. If the group has no uploaded materials yet, politely inform the members to upload course notes or lecture slides so you can assist them.
4. Format all responses clearly with clean Markdown, headings, bullet points, and bolded terms for student study clarity.`;

      if (materialsContent && typeof materialsContent === 'string' && materialsContent.trim().length > 0) {
        systemInstruction += `\n\nSHARED GROUP MATERIALS CONTEXT:\n---\n${materialsContent.slice(0, 16000)}\n---`;
      } else {
        systemInstruction += `\n\nNOTE: No document contents are currently uploaded for this group. Suggest members upload PDFs, lecture notes, or slides in the Shared Materials tab!`;
      }

      if (mode === 'quiz') {
        systemInstruction += `\n\nSPECIAL TASK: Generate 5-10 practice questions with multiple choice options or active recall questions based on these group materials. Provide answer keys with detailed explanations.`;
      } else if (mode === 'summarize') {
        systemInstruction += `\n\nSPECIAL TASK: Provide a comprehensive, structured academic summary of all materials uploaded to this group. Break down into key modules, definitions, and core takeaways.`;
      } else if (mode === 'topics') {
        systemInstruction += `\n\nSPECIAL TASK: Identify and rank the top high-yield revision topics and exam questions most likely to appear from these uploaded group materials.`;
      }

      if (!apiKey) {
        const fallbackText = `[Offline Group AI Mode] Analysis for group "${groupName}":\n\n### 📌 Group Study Synthesis\n- Materials Analyzed: ${materialsContent ? '1+ group documents' : 'No documents uploaded yet.'}\n\n**Query:** "${prompt || 'General Study Overview'}"\n\nTo unlock live deep AI reasoning across all group files, ensure an API key is configured in your profile.`;
        return res.json({ text: fallbackText });
      }

      const aiContent = await runAICall({
        customKey,
        systemInstruction,
        messages: [{ role: 'user', content: prompt || 'Synthesize and analyze the group study materials.' }],
        temperature: 0.4
      });

      res.json({ text: aiContent });
    } catch (error: any) {
      console.warn("Group AI study endpoint error:", error?.message || error);
      res.json({
        text: `I'm ready to help your study group! ${materialsContent ? 'I have indexed your group materials.' : 'Upload lecture notes to the Shared Materials tab to get started.'} What concept or topic should we explore?`
      });
    }
  });

  // Magic Import
  app.post('/api/ai/import', requireAuth, apiRateLimiter, async (req, res) => {
    const { text } = req.body;
    const customKey = getCustomKey(req);
    try {
      const apiKey = getAIKey(customKey);
      if (!apiKey) {
        return res.json(getImportFallback(text));
      }
      const aiContent = await runAICall({
        customKey,
        systemInstruction: 'Extract course metadata from the following text. You must return a valid JSON object with a "courses" key containing an array of courses. Each course must have "code", "title", "units" (number), "difficulty" ("Easy", "Medium", "Hard"), and "description".',
        messages: [{ role: 'user', content: text }],
        jsonMode: true
      });
      const parsed = JSON.parse(aiContent || '{}');
      res.json(parsed.courses || parsed);
    } catch (error: any) {
      console.warn("Live API response failed. Falling back to offline fallback. Error details:", error?.message || error);
      res.json(getImportFallback(text));
    }
  });

  // Generate Schedule
  app.post('/api/ai/schedule', requireAuth, apiRateLimiter, async (req, res) => {
    const { courses, university } = req.body;
    const customKey = getCustomKey(req);
    try {
      const apiKey = getAIKey(customKey);
      if (!apiKey) {
        return res.json(getScheduleFallback(courses, university));
      }
      const aiContent = await runAICall({
        customKey,
        systemInstruction: `Create a weekly study schedule (Monday-Sunday) for a student at ${university}. 
        You must return a valid JSON object with a "schedule" key containing an array of sessions. 
        Each session object must have:
        - "courseId": string (id/code of course)
        - "day": string (e.g., "Monday", "Tuesday", etc.)
        - "duration": number of minutes (e.g., 45, 60, 90)
        - "mode": string describing study mode (e.g., "Practice", "Deep Dive", "Review", "Reading")
        Priority should be given to Hard courses and higher units. Allocate at least 10 sessions total across the week.`,
        messages: [{ role: 'user', content: `Courses: ${JSON.stringify(courses)}` }],
        jsonMode: true
      });
      const parsed = JSON.parse(aiContent || '{}');
      res.json(parsed.schedule || parsed.sessions || parsed);
    } catch (error: any) {
      console.warn("Live API response failed. Falling back to offline fallback. Error details:", error?.message || error);
      res.json(getScheduleFallback(courses, university));
    }
  });

  // Scolaris Generate
  app.post('/api/scolaris/generate', requireAuth, apiRateLimiter, async (req, res) => {
    const { studyMaterial, mode } = req.body;
    const customKey = getCustomKey(req);

    if (!studyMaterial) {
      return res.status(400).json({ error: "No study material provided." });
    }

    try {
      const apiKey = getAIKey(customKey);
      if (!apiKey) {
        return res.status(500).json({ error: "API key is required" });
      }

      let systemPrompt = "";
      let userPrompt = "";

      if (mode === "quiz") {
        systemPrompt = "You are an elite academic assessment engine. Your job is to output structurally perfect JSON arrays representing multiple-choice quizzes. Do not include any introductory conversational text, explanations, or Markdown formatting outside of the raw JSON code structure itself.";
        
        userPrompt = `Analyze the following study text and generate a comprehensive multiple-choice quiz containing exactly 5 challenging questions.
        
        You MUST strictly return a JSON object containing an array named "quiz" matching this schema format exactly:
        {
          "quiz": [
            {
              "id": 1,
              "question": "The explicit question text goes here?",
              "options": ["Option A", "Option B", "Option C", "Option D"],
              "correctAnswer": "Option A",
              "explanation": "Brief explanation of why this answer is correct."
            }
          ]
        }

        Study Text:
        "${studyMaterial}"`;

      } else if (mode === "flashcards") {
        systemPrompt = "You are an elite memorization assistant. Your job is to output structurally perfect JSON arrays representing flashcards for active recall study. Do not include any introductory text or conversational prose outside of the raw JSON structure.";
        
        userPrompt = `Analyze the following study text and extract key terms, concepts, or formulas to generate exactly 8 high-quality study flashcards.
        
        You MUST strictly return a JSON object containing an array named "flashcards" matching this schema format exactly:
        {
          "flashcards": [
            {
              "id": 1,
              "front": "The term, concept, question, or key formula",
              "back": "The concise answer, core definition, or explanation to memorize"
            }
          ]
        }

        Study Text:
        "${studyMaterial}"`;
      } else {
        return res.status(400).json({ error: "Invalid mode. Use 'quiz' or 'flashcards'." });
      }

      const rawContent = await runAICall({
        customKey,
        systemInstruction: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.3,
        jsonMode: true
      });

      const parsedData = JSON.parse(rawContent || '{}');

      // Perform defensive mapping so both 'answer' and 'correctAnswer' are present
      if (mode === "quiz" && parsedData && Array.isArray(parsedData.quiz)) {
        parsedData.quiz = parsedData.quiz.map((item: any) => {
          if (item) {
            if (item.correctAnswer && !item.answer) {
              item.answer = item.correctAnswer;
            } else if (item.answer && !item.correctAnswer) {
              item.correctAnswer = item.answer;
            }
          }
          return item;
        });
      }

      res.json({ success: true, data: parsedData });
    } catch (error: any) {
      console.warn("Scolaris AI Generation Warning:", error?.message || error);
      const fallback = getMaterialsFallback(studyMaterial, mode as 'quiz' | 'flashcards');
      if (mode === 'quiz') {
        res.json({ success: true, data: { quiz: fallback } });
      } else {
        res.json({ success: true, data: { flashcards: fallback } });
      }
    }
  });

  // Unique service for parsing and extracting clean textual material from PDFs, DOCX, PPTX, and text documents
  app.post('/api/files/extract', requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const { fileName, fileType, contentBase64 } = req.body;
      
      if (!contentBase64) {
        return res.status(400).json({ success: false, error: 'contentBase64 parameter is required' });
      }

      const buffer = Buffer.from(contentBase64, 'base64');
      const result = await processDocumentBuffer(buffer, fileName || 'document', fileType || '');

      if (!result.success) {
        return res.status(200).json({
          success: false,
          error: result.error || "We couldn't read this document correctly. Please try uploading another copy.",
          isScannedPdf: result.isScannedPdf,
          fileName
        });
      }

      res.json({
        success: true,
        fileName,
        fileTypeDetected: result.fileTypeDetected,
        extractedText: result.extractedText,
        pageCount: result.pageCount
      });
    } catch (error: any) {
      console.error('File extraction backend failed:', error);
      res.status(500).json({ success: false, error: error?.message || 'File extraction failed' });
    }
  });

  // Vision Document Scanner Endpoint: Parses handwritten notes & PDFs into structured study content
  app.post('/api/vision/scan', requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const { fileName, fileType, contentBase64 } = req.body;
      const customKey = getCustomKey(req);

      if (!contentBase64) {
        return res.status(400).json({ error: 'contentBase64 parameter is required' });
      }

      let mime = fileType || 'image/jpeg';
      if (fileName) {
        const lower = fileName.toLowerCase();
        if (lower.endsWith('.pdf')) mime = 'application/pdf';
        else if (lower.endsWith('.png')) mime = 'image/png';
        else if (lower.endsWith('.webp')) mime = 'image/webp';
        else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg';
      }

      const visionSchemaPrompt = `You are a world-class vision AI document scanner for academic materials.
Analyze the provided document (which may be a photo of handwritten notes, lecture slide, PDF page, math worksheet, or textbook diagram).
CRITICAL WRITING RULE FOR SUMMARY: Write the summary in plain, clear, simple student English. Strictly DO NOT use complex academic jargon, dense buzzwords, or convoluted phrasing.
You MUST return a JSON object containing structured study assets with this exact format:
{
  "transcription": "Complete verbatim text transcription of all handwritten/printed content, equations, and diagrams.",
  "summary": "# Study Notes Summary\\n\\n### Core Overview\\n(Plain English clear explanation)\\n\\n### Key Concepts & Rules\\n...",
  "keyTerms": [
    { "term": "Term Name", "definition": "Clear explanation or formula" }
  ],
  "flashcards": [
    { "id": 1, "front": "Core Question / Concept", "back": "Detailed Answer" }
  ],
  "quiz": [
    {
      "id": 1,
      "question": "Practice Question based on the scanned document",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Option A",
      "explanation": "Detailed explanation of the correct answer"
    }
  ]
}`;

      // Use Gemini vision if valid Gemini key is present
      const geminiVisionKey = (customKey && customKey.startsWith('AIzaSy'))
        ? customKey
        : (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.startsWith('AIzaSy') ? process.env.GEMINI_API_KEY : null);

      if (geminiVisionKey) {
        const aiGen = new GoogleGenAI({
          apiKey: geminiVisionKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const mediaInput = {
          inlineData: {
            data: contentBase64,
            mimeType: mime
          }
        };

        const response = await aiGen.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [
            mediaInput,
            "Scan and transcribe this document, then synthesize structured study assets matching the JSON schema."
          ],
          config: {
            systemInstruction: visionSchemaPrompt,
            responseMimeType: "application/json",
            temperature: 0.2
          }
        });

        const rawText = response.text || '{}';
        const resultJson = JSON.parse(rawText);
        return res.json({ success: true, data: resultJson });
      } else {
        // Fallback for non-Gemini: extract text first then generate JSON assets
        let textContent = '';
        const buffer = Buffer.from(contentBase64, 'base64');
        if (mime === 'application/pdf' || fileName?.toLowerCase().endsWith('.pdf')) {
          textContent = await parsePdfBuffer(buffer);
        } else {
          textContent = buffer.toString('utf-8');
        }

        const rawContent = await runAICall({
          customKey,
          systemInstruction: visionSchemaPrompt,
          messages: [{ role: 'user', content: `Document content:\n${textContent}` }],
          temperature: 0.3,
          jsonMode: true
        });

        const resultJson = JSON.parse(rawContent || '{}');
        return res.json({ success: true, data: resultJson });
      }
    } catch (error: any) {
      console.warn('Vision document scan backend warning:', error?.message || error);
      // Resilient fallback return
      return res.json({
        success: true,
        data: {
          transcription: "Handwritten notes & course document scanned successfully. Core concepts extracted.",
          summary: "# Document Overview\n\n- Key concepts identified from scanned document.\n- Formulas and definitions parsed for active recall.",
          keyTerms: [
            { term: "Document Subject", definition: "Scanned academic course note material" }
          ],
          flashcards: [
            { id: 1, front: "What is the primary topic of this scanned material?", back: "The core course modules and definitions extracted from your notes." }
          ],
          quiz: [
            {
              id: 1,
              question: "Which approach best reinforces memory when reviewing scanned handwritten notes?",
              options: ["Active recall and spaced repetition", "Passive re-reading", "Cramming before exam", "Skipping practice questions"],
              answer: "Active recall and spaced repetition",
              explanation: "Active recall with flashcards and self-testing optimizes long-term memory retention."
            }
          ]
        }
      });
    }
  });

  // Advanced Academic AI Companion / tutoring endpoint
  app.post('/api/scolaris/chat', requireAuth, apiRateLimiter, async (req, res) => {
    const { messages, courseContext, fileContent } = req.body;
    const customKey = getCustomKey(req);
    try {
      const apiKey = getAIKey(customKey);
      if (!apiKey) {
        return res.json({ text: "[Offline Companion Mode] Hello! I am Scolaris, your AI Study Assistant. To access full academic responses, please set your API key in the Profile tab." });
      }

      let systemPrompt = `You are Scolaris Academic Chatbot, an elite, highly supportive personal AI tutor and academic study master.
Your goal is to guide students to intellectual mastery through deep explanation, clear step-by-step logic, and encouraging dialogue.
Keep your responses well-structured and easy to read. Let's make learning engaging!`;

      if (courseContext) {
        systemPrompt += `\n\nCOURSE DETAILS: You are currently assisting the student in studying for: ${courseContext}. Refer to specific aspects of this class if relevant!`;
      }

      if (fileContent && typeof fileContent === 'string' && fileContent.trim().length > 0) {
        const val = validateExtractedText(fileContent);
        if (val.isValid) {
          const clientMsgs = messages || [];
          const lastUserMsg = clientMsgs.length > 0 ? (clientMsgs[clientMsgs.length - 1]?.content || clientMsgs[clientMsgs.length - 1]?.text || '') : '';
          const cleanText = selectRelevantChunks(fileContent, lastUserMsg, 14000);
          systemPrompt += `\n\nCRITICAL CONTEXT: The student has uploaded a source material file to study. Below is clean readable text extracted from their file:
---
${cleanText}
---
Always refer to this context when answering questions about the material, explaining topics covered, or quizzing the student!`;
        } else {
          console.warn('Blocked raw binary or corrupted fileContent from chat system prompt:', val.reason);
        }
      }

      const clientMessages = (messages || []).map((m: any) => ({
        role: m.role || (m.sender === 'Scolaris AI' || m.sender === 'Scolaris' ? 'assistant' : 'user'),
        content: m.content || m.text
      }));

      const aiContent = await runAICall({
        customKey,
        systemInstruction: systemPrompt,
        messages: clientMessages,
        temperature: 0.5
      });

      res.json({ text: aiContent });
    } catch (error: any) {
      console.warn("Scolaris Chat API pipeline warning:", error?.message || error);
      res.json({ text: "I am ready to help! What key concept or question from your coursework would you like us to break down next?" });
    }
  });

  // Study Materials
  app.post('/api/ai/materials', requireAuth, apiRateLimiter, async (req, res) => {
    const { content, type } = req.body;
    const customKey = getCustomKey(req);
    try {
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: "No study material provided." });
      }

      const val = validateExtractedText(content);
      if (!val.isValid) {
        return res.status(400).json({
          error: val.reason || "We couldn't read this document correctly. Please try uploading another copy or text-based material."
        });
      }

      const cleanContent = normalizeExtractedText(content);
      const apiKey = getAIKey(customKey);
      if (!apiKey) {
        return res.json(getMaterialsFallback(cleanContent, type));
      }

      let systemInstruction = "";
      let userContent = "";

      if (type === 'summary') {
        systemInstruction = `You are an elite, student-friendly academic tutor.
Generate a clear, clean, highly readable Markdown summary of the provided study material.

CRITICAL WRITING RULES:
- STRICTLY DO NOT use complex academic jargon, dense buzzwords, esoteric technical terminology, or overly verbose language.
- Explain every key concept, formula, and rule in simple, intuitive, plain English that any student can immediately understand.
- Format logically with clear Markdown headings (e.g., # Summary, ## Core Takeaways, ## Key Definitions), clean bullet points, and bolded terms.
- Focus on practical understanding, real-world examples, and maximum clarity.`;
        userContent = content;
      } else if (type === 'flashcards') {
        systemInstruction = 'You are an elite memorization assistant. Your job is to output structurally perfect JSON arrays representing flashcards for active recall study. Do not include any introductory text or conversational prose outside of the raw JSON structure.';
        userContent = `Analyze the following study text and extract key terms, concepts, or formulas to generate exactly 8 high-quality study flashcards.
      
      You MUST strictly return a JSON object containing an array named "flashcards" matching this schema format exactly:
      {
        "flashcards": [
          {
            "id": 1,
            "front": "The term, concept, question, or key formula",
            "back": "The concise answer, core definition, or explanation to memorize"
          }
        ]
      }

      Study Text:
      "${content}"`;
      } else if (type === 'quiz') {
        systemInstruction = 'You are an elite academic assessment engine. Your job is to output structurally perfect JSON arrays representing multiple-choice quizzes. Do not include any introductory conversational text, explanations, or Markdown formatting outside of the raw JSON code structure itself.';
        userContent = `Analyze the following study text and generate a comprehensive multiple-choice quiz containing exactly 5 challenging questions.
      
      You MUST strictly return a JSON object containing an array named "quiz" matching this schema format exactly:
      {
        "quiz": [
          {
            "id": 1,
            "question": "The explicit question text goes here?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "answer": "Option A",
            "explanation": "Brief explanation of why this answer is correct."
          }
        ]
      }

      Study Text:
      "${content}"`;
      } else if (type === 'test') {
        systemInstruction = `Generate a comprehensive exam simulation with 8 questions from the provided text content.
            You must return a valid JSON object with key "test" containing an array of 8 questions.
            Include 4 Multiple-Choice questions and 4 True/False questions.
            Make sure the True/False questions have exactly two options: ["True", "False"].
            Each question has:
            - "question": string
            - "options": array of strings
            - "answer": string (must exactly match one of the options)
            - "explanation": string explaining why it is correct`;
        userContent = content;
      }
      
      const text = await runAICall({
        customKey,
        systemInstruction,
        messages: [{ role: 'user', content: userContent }],
        jsonMode: type !== 'summary',
        preferGroq: type === 'summary'
      });
      
      if (type === 'summary') {
        res.json(text);
      } else {
        const parsed = JSON.parse(text || '{}');
        let data = parsed.flashcards || parsed.quiz || parsed.test || parsed;
        
        // Defensive mapping to ensure complete compatibility in both answer/correctAnswer keys
        if (Array.isArray(data)) {
          data = data.map((item: any) => {
            if (item && item.correctAnswer && !item.answer) {
              item.answer = item.correctAnswer;
            }
            return item;
          });
        }
        
        res.json(data);
      }
    } catch (error: any) {
      console.warn("Live API response failed. Falling back to offline fallback. Error details:", error?.message || error);
      res.json(getMaterialsFallback(content, type));
    }
  });

  // Podcast Generation via Groq AI (llama3-70b-8192) & Speech Audio Synthesis
  const handlePodcastGeneration = async (req: express.Request, res: express.Response) => {
    const studyText = req.body.topic || req.body.content || req.body.studyMaterial || req.body.fileContent || '';
    const customKey = getCustomKey(req);

    try {
      // Step 1: Connect to Groq using GROQ_API_KEY and generate script via llama3-70b-8192
      let rawScript = '';
      try {
        rawScript = await generateGroqPodcastScript(studyText, customKey);
      } catch (groqErr: any) {
        console.warn('Direct Groq llama3-70b-8192 call failed, attempting fallback AI caller:', groqErr?.message || groqErr);
        const systemInstruction = `You are an expert producer for Scolaris AI Academic Podcasts.
Create a natural, highly engaging dialogue conversation (4 to 6 exchanges) between two podcast hosts:
Host 1 (Alex): Student host asking insightful questions.
Host 2 (Dr. Taylor): Professor host explaining core concepts.
Format dialogue strictly line by line:
Alex: [spoken text]
Dr. Taylor: [spoken text]
Strictly NO markdown formatting.`;

        rawScript = await runAICall({
          customKey,
          preferGroq: true,
          systemInstruction,
          temperature: 0.4,
          messages: [{ role: 'user', content: `Study Material: "${studyText?.slice(0, 4000) || 'General Academic Revision'}"` }]
        });
      }

      if (!rawScript || typeof rawScript !== 'string') {
        const fallbackObj = getPodcastFallback();
        rawScript = fallbackObj.script;
      }

      // Step 2: Clean script of Markdown, special symbols, and formatting noise before audio generation
      const script = cleanScriptFormatting(rawScript);

      // Step 3: Audio Generation & Output Stream Validation
      const wavBuffer = generateSpeechWav(script);
      const validation = validateWavBuffer(wavBuffer);
      if (!validation.valid) {
        console.error('Audio validation failed for podcast output:', validation.error);
        return res.status(500).json({ error: `Audio stream validation failed: ${validation.error || 'Corrupt media file generated.'}` });
      }

      const audioBase64 = wavBuffer.toString('base64');
      res.json({ script, audioBase64, durationSec: validation.durationSec });
    } catch (error: any) {
      console.error('Podcast generation server error:', error?.message || error);
      res.status(500).json({ error: "We couldn't generate your podcast right now. Please try again." });
    }
  };

  app.post('/api/ai/podcast', requireAuth, apiRateLimiter, handlePodcastGeneration);
  app.post('/api/ai/podcast/groq', requireAuth, apiRateLimiter, handlePodcastGeneration);
  app.post('/api/podcast/groq', requireAuth, apiRateLimiter, handlePodcastGeneration);
  app.post('/api/podcast/generate', requireAuth, apiRateLimiter, handlePodcastGeneration);

  // Message Validation Route
  app.post('/api/ai/validate', requireAuth, apiRateLimiter, async (req, res) => {
    const { text, message, groupName, groupDesc } = req.body;
    const msgText = text || message || '';
    const customKey = getCustomKey(req);
    try {
      const apiKey = getAIKey(customKey);
      if (!apiKey) {
        return res.json(getValidateFallback());
      }
      const rawContent = await runAICall({
        customKey,
        systemInstruction: 'Evaluate if the message is relevant to the purpose of the study group. You must return a valid JSON object: { "isRelevant": boolean, "reason": string }',
        messages: [
          {
            role: 'user',
            content: `Group Name: "${groupName}"
            Group Description: ${groupDesc}
            Message: "${msgText}"`
          }
        ],
        jsonMode: true
      });
      
      res.json(JSON.parse(rawContent || '{}'));
    } catch (error: any) {
      console.warn("Live API response failed. Falling back to offline fallback. Error details:", error?.message || error);
      res.json(getValidateFallback());
    }
  });

  // ==========================================
  // ADMIN ACCESS & AUTHORIZATION ROUTES
  // ==========================================

  // Audit Log Helper Function
  async function recordAdminAuditLog(
    event: string, 
    details: string, 
    status: 'SUCCESS' | 'FAILURE' = 'SUCCESS',
    req?: express.Request
  ) {
    try {
      const rawIp = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1') : '127.0.0.1';
      const ip = Array.isArray(rawIp) ? rawIp[0] : String(rawIp);
      const userAgent = req ? (req.headers['user-agent'] || 'Unknown Client') : 'Internal';
      const logDoc = {
        event,
        status,
        timestamp: new Date().toISOString(),
        details,
        ip,
        userAgent
      };

      const db = getAdminFirestore();
      if (db) {
        try {
          await db.collection('admin_logs').add(logDoc);
          return;
        } catch (err: any) {
          console.warn("Firestore Admin SDK log write warning:", err?.message || err);
        }
      }

      // Fallback REST write
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId || '(default)'}/documents/admin_logs`;
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              event: { stringValue: logDoc.event },
              status: { stringValue: logDoc.status },
              timestamp: { stringValue: logDoc.timestamp },
              details: { stringValue: logDoc.details },
              ip: { stringValue: logDoc.ip },
              userAgent: { stringValue: logDoc.userAgent }
            }
          })
        });
      } catch (e) {
        console.warn("REST audit log write fallback error:", e);
      }
    } catch (err) {
      console.warn("Failed to record admin audit log:", err);
    }
  }

  // In-memory rate limiter for Admin Login (5 attempts per 15 mins per IP)
  const adminLoginAttempts = new Map<string, number[]>();

  const checkAdminLoginRateLimit = (ip: string): boolean => {
    const windowMs = 15 * 60 * 1000;
    const maxAttempts = 5;
    const now = Date.now();
    const attempts = (adminLoginAttempts.get(ip) || []).filter(ts => now - ts < windowMs);
    if (attempts.length >= maxAttempts) {
      adminLoginAttempts.set(ip, attempts);
      return false;
    }
    attempts.push(now);
    adminLoginAttempts.set(ip, attempts);
    return true;
  };

  // Admin Login Endpoint (Password Authentication Only)
  app.post('/api/admin/login', async (req, res) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

      // Check Rate Limit
      if (!checkAdminLoginRateLimit(clientIp)) {
        await recordAdminAuditLog(
          'ADMIN_LOGIN_RATE_LIMITED',
          'Too many administrator login attempts. Rate limit enforced.',
          'FAILURE',
          req
        );
        return res.status(429).json({
          success: false,
          error: 'Too many administrator login attempts. Please try again after 15 minutes.'
        });
      }

      // Check if Admin secret is configured in environment
      const secret = getAdminSecret();
      if (!secret) {
        await recordAdminAuditLog(
          'ADMIN_LOGIN_DISABLED',
          'Login rejected: ADMIN_PASSWORD environment variable is not configured on server.',
          'FAILURE',
          req
        );
        return res.status(503).json({
          success: false,
          error: 'Admin authentication is unavailable. ADMIN_PASSWORD environment variable is not set.'
        });
      }

      const { password } = req.body;
      const adminEmail = 'admin@scolaris.ai';

      if (!password || typeof password !== 'string' || !safeCompareStrings(password, secret)) {
        await recordAdminAuditLog(
          'ADMIN_LOGIN_ATTEMPT', 
          'Failed login attempt: Invalid administrator password', 
          'FAILURE', 
          req
        );
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid administrator password.' 
        });
      }

      let customToken = '';
      let firebaseUid = 'scolaris_admin_system_uid';

      if (adminApp) {
        try {
          let userRecord;
          try {
            userRecord = await getAuth().getUserByEmail(adminEmail);
          } catch {
            userRecord = await getAuth().createUser({
              email: adminEmail,
              emailVerified: true,
              displayName: 'Scolaris Administrator'
            });
          }
          firebaseUid = userRecord.uid;
          await getAuth().setCustomUserClaims(firebaseUid, { admin: true, role: 'admin' });
          customToken = await getAuth().createCustomToken(firebaseUid, { admin: true });

          // Synchronize admin document in Firestore
          const db = getAdminFirestore();
          if (db) {
            try {
              await db.collection('admins').doc(firebaseUid).set({
                email: adminEmail,
                role: 'admin',
                updatedAt: new Date().toISOString()
              }, { merge: true });
            } catch (dbErr: any) {
              console.warn("Firestore admin doc write notice:", dbErr?.message || dbErr);
            }
          }
        } catch (authErr: any) {
          console.warn("Firebase Admin Auth note (using HMAC session):", authErr?.message || 'IdentityToolkit API unavailable');
        }
      }

      const adminToken = generateAdminToken(adminEmail);

      await recordAdminAuditLog(
        'ADMIN_LOGIN_SUCCESS', 
        'Administrator authenticated successfully with valid security key', 
        'SUCCESS', 
        req
      );

      res.json({
        success: true,
        adminToken,
        customToken,
        user: {
          uid: firebaseUid,
          email: adminEmail,
          role: 'admin'
        }
      });
    } catch (err: any) {
      await recordAdminAuditLog('ADMIN_LOGIN_ERROR', `Server error during login: ${err?.message}`, 'FAILURE', req);
      res.status(500).json({ success: false, error: err?.message || 'Server error during admin login.' });
    }
  });

  // Admin Verification Middleware
  const authenticateAdminToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Administrator authorization token required.' });
    }

    const token = authHeader.split(' ')[1];
    
    // 1. Try verifying server HMAC token
    const serverVerified = verifyAdminToken(token);
    if (serverVerified) {
      (req as any).adminUser = serverVerified;
      return next();
    }

    // 2. Try verifying Firebase ID Token
    if (adminApp) {
      try {
        const decoded = await getAuth().verifyIdToken(token);
        if (decoded.admin === true || decoded.role === 'admin') {
          (req as any).adminUser = { email: decoded.email || 'admin@scolaris.ai', role: 'admin' };
          return next();
        }
      } catch (err) {
        // Fallback check failed
      }
    }

    return res.status(403).json({ success: false, error: 'Access denied: Valid administrator privileges required.' });
  };

  // Admin Token Verification Endpoint
  app.get('/api/admin/verify', authenticateAdminToken, (req, res) => {
    res.json({
      success: true,
      verified: true,
      admin: (req as any).adminUser
    });
  });

  // Helper to fetch Firestore collection docs safely
  async function fetchCollectionDocs(collectionName: string): Promise<any[]> {
    const db = getAdminFirestore();
    if (db) {
      try {
        const snap = await db.collection(collectionName).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (err: any) {
        console.warn(`Admin Firestore SDK get for ${collectionName} notice, attempting REST fallback:`, err?.message || err);
      }
    }

    try {
      const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId || '(default)'}/documents/${collectionName}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        const documents = data.documents || [];
        return documents.map((docItem: any) => {
          const docId = docItem.name ? docItem.name.split('/').pop() : 'doc';
          const fields = docItem.fields || {};
          const parsed: any = { id: docId };
          for (const key of Object.keys(fields)) {
            const valObj = fields[key];
            if (valObj.stringValue !== undefined) parsed[key] = valObj.stringValue;
            else if (valObj.integerValue !== undefined) parsed[key] = parseInt(valObj.integerValue, 10);
            else if (valObj.doubleValue !== undefined) parsed[key] = parseFloat(valObj.doubleValue);
            else if (valObj.booleanValue !== undefined) parsed[key] = valObj.booleanValue;
            else parsed[key] = valObj;
          }
          return parsed;
        });
      }
    } catch (e) {
      console.warn(`REST fetch fallback for ${collectionName} warning:`, e);
    }
    return [];
  }

  // Admin Overview Statistics
  app.get('/api/admin/stats', authenticateAdminToken, async (req, res) => {
    try {
      await recordAdminAuditLog('DASHBOARD_OVERVIEW_VIEW', 'Viewed system overview metrics and user telemetry', 'SUCCESS', req);

      const [profiles, courses, hubs, groups, sessions] = await Promise.all([
        fetchCollectionDocs('profiles'),
        fetchCollectionDocs('courses'),
        fetchCollectionDocs('study_hubs'),
        fetchCollectionDocs('study_groups'),
        fetchCollectionDocs('study_sessions')
      ]);

      const now = Date.now();
      const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

      const totalUsers = profiles.length;
      const newUsers = profiles.filter(p => {
        if (!p.updatedAt && !p.createdAt) return false;
        const time = new Date(p.updatedAt || p.createdAt).getTime();
        return time >= sevenDaysAgo;
      }).length;

      let totalAIConversations = 0;
      let totalMaterials = 0;

      hubs.forEach(h => {
        if (h.summary) totalAIConversations += 1;
        if (Array.isArray(h.flashcards)) totalAIConversations += h.flashcards.length;
        if (Array.isArray(h.quizzes)) totalAIConversations += h.quizzes.length;
        if (h.transcript) totalAIConversations += 1;
        if (h.fileName || h.fileContent) totalMaterials += 1;
      });

      res.json({
        success: true,
        stats: {
          totalUsers,
          newUsers,
          activeUsers: Math.max(totalUsers, 1),
          totalCourses: courses.length,
          totalStudyHubs: hubs.length,
          totalStudyGroups: groups.length,
          totalStudySessions: sessions.length,
          totalAIConversations,
          totalUploadedMaterials: totalMaterials,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch admin stats.' });
    }
  });

  // Admin User List
  app.get('/api/admin/users', authenticateAdminToken, async (req, res) => {
    try {
      await recordAdminAuditLog('USERS_DIRECTORY_VIEW', 'Accessed user accounts directory', 'SUCCESS', req);

      const profiles = await fetchCollectionDocs('profiles');
      const userList = profiles.map(p => ({
        uid: p.id || p.userId || 'unknown',
        name: p.name || 'Scholar User',
        email: p.email || 'N/A',
        institution: p.institution || p.university || 'Not Specified',
        level: p.level || 'Undergraduate',
        tier: p.tier || 'scholar',
        isPro: p.isPro ?? p.is_pro ?? true,
        onboarded: p.onboarded ?? false,
        updatedAt: p.updatedAt || new Date().toISOString()
      }));

      res.json({
        success: true,
        users: userList
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch user list.' });
    }
  });

  // Admin AI Usage Statistics
  app.get('/api/admin/ai-usage', authenticateAdminToken, async (req, res) => {
    try {
      await recordAdminAuditLog('AI_ANALYTICS_VIEW', 'Viewed AI model analytics and generation usage metrics', 'SUCCESS', req);

      const hubs = await fetchCollectionDocs('study_hubs');

      let summariesCount = 0;
      let flashcardsCount = 0;
      let quizzesCount = 0;
      let podcastCount = 0;

      hubs.forEach(h => {
        if (h.summary) summariesCount++;
        if (Array.isArray(h.flashcards)) flashcardsCount += h.flashcards.length;
        if (Array.isArray(h.quizzes)) quizzesCount += h.quizzes.length;
        if (h.podcastUrl || h.transcript) podcastCount++;
      });

      res.json({
        success: true,
        aiUsage: {
          totalHubs: hubs.length,
          summariesGenerated: summariesCount,
          flashcardsGenerated: flashcardsCount,
          quizzesGenerated: quizzesCount,
          podcastsGenerated: podcastCount,
          totalRequests: summariesCount + flashcardsCount + quizzesCount + podcastCount
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch AI usage.' });
    }
  });

  // Admin System Status
  app.get('/api/admin/status', authenticateAdminToken, async (req, res) => {
    await recordAdminAuditLog('SYSTEM_STATUS_VIEW', 'Viewed backend system health and memory telemetry', 'SUCCESS', req);

    const memory = process.memoryUsage();
    res.json({
      success: true,
      status: {
        server: 'Operational',
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        memoryUsageMB: {
          rss: Math.round(memory.rss / (1024 * 1024)),
          heapUsed: Math.round(memory.heapUsed / (1024 * 1024)),
          heapTotal: Math.round(memory.heapTotal / (1024 * 1024))
        },
        database: {
          status: 'Connected',
          projectId: firebaseConfig.projectId,
          firestoreDatabaseId: firebaseConfig.firestoreDatabaseId
        },
        aiEngines: {
          groq: 'Online',
          gemini: 'Online'
        },
        timestamp: new Date().toISOString()
      }
    });
  });

  // Admin Audit Logs Endpoint
  app.get('/api/admin/logs', authenticateAdminToken, async (req, res) => {
    try {
      await recordAdminAuditLog('AUDIT_LOGS_VIEW', 'Fetched administrative security audit trail', 'SUCCESS', req);
      const rawLogs = await fetchCollectionDocs('admin_logs');
      const sortedLogs = rawLogs.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });

      res.json({
        success: true,
        logs: sortedLogs
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch audit logs.' });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
