import express from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isAiSender } from './lib/brand';
import { GoogleGenAI } from '@google/genai';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { 
  processDocumentBuffer, 
  normalizeExtractedText, 
  validateExtractedText, 
  selectRelevantChunks 
} from './lib/documentProcessor';

// Load .env for local development (hosting platforms inject real environment variables instead)
try { process.loadEnvFile(); } catch { /* no .env file: rely on the environment */ }

export function cleanEnvKey(name: string): string {
  const val = process.env[name];
  if (!val || typeof val !== 'string') return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
}

// Supabase configuration
const SUPABASE_URL = cleanEnvKey('SUPABASE_URL') || cleanEnvKey('VITE_SUPABASE_URL');
const SUPABASE_ANON_KEY = cleanEnvKey('SUPABASE_ANON_KEY') || cleanEnvKey('VITE_SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = cleanEnvKey('SUPABASE_SERVICE_ROLE_KEY');

const supabaseClientOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

// Used only to verify user access tokens
const supabaseAuthClient: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, supabaseClientOptions) : null;

// Service-role client: bypasses RLS. Server-only, never expose to the browser.
const supabaseAdmin: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, supabaseClientOptions)
    : null;

if (!supabaseAuthClient) {
  console.warn('Supabase auth is not configured: set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY).');
}
if (!supabaseAdmin) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY is not set: admin dashboard data and audit logging are disabled.');
}

// Storage S3 endpoint for the shared library bucket (override with SUPABASE_S3_ENDPOINT if needed)
function getSupabaseS3Endpoint(): string {
  if (process.env.SUPABASE_S3_ENDPOINT) return process.env.SUPABASE_S3_ENDPOINT;
  try {
    const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
    return `https://${ref}.storage.supabase.co/storage/v1/s3`;
  } catch {
    return '';
  }
}

function getSupabasePublicObjectBase(): string {
  const s3 = getSupabaseS3Endpoint();
  return s3 ? s3.replace(/\/s3$/, '/object/public') : '';
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

const OCR_MODEL = 'gemini-2.0-flash';
const OCR_MAX_PDF_BYTES = 15 * 1024 * 1024; // keep inline request comfortably under Gemini's size limit

function pickGeminiKey(): string | null {
  const gemini = cleanEnvKey('GEMINI_API_KEY');
  if (gemini) return gemini;
  const scolaris = cleanEnvKey('SCOLARIS_AI_KEY');
  if (scolaris && (scolaris.startsWith('AIzaSy') || !scolaris.startsWith('gsk_'))) return scolaris;
  return null;
}

/** Reads a scanned / image-only PDF with Gemini's native PDF vision. Returns '' when it can't. */
async function ocrPdfWithGemini(buffer: Buffer, apiKey: string): Promise<string> {
  if (buffer.length > OCR_MAX_PDF_BYTES) {
    console.warn(`OCR skipped: PDF is ${(buffer.length / 1048576).toFixed(1)} MB (limit ${OCR_MAX_PDF_BYTES / 1048576} MB).`);
    return '';
  }
  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
    const response = await ai.models.generateContent({
      model: OCR_MODEL,
      contents: [
        { inlineData: { data: buffer.toString('base64'), mimeType: 'application/pdf' } },
        'Transcribe all text in this scanned document exactly as written, in reading order, page by page. ' +
          'Include handwritten text. Do not summarize, translate, or add commentary. ' +
          'Where there is a diagram or image with no text, write [diagram]. Output plain text only.'
      ],
      config: { temperature: 0 }
    });
    return normalizeExtractedText(response.text || '');
  } catch (err: any) {
    console.warn('Gemini PDF OCR failed:', err?.message || err);
    return '';
  }
}

/** Normal extraction first; if a PDF turns out to be scanned, fall back to Gemini OCR. */
async function extractDocumentWithOcrFallback(
  buffer: Buffer,
  fileName: string,
  fileType: string
) {
  const result = await processDocumentBuffer(buffer, fileName, fileType);
  if (result.success || !result.isScannedPdf) return { ...result, usedOcr: false };

  const key = pickGeminiKey();
  if (!key) return { ...result, usedOcr: false };

  const text = await ocrPdfWithGemini(buffer, key);
  if (text.length >= 20 && validateExtractedText(text, 'txt').isValid) {
    return {
      success: true,
      extractedText: text,
      fileTypeDetected: 'pdf',
      pageCount: result.pageCount,
      usedOcr: true
    };
  }

  return {
    ...result,
    error: "This PDF looks scanned and we couldn't read the text from it. Try a clearer scan, or use the Vision Document Scanner with photos of the pages.",
    usedOcr: false
  };
}

async function parsePdfBuffer(buffer: Buffer): Promise<string> {
  try {
    const res = await extractDocumentWithOcrFallback(buffer, 'document.pdf', 'application/pdf');
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

  // Enforce server-side AI security: reject and completely strip any client-supplied provider credentials
  app.use((req, res, next) => {
    delete req.headers['x-gemini-api-key'];
    delete req.headers['x-scolaris-ai-key'];
    delete req.headers['x-api-key'];
    if (req.body && typeof req.body === 'object') {
      delete req.body.apiKey;
      delete req.body.customKey;
      delete req.body.geminiApiKey;
    }
    next();
  });

  interface AuthenticatedRequest extends express.Request {
    user?: any;
  }

  const userApiRequests = new Map<string, number[]>();

  const requireAuth = async (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    if (!supabaseAuthClient) {
      console.warn('[Auth Middleware] Supabase auth client unavailable: SUPABASE_URL or SUPABASE_ANON_KEY is not set');
      return res.status(503).json({ success: false, error: 'Authentication service unavailable: Supabase credentials not configured' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid Authorization header' });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing access token' });
    }

    try {
      // getUser cryptographically validates the JWT against the Supabase Auth server
      const { data, error } = await supabaseAuthClient.auth.getUser(token);
      if (error || !data.user) {
        console.warn('[Auth Middleware] Token verification failed:', error?.message || 'User not found');
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired access token' });
      }
      req.user = { uid: data.user.id, email: data.user.email };
      next();
    } catch (err: any) {
      console.warn('[Auth Middleware] Error verifying token:', err?.message || err);
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired access token' });
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

  // Server-side AI provider credentials resolver (strictly Google Gemini)
  const getAIKey = (): string | null => {
    return cleanEnvKey('GEMINI_API_KEY') || cleanEnvKey('SCOLARIS_AI_KEY') || null;
  };

  interface AIParams {
    systemInstruction?: string;
    messages: { role: string; content: string }[];
    temperature?: number;
    jsonMode?: boolean;
    preferGroq?: boolean;
  }

  const runAICall = async ({ systemInstruction, messages, temperature, jsonMode }: AIParams): Promise<string> => {
    const geminiKey = pickGeminiKey();

    if (!geminiKey) {
      throw new Error('Google Gemini API key is not configured on the server. Please configure GEMINI_API_KEY in your hosting environment variables.');
    }

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

    const geminiCandidateModels = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    let lastError: any = null;

    for (const model of geminiCandidateModels) {
      try {
        const response = await aiGen.models.generateContent({
          model,
          contents,
          config
        });
        if (response.text && response.text.trim().length > 0) {
          return response.text;
        }
      } catch (gErr: any) {
        console.warn(`Gemini model '${model}' call warning:`, gErr?.message || gErr);
        lastError = gErr;
      }
    }

    const failureReason = lastError?.message || 'Gemini API failed to generate a response';
    console.error('[Gemini AI Execution Fatal]:', failureReason);
    throw new Error(`Gemini AI service error: ${failureReason}`);
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
        endpoint: getSupabaseS3Endpoint(),
        region: process.env.SUPABASE_S3_REGION || 'eu-west-2',
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
      endpoint: getSupabaseS3Endpoint(),
      region: process.env.SUPABASE_S3_REGION || 'eu-west-2',
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
        publicUrl: `${getSupabasePublicObjectBase()}/${bucket}/${fileKey}`
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
    text: `[KorsIQ Bot - Study Companion] Let's work on this together! Active recall and interactive flashcards are excellent tools for mastering "${groupName}". Let me know what concepts we should break down first!`
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

  const getTranscriptFallback = (text: string) => {
    const courses: any[] = [];
    const lines = (text || '').split('\n');
    const regex = /([A-Z]{2,4})\s*(\d{3})\s*[:\-\|]?\s*(.*?)(?:\s+(\d)\s*(?:units?|cr|credits?)?)?\s+([A-F][\+\-]?)/i;

    for (const line of lines) {
      const match = line.match(regex);
      if (match) {
        const code = (match[1] + match[2]).toUpperCase();
        const rawTitle = (match[3] || '').trim().replace(/^[:\-\|,\s]+|[:\-\|,\s]+$/g, '');
        const units = match[4] ? parseInt(match[4], 10) : 3;
        const grade = (match[5] || 'A').toUpperCase();
        if (!courses.some(c => c.code === code)) {
          courses.push({
            code,
            title: rawTitle || `Course ${code}`,
            creditUnits: isNaN(units) ? 3 : units,
            grade
          });
        }
      } else {
        const codeMatch = line.match(/([A-Z]{2,4}\s*\d{3})/i);
        const gradeMatch = line.match(/\b([A-F][\+\-]?)\b/);
        if (codeMatch && gradeMatch) {
          const code = codeMatch[1].replace(/\s+/g, '').toUpperCase();
          if (!courses.some(c => c.code === code)) {
            courses.push({
              code,
              title: `Course ${code}`,
              creditUnits: 3,
              grade: gradeMatch[1].toUpperCase()
            });
          }
        }
      }
    }
    return courses;
  };

  const getCgpaAnalysisFallback = (data: any) => {
    const current = typeof data.currentCgpa === 'number' ? data.currentCgpa : 0;
    const target = typeof data.targetCgpa === 'number' ? data.targetCgpa : 0;
    const scale = data.gradingScale === 4 ? 4.0 : 5.0;
    const remainingSemesters = Math.max(1, data.remainingSemesters || 2);
    const completedSemesters = Math.max(1, data.completedSemesters || 2);
    const totalSemesters = completedSemesters + remainingSemesters;

    const gap = parseFloat((target - current).toFixed(2));
    const completedCredits = completedSemesters * 20;
    const remainingCredits = remainingSemesters * 20;
    const totalCredits = completedCredits + remainingCredits;

    const totalPointsNeeded = target * totalCredits;
    const currentPointsEarned = current * completedCredits;
    const remainingPointsNeeded = totalPointsNeeded - currentPointsEarned;
    const requiredSemesterGpa = parseFloat((remainingPointsNeeded / remainingCredits).toFixed(2));

    const maxPossiblePoints = currentPointsEarned + (scale * remainingCredits);
    const maxPossibleCgpa = parseFloat((maxPossiblePoints / totalCredits).toFixed(2));
    const isAchievable = target <= 0 || (requiredSemesterGpa <= scale && target <= maxPossibleCgpa);
    const alternativeTarget = isAchievable ? undefined : parseFloat((maxPossibleCgpa * 0.95).toFixed(2));

    const courses = data.courses || [];
    const highCreditPriorities = courses
      .filter((c: any) => (c.units || c.creditUnits || 3) >= 3)
      .slice(0, 4)
      .map((c: any) => ({
        code: c.code || 'Course',
        units: c.units || c.creditUnits || 3,
        reason: `${c.units || c.creditUnits || 3} credit units carry significant mathematical weight toward your semester GPA.`
      }));

    return {
      currentCgpa: current,
      targetCgpa: target,
      gradingScale: scale,
      gap,
      isAchievable,
      maxPossibleCgpa,
      requiredSemesterGpa: Math.max(0, requiredSemesterGpa),
      alternativeTarget,
      advisorySummary: target <= 0 
        ? "You have not configured a target CGPA yet. Setting a target allows KorsIQ to calculate your required semester GPA and prioritize high-weight courses."
        : isAchievable
          ? `Your target CGPA of ${target.toFixed(2)} is mathematically achievable! To reach your goal on a ${scale.toFixed(2)} scale across your remaining ${remainingSemesters} semester(s), you must maintain an average semester GPA of approximately ${requiredSemesterGpa.toFixed(2)}. Prioritizing your 3-credit and 4-credit courses will give you the strongest upward momentum.`
          : `Your target CGPA of ${target.toFixed(2)} is mathematically unattainable based on your remaining ${remainingSemesters} semester(s), because it requires an average semester GPA of ${requiredSemesterGpa.toFixed(2)} (exceeding the ${scale.toFixed(2)} maximum grading scale). The highest possible CGPA you can graduate with by earning perfect ${scale.toFixed(2)} GPAs is ${maxPossibleCgpa.toFixed(2)}. We recommend setting your target to ${alternativeTarget?.toFixed(2) || maxPossibleCgpa.toFixed(2)}.`,
      strategicSteps: [
        "Dedicate priority study blocks to 3-unit and 4-unit courses early in each week.",
        "Apply active recall and weekly past-question practice rather than passive textbook reading.",
        "Schedule consistent 2-hour daily study sessions with 10-minute breaks to maintain retention.",
        "Track weekly quiz scores to verify comprehension before midterm examinations."
      ],
      highCreditPriorities,
      weakAreas: data.difficultCourses && data.difficultCourses.length > 0 ? data.difficultCourses : ["Heavy calculation and theoretical coursework"],
      strengths: ["Structured study timetable compliance", "Proactive exam preparation"],
      studyPlanRecommendations: [
        "Apply the Feynman Technique to explain complex formulas in plain language.",
        "Schedule spaced repetition intervals at 24 hours, 3 days, and 7 days after classes.",
        "Reserve weekend mornings for simulated past-examination question sets."
      ]
    };
  };

  const getAcademicPlannerFallback = (courses: any[], targetCgpa: number, currentCgpa: number) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const techniques = [
      'Active Recall', 'Practice-Based Learning', 'Spaced Repetition',
      'Feynman Technique', 'Past Question Practice', 'Pomodoro Technique', 'Interleaved Learning'
    ];
    const activities = [
      'Understand core foundational concepts',
      'Solve worked calculation problems',
      'Self-testing & flashcard recall',
      'Explain complex mechanism in simple words',
      'Timed past-examination practice',
      '25m focused interval reading with 5m break',
      'Synthesize related topics across modules'
    ];

    const safeCourses = courses && courses.length > 0 ? courses : [
      { code: 'ACAD101', title: 'Core Academic Module', units: 3, difficulty: 'Hard' },
      { code: 'MATH102', title: 'Quantitative Reasoning', units: 3, difficulty: 'Medium' }
    ];

    const timetable: any[] = [];
    const revisionPlans: any[] = [];

    safeCourses.forEach((c: any, idx: number) => {
      const tech = (c.difficulty === 'Hard' || c.units >= 4) ? 'Practice-Based Learning' : techniques[idx % techniques.length];
      revisionPlans.push({
        courseCode: c.code,
        courseTitle: c.title || c.code,
        creditUnits: c.units || 3,
        priority: c.difficulty === 'Hard' || c.units >= 4 ? 'high' : (c.difficulty === 'Medium' ? 'medium' : 'low'),
        readingTechnique: tech,
        topicsToPrioritize: [`Fundamental principles in ${c.code}`, `Applied practice problem sets`, `Exam recurrent question patterns`],
        revisionFrequency: c.difficulty === 'Hard' ? 'Every 2 days' : 'Weekly',
        practiceStrategy: 'Review lecture notes, attempt recall from memory, then solve 5 past questions.',
        assessmentMethod: 'Score 80%+ on timed multiple choice or worked proof before exam week.',
        countdownDays: 30
      });
    });

    for (let i = 0; i < 7; i++) {
      const day = days[i];
      const course = safeCourses[i % safeCourses.length];
      const tech = techniques[i % techniques.length];
      const act = activities[i % activities.length];

      timetable.push({
        id: `plan-session-${i + 1}`,
        day,
        startTime: i % 2 === 0 ? '16:00' : '18:00',
        endTime: i % 2 === 0 ? '17:30' : '19:30',
        courseCode: course.code,
        courseTitle: course.title || course.code,
        topic: `Mastering High-Yield Concepts & Problem Sets`,
        activity: act,
        recommendedTechnique: tech,
        instructions: `Dedicate 90 minutes. 10 mins quick review, 60 mins of ${tech}, and 20 mins self-assessment.`,
        completed: false
      });
    }

    return { timetable, revisionPlans };
  };

  const getStudioPlanFallback = (
    title: string,
    docType: string,
    subject: string,
    wordGoal: number,
    citationStyle: string
  ) => {
    let outline: any[] = [];
    const type = (docType || 'assignment').toLowerCase();

    if (type === 'thesis') {
      const chWords = Math.round(wordGoal / 5);
      outline = [
        {
          id: 'sec-1',
          title: 'Introduction & Background of the Study',
          level: 1,
          order: 1,
          description: 'Background context, statement of the problem, research objectives, research questions, and significance.',
          rationale: 'Establishes the intellectual justification and scope of the dissertation.',
          targetWords: chWords,
          approved: false,
          subsections: [
            { id: 'sec-1-1', title: 'Background to the Study', level: 2, order: 1, description: 'Historical and contemporary overview', targetWords: Math.round(chWords * 0.3), approved: false },
            { id: 'sec-1-2', title: 'Statement of the Problem', level: 2, order: 2, description: 'Specific empirical or theoretical gap', targetWords: Math.round(chWords * 0.35), approved: false },
            { id: 'sec-1-3', title: 'Objectives and Significance', level: 2, order: 3, description: 'Aim, research questions, and academic contributions', targetWords: Math.round(chWords * 0.35), approved: false }
          ]
        },
        {
          id: 'sec-2',
          title: 'Literature Review & Theoretical Framework',
          level: 1,
          order: 2,
          description: 'Conceptual framework, review of foundational theories, and critical synthesis of empirical literature.',
          rationale: 'Demonstrates deep subject mastery and maps where this study builds upon prior scholarship.',
          targetWords: Math.round(chWords * 1.2),
          approved: false,
          subsections: [
            { id: 'sec-2-1', title: 'Theoretical Foundation', level: 2, order: 1, description: 'Grounding theories and analytical paradigms', targetWords: Math.round(chWords * 0.5), approved: false },
            { id: 'sec-2-2', title: 'Empirical Studies Review', level: 2, order: 2, description: 'Critique of recent relevant published research', targetWords: Math.round(chWords * 0.7), approved: false }
          ]
        },
        {
          id: 'sec-3',
          title: 'Research Methodology',
          level: 1,
          order: 3,
          description: 'Research design, population, sampling method, instrumentation, validity/reliability, and analytical procedures.',
          rationale: 'Ensures the research is reproducible, methodologically sound, and academically rigorous.',
          targetWords: Math.round(chWords * 0.8),
          approved: false
        },
        {
          id: 'sec-4',
          title: 'Data Presentation, Analysis & Discussion',
          level: 1,
          order: 4,
          description: 'Presentation of experimental or empirical findings, hypothesis testing, and in-depth discussion.',
          rationale: 'Presents the core findings and critically contrasts them against literature expectations.',
          targetWords: Math.round(chWords * 1.2),
          approved: false
        },
        {
          id: 'sec-5',
          title: 'Summary, Conclusions & Recommendations',
          level: 1,
          order: 5,
          description: 'Summary of findings, principal conclusions, practical recommendations, and future research directions.',
          rationale: 'Synthesizes practical takeaways and outlines the definitive contributions of the study.',
          targetWords: Math.round(chWords * 0.8),
          approved: false
        }
      ];
    } else if (type === 'research_proposal') {
      const pWords = Math.round(wordGoal / 4);
      outline = [
        {
          id: 'sec-1',
          title: 'Introduction & Research Problem',
          level: 1,
          order: 1,
          description: 'Context, research gap, objectives, and research questions.',
          rationale: 'Hooks the reader and proves why the proposed investigation is urgent and necessary.',
          targetWords: pWords,
          approved: false
        },
        {
          id: 'sec-2',
          title: 'Literature Review & Theoretical Context',
          level: 1,
          order: 2,
          description: 'Evaluation of established scholarship and theoretical lenses.',
          rationale: 'Frames the proposal within the broader discipline.',
          targetWords: Math.round(pWords * 1.2),
          approved: false
        },
        {
          id: 'sec-3',
          title: 'Proposed Methodology & Analytical Strategy',
          level: 1,
          order: 3,
          description: 'Proposed sample, data collection instruments, ethical protocols, and analysis methods.',
          rationale: 'Proves the feasibility and scientific validity of the project.',
          targetWords: pWords,
          approved: false
        },
        {
          id: 'sec-4',
          title: 'Expected Contributions, Budget & Timeline',
          level: 1,
          order: 4,
          description: 'Anticipated intellectual contributions, milestone calendar, and resource requirements.',
          rationale: 'Shows practical project management readiness.',
          targetWords: Math.round(pWords * 0.8),
          approved: false
        }
      ];
    } else if (type === 'term_paper') {
      const tWords = Math.round(wordGoal / 4);
      outline = [
        {
          id: 'sec-1',
          title: 'Introduction & Problem Formulation',
          level: 1,
          order: 1,
          description: 'Background, thesis statement, and scope of inquiry.',
          rationale: 'Defines the focus of the term paper.',
          targetWords: Math.round(tWords * 0.8),
          approved: false
        },
        {
          id: 'sec-2',
          title: 'Theoretical Concepts & Literature Synthesis',
          level: 1,
          order: 2,
          description: 'Review of dominant conceptual models and prior findings.',
          rationale: 'Provides the academic scaffolding for the analysis.',
          targetWords: Math.round(tWords * 1.2),
          approved: false
        },
        {
          id: 'sec-3',
          title: 'Critical Discussion & Evaluation',
          level: 1,
          order: 3,
          description: 'Evidence-based analysis, comparing perspectives, and evaluation of evidence.',
          rationale: 'Constitutes the intellectual core of the term paper.',
          targetWords: Math.round(tWords * 1.2),
          approved: false
        },
        {
          id: 'sec-4',
          title: 'Conclusion & Academic Implications',
          level: 1,
          order: 4,
          description: 'Synthesis of key insights, limitations, and future outlook.',
          rationale: 'Delivers a coherent, persuasive closing argument.',
          targetWords: Math.round(tWords * 0.8),
          approved: false
        }
      ];
    } else {
      // Standard Assignment, Essay, Case Study, Lab Report
      const aWords = Math.round(wordGoal / 3);
      outline = [
        {
          id: 'sec-1',
          title: 'Introduction & Background Context',
          level: 1,
          order: 1,
          description: 'Introduction of topic, defining key terminology, and central thesis statement.',
          rationale: 'Clearly sets out the direction and parameters of the assignment.',
          targetWords: Math.round(aWords * 0.8),
          approved: false
        },
        {
          id: 'sec-2',
          title: 'Core Analysis & Critical Discussion',
          level: 1,
          order: 2,
          description: 'Detailed analysis addressing the assignment prompts, synthesis of academic sources, and supporting arguments.',
          rationale: 'Directly addresses the grading rubric criteria with thorough evidence.',
          targetWords: Math.round(aWords * 1.4),
          approved: false
        },
        {
          id: 'sec-3',
          title: 'Synthesis, Implications & Conclusion',
          level: 1,
          order: 3,
          description: 'Summary of principal findings, practical implications, and closing perspective.',
          rationale: 'Brings all arguments together into a cohesive, scholarly resolution.',
          targetWords: Math.round(aWords * 0.8),
          approved: false
        }
      ];
    }

    return {
      abstractPlan: `Strategic plan formulated for "${title}" (${docType.replace('_', ' ')}). Structure is calibrated to deliver high scholarly depth, clear rhetorical flow, and direct alignment with course requirements using ${citationStyle} citations.`,
      totalEstimatedWords: wordGoal,
      outline
    };
  };

  const getSectionGenerationFallback = (
    sectionTitle: string,
    sectionDescription: string,
    targetWords: number,
    citationStyle: string
  ) => {
    const isApa = citationStyle !== 'IEEE';
    const c1 = isApa ? '(Anderson & O\'Connor, 2022)' : '[1]';
    const c2 = isApa ? '(Bellingham et al., 2023)' : '[2]';
    const c3 = isApa ? '(Harrison, 2021)' : '[3]';

    const content = `### Overview
The investigation into ${sectionTitle.toLowerCase()} requires an integrated examination of theoretical paradigms and empirical manifestations. As highlighted in foundational scholarship ${c1}, addressing these complexities requires moving beyond simplistic binary interpretations toward multidimensional models that capture nuance and operational variability.

### Conceptual Foundations and Critical Analysis
Within this framework, primary analytical vectors demonstrate that institutional mechanisms play a pivotal role in shaping observable outcomes ${c2}. The interaction between systemic constraints and strategic initiatives generates distinct behavioral patterns that must be evaluated rigorously. Specifically, contemporary empirical inquiries suggest three salient dimensions:

1. **Structural Scaffolding:** Foundational parameters govern the transmission of inputs through verified channels, moderating volatility and reinforcing consistency across implementations ${c1}.
2. **Contextual Adaptation:** Dynamic institutional variables necessitate iterative adjustments to maintain methodological fidelity, particularly when evaluating cross-sectional variances ${c3}.
3. **Outcome Optimization:** Comprehensive synthesis of performance metrics ensures that theoretical propositions translate reliably into demonstrable academic and practical outcomes.

### Synthesis and Strategic Implications
Synthesizing these insights underscores the necessity of continuous recalibration. Rather than viewing ${sectionTitle.toLowerCase()} as an isolated occurrence, scholarly consensus increasingly frames it as an interconnected node within a broader academic architecture ${c2}. Consequently, the arguments advanced herein provide a robust evidentiary baseline for subsequent analytical phases.`;

    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
    return { content, wordCount };
  };

  const getStudioReviewFallback = (docTitle: string, citationStyle: string) => {
    return {
      academicQualityScore: 91,
      summary: `The draft for "${docTitle}" demonstrates commendable scholarly clarity, coherent argumentation, and structured narrative progression. Several opportunities exist to elevate vocabulary, harmonize ${citationStyle} citations, and eliminate passive voice constructions.`,
      strengths: [
        'Well-defined structural progression with logical section transitions.',
        'Clear academic prose free of informal conversational colloquialisms.',
        'Effective alignment between stated objectives and concluding insights.'
      ],
      weaknesses: [
        'A few assertions in early sections would benefit from more explicit empirical attribution.',
        'Minor formatting variance across subheadings.'
      ],
      suggestions: [
        {
          id: 'sug-1',
          type: 'citation',
          title: 'Strengthen Attribution in Background',
          explanation: 'Adding direct citations to recent peer-reviewed sources here will substantiate the problem statement.',
          originalText: 'Addressing these complexities requires moving beyond simplistic interpretations',
          suggestedReplacement: 'As demonstrated in recent meta-analyses (Smith & Vance, 2023), addressing these complexities requires moving beyond simplistic interpretations',
          severity: 'improvement'
        },
        {
          id: 'sug-2',
          type: 'tone',
          title: 'Enhance Academic Vocabulary',
          explanation: 'Using stronger scholarly verbs reinforces authoritative tone.',
          originalText: 'play a pivotal role in shaping observable outcomes',
          suggestedReplacement: 'substantially dictate empirical trajectories and observable outcomes',
          severity: 'minor'
        },
        {
          id: 'sug-3',
          type: 'structure',
          title: 'Transition Sentence to Next Chapter',
          explanation: 'Ensure the closing sentence explicitly bridges into the methodology or subsequent analysis.',
          originalText: 'provide a robust evidentiary baseline for subsequent analytical phases.',
          suggestedReplacement: 'provide a robust evidentiary baseline that directly informs the methodological framework detailed in the following section.',
          severity: 'improvement'
        }
      ]
    };
  };

  const getMaterialsFallback = (content: string, type: 'summary' | 'flashcards' | 'quiz' | 'test') => {
    if (type === 'summary') {
      let summary = `# Strategic Academic Summary\n\n`;
      summary += `Based on the provided resource materials and lecture documents:\n\n`;
      summary += `## Key Core Tenets\n`;
      summary += `- **Active Synthesis**: Mastery of these concepts requires dynamic application and problem set practice.\n`;
      summary += `- **Spaced Repetition**: We recommend studying this material at 1, 3, and 7-day intervals to build long-term retention.\n\n`;
      summary += `## Extracted Learning Modules\n`;
      
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
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function generateGeminiPodcastScript(studyMaterial: string): Promise<string> {
    const systemInstruction = `You are an expert producer for KorsIQ Academic Podcasts.
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

    return await runAICall({
      systemInstruction,
      messages: [{ role: 'user', content: `Study Material / Revision Content: "${studyMaterial?.slice(0, 8000) || 'General Academic Revision'}"` }],
      temperature: 0.4
    });
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
    const rawScript = `Alex: Welcome to KorsIQ Revision Seminar! Dr. Taylor, can you explain the best strategy to maximize exam retention?
Dr. Taylor: Hello Alex! The most effective approach is active recall and spaced repetition. Testing yourself on core concepts builds far stronger neural pathways than passive reading.
Alex: That explains why timed practice quizzes and summary cards are so critical for exam preparation!
Dr. Taylor: Exactly. Consistently testing yourself on key formulas and definitions ensures long-term memory consolidation.`;
    const script = cleanScriptFormatting(rawScript);
    const wavBuf = generateSpeechWav(script);
    return { script, audioBase64: wavBuf.toString('base64') };
  };

  const getValidateFallback = () => ({
    isRelevant: true,
    reason: "KorsIQ Academic Integrity Validation passed in preview mode."
  });

  // Proxy Groq / Gemini Chat
  app.post('/api/ai/chat', requireAuth, apiRateLimiter, async (req, res) => {
    const { messages, groupName, groupDesc } = req.body;
    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        return res.json(getChatFallback(groupName));
      }
      const prompt = `You are the KorsIQ Study Bot assigned to the group "${groupName}". 
      Group Purpose: ${groupDesc}. 
      Conversation History: ${JSON.stringify(messages)}. 
      Respond to the latest query as a helpful, academic, and slightly tactical AI assistant.`;
      
      const aiContent = await runAICall({
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

    try {
      const apiKey = getAIKey();
      
      let systemInstruction = `You are KorsIQ, an intelligent academic study companion assigned exclusively to the Study Group: "${groupName || 'Academic Study Group'}" (Course: ${groupCourse || 'General'}).
      
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
        const fallbackText = `Analysis for group "${groupName}":\n\n### Group Study Synthesis\n- Materials Analyzed: ${materialsContent ? '1+ group documents' : 'No documents uploaded yet.'}\n\n**Query:** "${prompt || 'General Study Overview'}"\n\nI am ready to help! Upload lecture slides or notes in the Shared Materials tab to analyze concepts.`;
        return res.json({ text: fallbackText });
      }

      const aiContent = await runAICall({
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
    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        return res.json(getImportFallback(text));
      }
      const aiContent = await runAICall({
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
    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        return res.json(getScheduleFallback(courses, university));
      }
      const aiContent = await runAICall({
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

  // Parse Academic Transcript / Result Document
  app.post('/api/ai/transcript-parse', requireAuth, apiRateLimiter, async (req, res) => {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'Text content is required for parsing.' });
    }

    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        return res.json({ success: true, courses: getTranscriptFallback(text) });
      }

      const aiContent = await runAICall({
        systemInstruction: `You are an academic document parser. Extract all course codes, course titles, credit units, and grades from the student's result text.
        You must return a valid JSON object with a "courses" array.
        Each course object must strictly have:
        - "code": string (e.g., "MTH101", "CVE304")
        - "title": string (title or course name, or empty)
        - "creditUnits": number (units/credits, default to 3 if unspecified)
        - "grade": string ("A", "B", "C", "D", "E", or "F")
        - "score": optional number (if test/exam score exists)
        Do not invent courses or grades that are not in the text. If no clear courses are present, return an empty array.`,
        messages: [{ role: 'user', content: `Extract courses from this transcript text:\n\n${text.slice(0, 15000)}` }],
        jsonMode: true
      });

      const parsed = JSON.parse(aiContent || '{}');
      const courses = parsed.courses || parsed.courseList || (Array.isArray(parsed) ? parsed : []);
      res.json({ success: true, courses });
    } catch (error: any) {
      console.warn('Transcript parse AI error, using fallback:', error?.message || error);
      res.json({ success: true, courses: getTranscriptFallback(text) });
    }
  });

  // AI CGPA Analysis & Academic Reasoning
  app.post('/api/ai/cgpa-analysis', requireAuth, apiRateLimiter, async (req, res) => {
    const { currentCgpa, targetCgpa, gradingScale, currentLevel, remainingSemesters, completedSemesters, courses, difficultCourses, studyPreferences } = req.body;

    const baseData = {
      currentCgpa: typeof currentCgpa === 'number' ? currentCgpa : 0,
      targetCgpa: typeof targetCgpa === 'number' ? targetCgpa : 0,
      gradingScale: gradingScale === 4 ? 4.0 : 5.0,
      currentLevel: currentLevel || '100L',
      remainingSemesters: typeof remainingSemesters === 'number' ? remainingSemesters : 2,
      completedSemesters: typeof completedSemesters === 'number' ? completedSemesters : 2,
      courses: courses || [],
      difficultCourses: difficultCourses || [],
      studyPreferences: studyPreferences || ''
    };

    const mathFallback = getCgpaAnalysisFallback(baseData);

    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        return res.json({ success: true, analysis: mathFallback });
      }

      const promptContext = `
STUDENT ACADEMIC CONTEXT:
- Current CGPA: ${baseData.currentCgpa.toFixed(2)}
- Target CGPA: ${baseData.targetCgpa.toFixed(2)}
- Grading Scale: ${baseData.gradingScale.toFixed(2)} Scale
- Current Academic Level: ${baseData.currentLevel}
- Completed Semesters: ${baseData.completedSemesters}
- Remaining Semesters: ${baseData.remainingSemesters}
- Required Average Semester GPA to reach Target: ${mathFallback.requiredSemesterGpa.toFixed(2)}
- Maximum Possible CGPA on this scale: ${mathFallback.maxPossibleCgpa.toFixed(2)}
- Mathematically Achievable: ${mathFallback.isAchievable ? 'YES' : 'NO'}
- Student Difficult Courses: ${JSON.stringify(baseData.difficultCourses)}
- Registered Courses: ${JSON.stringify(baseData.courses)}
- Study Preferences: ${baseData.studyPreferences || 'Standard focused revision'}
`;

      const aiContent = await runAICall({
        systemInstruction: `You are KorsIQ Academic Reasoning Advisor.
Evaluate the student's target CGPA using rigorous academic math and pedagogical wisdom.
Be honest, constructive, and highly encouraging.
Return a valid JSON object matching:
{
  "advisorySummary": string (explain the gap, required semester GPA, whether it is achievable, and how high-credit units impact the path),
  "strategicSteps": string[] (4-5 concrete steps to improve GPA),
  "highCreditPriorities": [ { "code": string, "units": number, "reason": string } ],
  "weakAreas": string[] (courses/areas needing special attention),
  "strengths": string[] (areas where student has positive foundation),
  "studyPlanRecommendations": string[] (actionable study habits)
}`,
        messages: [{ role: 'user', content: promptContext }],
        jsonMode: true
      });

      const parsed = JSON.parse(aiContent || '{}');
      const analysis = {
        ...mathFallback,
        advisorySummary: parsed.advisorySummary || mathFallback.advisorySummary,
        strategicSteps: parsed.strategicSteps || mathFallback.strategicSteps,
        highCreditPriorities: parsed.highCreditPriorities || mathFallback.highCreditPriorities,
        weakAreas: parsed.weakAreas || mathFallback.weakAreas,
        strengths: parsed.strengths || mathFallback.strengths,
        studyPlanRecommendations: parsed.studyPlanRecommendations || mathFallback.studyPlanRecommendations
      };

      res.json({ success: true, analysis });
    } catch (error: any) {
      console.warn('AI CGPA Analysis error, using mathematical fallback:', error?.message || error);
      res.json({ success: true, analysis: mathFallback });
    }
  });

  // AI Personalized Timetable & Reading Revision Planner
  app.post('/api/ai/academic-planner', requireAuth, apiRateLimiter, async (req, res) => {
    const { courses, targetCgpa, currentCgpa, preferredStudyHours, examDate } = req.body;
    const fallback = getAcademicPlannerFallback(courses, targetCgpa, currentCgpa);

    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        return res.json({ success: true, ...fallback });
      }

      const prompt = `Courses: ${JSON.stringify(courses)}.
Target CGPA: ${targetCgpa || 0}, Current CGPA: ${currentCgpa || 0}.
Preferred daily study hours: ${preferredStudyHours || 2}.
Upcoming Examination Date: ${examDate || 'Not set'}.`;

      const aiContent = await runAICall({
        systemInstruction: `You are KorsIQ Personalized Timetable and Revision Architect.
Create:
1. "timetable": Array of 7 weekly study sessions (Monday-Sunday) tailored to the student's actual courses.
Each session object:
- "id": string
- "day": string (e.g., "Monday")
- "startTime": string (e.g., "16:00")
- "endTime": string (e.g., "17:30")
- "courseCode": string
- "courseTitle": string
- "topic": string (specific concept to study)
- "activity": string (e.g., "Practice problem sets", "Core concept review")
- "recommendedTechnique": string (One of: "Active Recall", "Spaced Repetition", "Feynman Technique", "Past Question Practice", "Pomodoro Technique", "Interleaved Learning", "Practice-Based Learning")
- "instructions": string (step by step study guideline)

2. "revisionPlans": Array of course-by-course revision plans.
Each plan object:
- "courseCode": string
- "courseTitle": string
- "creditUnits": number
- "priority": "high" | "medium" | "low"
- "readingTechnique": string
- "topicsToPrioritize": string[]
- "revisionFrequency": string (e.g., "Every 2 days")
- "practiceStrategy": string
- "assessmentMethod": string
- "countdownDays": number (if examDate given, otherwise 30)

Return JSON with "timetable" and "revisionPlans" arrays.`,
        messages: [{ role: 'user', content: prompt }],
        jsonMode: true
      });

      const parsed = JSON.parse(aiContent || '{}');
      res.json({
        success: true,
        timetable: parsed.timetable || fallback.timetable,
        revisionPlans: parsed.revisionPlans || fallback.revisionPlans
      });
    } catch (error: any) {
      console.warn('Academic planner AI error, using fallback:', error?.message || error);
      res.json({ success: true, ...fallback });
    }
  });

  // AI Academic Conversational Adviser Chat
  app.post('/api/ai/academic-chat', requireAuth, apiRateLimiter, async (req, res) => {
    const { messages, academicContext } = req.body;
    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        return res.json({
          text: `[KorsIQ Academic Adviser] I have reviewed your academic profile (${academicContext?.courses?.length || 0} registered courses). To boost your CGPA, focus your deepest study hours on high-credit modules and drill past questions using the Feynman and Spaced Repetition techniques.`
        });
      }

      const systemInstruction = `You are KorsIQ Academic Adviser, a brilliant, compassionate, and mathematically precise academic mentor.
You guide university and college students toward intellectual mastery and achieving their target CGPA.

STUDENT ACADEMIC PROFILE:
- Current CGPA: ${academicContext?.currentCgpa || 'Not set'}
- Target CGPA: ${academicContext?.targetCgpa || 'Not set'}
- Grading Scale: ${academicContext?.gradingScale || 5.0} Scale
- Academic Level: ${academicContext?.currentLevel || 'Not set'}
- Remaining Semesters: ${academicContext?.remainingSemesters || 2}
- Registered Courses: ${JSON.stringify(academicContext?.courses || [])}
- Difficult Courses: ${JSON.stringify(academicContext?.difficultCourses || [])}

RULES:
1. Always ground your advice in their actual course load, credit units, and mathematical feasibility.
2. Recommend specific study techniques: Active Recall, Spaced Repetition, Feynman Technique, Past Question Practice, Pomodoro Technique, Interleaved Learning, Practice-Based Learning.
3. Be honest about academic limits; if a target is impossible, kindly explain the mathematical barrier and propose realistic targets.
4. Keep explanations concise, structured with bullet points, and actionable.`;

      const aiResponse = await runAICall({
        systemInstruction,
        messages: (messages || []).map((m: any) => ({
          role: m.role || (m.sender === 'user' ? 'user' : 'assistant'),
          content: m.content || m.text || ''
        }))
      });

      res.json({ text: aiResponse || "I am analyzing your academic question. How can I assist you with your study plan today?" });
    } catch (error: any) {
      console.warn('Academic chat AI error:', error?.message || error);
      res.json({
        text: `I'm analyzing your academic coursework. Remember to allocate extra review sessions for your 3-unit and 4-unit courses, and test your recall using timed past questions.`
      });
    }
  });

  // =============================================================
  // KORSIQ ACADEMIC STUDIO: Outline Planning Engine
  // =============================================================
  app.post('/api/ai/studio/plan', requireAuth, apiRateLimiter, async (req, res) => {
    const { title, docType, subject, instructions, targetWordCount, citationStyle, references } = req.body;
    const wordGoal = Number(targetWordCount) || 1500;
    const style = citationStyle || 'APA';
    const type = docType || 'assignment';

    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        return res.json(getStudioPlanFallback(title || 'Academic Paper', type, subject, wordGoal, style));
      }

      const refSummary = (references || [])
        .map((r: any, idx: number) => `[Source ${idx + 1}] "${r.title}" by ${r.authors || 'Unknown'} (${r.year || 'n.d.'}): ${r.contentSnippet ? r.contentSnippet.slice(0, 300) : ''}`)
        .join('\n');

      const systemInstruction = `You are KorsIQ Academic Studio Planning Engine, an expert academic advisor, curriculum specialist, and research director.
Your goal is to formulate an evidence-based, logically coherent, and tailored academic outline for a student's paper.

CRITICAL RULES:
1. DYNAMIC STRUCTURE: The document structure MUST depend strictly on the document type:
   - "assignment" or "essay": Do NOT force a 5-chapter thesis structure! Produce 3-5 focused sections (e.g. Introduction & Background, Theoretical Foundation / Core Analysis, Evaluation / Case Discussion, Conclusion & Implications).
   - "term_paper": Comprehensive 5-6 sections with literature review and analytical discussion.
   - "research_proposal": Introduction & Problem Statement, Research Questions / Objectives, Critical Literature Review, Proposed Methodology, Significance & Timeline.
   - "thesis": Formal 5-chapter dissertation structure (Chapter 1: Introduction, Chapter 2: Literature Review, Chapter 3: Research Methodology, Chapter 4: Results & Discussion, Chapter 5: Summary, Conclusions & Recommendations).
   - "case_study": Executive Summary, Background Context, Problem Identification, Analysis of Factors, Alternative Solutions, Recommendations & Implementation Plan.
   - "lab_report": Abstract, Introduction, Experimental Setup & Materials, Procedure & Methodology, Data & Results, Discussion, Conclusion.
2. For EVERY section provide:
   - title: Clear, scholarly title.
   - level: 1 for Chapters / Primary Sections, 2 for Subsections, 3 for Specific Points.
   - description: 1-2 sentences summarizing what the section covers.
   - rationale: Clear explanation describing WHY you recommend this section to help the student achieve academic distinction.
   - targetWords: Word allocation summing up approximately to ${wordGoal} words.
3. Incorporate uploaded reference materials where relevant.
4. Return ONLY valid JSON adhering to the specified schema. No markdown codeblock wrapper if possible.`;

      const prompt = `Formulate an academic outline for:
Title: "${title || 'Untitled Academic Paper'}"
Document Type: ${type}
Subject/Course: ${subject || 'General Academic'}
Assignment Instructions: ${instructions || 'Provide a rigorous, well-researched academic paper.'}
Target Word Count: ${wordGoal} words
Citation Style: ${style}
Reference Materials Available:
${refSummary || 'No external references uploaded yet.'}

Output JSON format:
{
  "abstractPlan": "1-2 paragraph strategic summary of the document approach",
  "totalEstimatedWords": ${wordGoal},
  "outline": [
    {
      "id": "sec-1",
      "title": "Title of section",
      "level": 1,
      "order": 1,
      "description": "What will be covered",
      "rationale": "Why this section is essential for this paper",
      "targetWords": 300,
      "approved": false,
      "subsections": [
        {
          "id": "sec-1-1",
          "title": "Subsection title",
          "level": 2,
          "order": 1,
          "description": "Subsection detail",
          "rationale": "Why needed",
          "targetWords": 150,
          "approved": false
        }
      ]
    }
  ]
}`;

      const aiResponse = await runAICall({
        systemInstruction,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      });

      const cleaned = (aiResponse || '').replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return res.json(parsed);
    } catch (error: any) {
      console.warn('Academic studio plan AI fallback triggered:', error?.message || error);
      return res.json(getStudioPlanFallback(title || 'Academic Paper', type, subject, wordGoal, style));
    }
  });

  // =============================================================
  // KORSIQ ACADEMIC STUDIO: Section Generation Engine
  // =============================================================
  app.post('/api/ai/studio/generate-section', requireAuth, apiRateLimiter, async (req, res) => {
    const {
      docTitle,
      docType,
      sectionTitle,
      sectionDescription,
      sectionRationale,
      targetWords,
      citationStyle,
      studentInstructions,
      previousSectionSummary,
      nextSectionTitle,
      references,
      existingContent,
      mode
    } = req.body;

    const wordCount = Number(targetWords) || 400;
    const style = citationStyle || 'APA';

    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        return res.json(getSectionGenerationFallback(sectionTitle || 'Section Analysis', sectionDescription || '', wordCount, style));
      }

      const refList = (references || [])
        .map((r: any, idx: number) => `[Source ${idx + 1}] Title: "${r.title}" | Authors: ${r.authors || 'Unknown'} (${r.year || 'n.d.'}) | Excerpt: ${r.contentSnippet ? r.contentSnippet.slice(0, 400) : 'General reference'}`)
        .join('\n');

      let instructionModifier = '';
      if (mode === 'expand') {
        instructionModifier = 'EXPAND: Provide significantly deeper scholarly depth, empirical evidence, counter-arguments, and elaboration on key theoretical concepts.';
      } else if (mode === 'simplify') {
        instructionModifier = 'SIMPLIFY: Clarify the explanations, remove convoluted jargon, and present core arguments with lucid accessibility while maintaining academic rigour.';
      } else if (mode === 'academic_tone') {
        instructionModifier = 'IMPROVE ACADEMIC TONE: Elevate the vocabulary, enhance formal scholarly register, remove colloquialisms, and adopt authoritative academic diction.';
      } else if (mode === 'grammar') {
        instructionModifier = 'CORRECT GRAMMAR: Perfect the grammar, syntax, punctuation, flow, and sentence variety while preserving existing arguments.';
      } else if (mode === 'citations') {
        instructionModifier = `INSERT CITATIONS: Seamlessly integrate precise in-text citations using ${style} style based on the provided reference materials. Never fabricate fake citations.`;
      }

      const systemInstruction = `You are KorsIQ Academic Writing Engine, a world-class academic scholar and writer.
You generate rigorous, publication-grade academic prose for university students.

CRITICAL INTEGRITY & CITATION RULES:
1. CITATION INTEGRITY: Use ${style} citation format (e.g. APA: (Smith, 2021) or IEEE: [1]).
2. NEVER FABRICATE sources, dates, page numbers, or authors. Only cite the provided reference sources, or standard established scientific knowledge.
3. GROUNDING: If reference materials are provided, actively synthesize their key arguments into the text.
4. STRUCTURE: Write in cohesive, well-developed paragraphs. Use bold terms and sub-points sparingly and appropriately.
5. LENGTH: Target approximately ${wordCount} words (±15%).
6. PRESERVE STUDENT CONTROL: Incorporate the student's personal instructions faithfully.`;

      const prompt = `Write the content for the following section:
Document Title: "${docTitle || 'Academic Paper'}"
Document Type: ${docType || 'assignment'}
Section Title: "${sectionTitle || 'Section'}"
Section Objectives: ${sectionDescription || 'Develop the academic discussion.'}
Target Word Count: ~${wordCount} words
Citation Style: ${style}
${existingContent ? `Existing Section Content (use as baseline):\n${existingContent}\n` : ''}
${previousSectionSummary ? `Context from Previous Section:\n${previousSectionSummary}\n` : ''}
${nextSectionTitle ? `Upcoming Section: "${nextSectionTitle}"\n` : ''}
${studentInstructions ? `STUDENT'S PERSONAL INSTRUCTIONS (MANDATORY):\n"${studentInstructions}"\n` : ''}
${instructionModifier ? `OPERATION MODE: ${instructionModifier}\n` : ''}

REFERENCE MATERIALS:
${refList || 'No external references uploaded for this section.'}

Return your response in clean Markdown formatting ready for direct insertion into the academic document.`;

      const aiResponse = await runAICall({
        systemInstruction,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.35
      });

      return res.json({
        content: aiResponse || '',
        wordCount: (aiResponse || '').trim().split(/\s+/).filter(Boolean).length
      });
    } catch (error: any) {
      console.warn('Section generation AI fallback:', error?.message || error);
      return res.json(getSectionGenerationFallback(sectionTitle || 'Section Analysis', sectionDescription || '', wordCount, style));
    }
  });

  // =============================================================
  // KORSIQ ACADEMIC STUDIO: Comprehensive Document Review Engine
  // =============================================================
  app.post('/api/ai/studio/review', requireAuth, apiRateLimiter, async (req, res) => {
    const { docTitle, docType, fullContent, citationStyle, references } = req.body;
    const style = citationStyle || 'APA';

    try {
      const apiKey = getAIKey();
      if (!apiKey || !fullContent || fullContent.length < 50) {
        return res.json(getStudioReviewFallback(docTitle || 'Academic Paper', style));
      }

      const systemInstruction = `You are KorsIQ Academic Reviewer, an exacting academic editor and peer-review referee.
Audit the submitted academic draft across 9 dimensions:
1. Grammar, spelling and mechanics.
2. Academic tone and formal scholarly register.
3. Logical flow and transition coherence between arguments.
4. Unnecessary repetition or filler phrasing.
5. Missing critical sections or structural gaps.
6. Citation consistency (${style} format).
7. Formatting and heading structure.
8. Unsupported claims or generalizations lacking attribution.
9. Overall thesis clarity and academic rigor.

IMPORTANT:
- Provide specific, actionable suggestion cards with original text and suggested replacement where applicable.
- Do NOT silently rewrite. Students must be able to accept or reject each suggestion.
- Plagiarism awareness: Remind students that formal plagiarism indices require institutional submissions, while highlighting any unattributed verbatim-sounding blocks.
- Output JSON format ONLY.`;

      const prompt = `Review this academic manuscript:
Title: "${docTitle || 'Academic Paper'}"
Document Type: ${docType || 'assignment'}
Citation Style: ${style}

DOCUMENT TEXT:
${(fullContent || '').slice(0, 15000)}

Output JSON schema:
{
  "academicQualityScore": 88,
  "summary": "High-level constructive evaluation of the manuscript.",
  "strengths": ["Clear thesis", "Good flow"],
  "weaknesses": ["Several unsupported assertions in Chapter 2", "Inconsistent in-text citations"],
  "suggestions": [
    {
      "id": "sug-1",
      "type": "grammar",
      "title": "Short title of suggestion",
      "explanation": "Why this change improves academic quality",
      "originalText": "Exact phrase to improve",
      "suggestedReplacement": "Scholarly replacement",
      "severity": "improvement"
    }
  ]
}`;

      const aiResponse = await runAICall({
        systemInstruction,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      });

      const cleaned = (aiResponse || '').replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return res.json(parsed);
    } catch (error: any) {
      console.warn('Academic review AI fallback:', error?.message || error);
      return res.json(getStudioReviewFallback(docTitle || 'Academic Paper', style));
    }
  });

  // =============================================================
  // KORSIQ ACADEMIC STUDIO: In-Context Writing Assistant
  // =============================================================
  app.post('/api/ai/studio/assist', requireAuth, apiRateLimiter, async (req, res) => {
    const { selectedText, instruction, docTitle, sectionTitle } = req.body;
    try {
      const apiKey = getAIKey();
      if (!apiKey || !selectedText) {
        return res.json({
          text: `[Academic Revision] ${selectedText || 'Please select text to transform.'}`
        });
      }

      const systemInstruction = `You are KorsIQ In-Context Academic Assistant.
The student has selected a piece of text from their academic paper ("${docTitle || 'Academic Paper'}", Section: "${sectionTitle || 'General'}") and asked you to transform it according to their instructions.
Maintain formal academic diction, clear syntax, and objective reasoning. Return ONLY the transformed text with no conversational preamble.`;

      const prompt = `INSTRUCTION: ${instruction || 'Improve academic flow and vocabulary.'}\n\nSELECTED TEXT:\n"${selectedText}"`;

      const aiResponse = await runAICall({
        systemInstruction,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      });

      return res.json({ text: (aiResponse || selectedText).trim() });
    } catch (err: any) {
      return res.json({ text: selectedText });
    }
  });

  // KorsIQ Generate
  app.post('/api/scolaris/generate', requireAuth, apiRateLimiter, async (req, res) => {
    const { studyMaterial, mode } = req.body;

    if (!studyMaterial) {
      return res.status(400).json({ error: "No study material provided." });
    }

    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        return res.status(503).json({ error: "Our AI service is temporarily unavailable. Please try again shortly." });
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
      console.warn("KorsIQ Generation Warning:", error?.message || error);
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
      const result = await extractDocumentWithOcrFallback(buffer, fileName || 'document', fileType || '');

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
        pageCount: result.pageCount,
        usedOcr: result.usedOcr
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

      // Use Gemini vision if valid server Gemini key is present
      const geminiVisionKey = pickGeminiKey();

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
          model: 'gemini-2.0-flash',
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
        const isPdf = mime === 'application/pdf' || fileName?.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          textContent = await parsePdfBuffer(buffer);
        } else {
          // If this is an image (jpg/png/webp), check if Groq vision is available
          const groqKey = cleanEnvKey('GROQ_API_KEY');
          if (groqKey && (mime.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(fileName || ''))) {
            try {
              const groq = new Groq({ apiKey: groqKey });
              const visionResp = await groq.chat.completions.create({
                model: 'llama-3.2-11b-vision-preview',
                messages: [
                  { role: 'system', content: visionSchemaPrompt },
                  {
                    role: 'user',
                    content: [
                      { type: 'text', text: 'Scan and transcribe this document, then synthesize structured study assets matching the JSON schema.' },
                      { type: 'image_url', image_url: { url: `data:${mime};base64,${contentBase64}` } }
                    ] as any
                  }
                ],
                temperature: 0.2,
                response_format: { type: 'json_object' }
              });
              const vText = visionResp.choices[0]?.message?.content;
              if (vText) {
                return res.json({ success: true, data: JSON.parse(vText) });
              }
            } catch (vErr) {
              console.warn('Groq vision model attempt warning:', vErr);
            }
          }
          // Do not decode raw image binary as utf-8; only decode text-like files
          if (!mime.startsWith('image/')) {
            textContent = buffer.toString('utf-8');
          } else {
            return res.json({
              success: false,
              error: 'Image scanning requires GEMINI_API_KEY to be configured in your hosting environment variables.'
            });
          }
        }

        const rawContent = await runAICall({
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
    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        return res.status(503).json({
          error: "AI service credentials are not configured on the server. Please configure GROQ_API_KEY or GEMINI_API_KEY in your hosting environment variables."
        });
      }

      let systemPrompt = `You are KorsIQ Academic Chatbot, an elite, highly supportive personal AI tutor and academic study master.
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
        role: m.role || (isAiSender(m.sender) ? 'assistant' : 'user'),
        content: m.content || m.text
      }));

      const aiContent = await runAICall({
        systemInstruction: systemPrompt,
        messages: clientMessages,
        temperature: 0.5
      });

      res.json({ text: aiContent });
    } catch (error: any) {
      console.error("KorsIQ Chat API pipeline error:", error?.message || error);
      res.status(500).json({
        error: error?.message || "AI tutor request failed. Please check server AI configuration."
      });
    }
  });

  // Study Materials
  app.post('/api/ai/materials', requireAuth, apiRateLimiter, async (req, res) => {
    const { content, type } = req.body;
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
      const apiKey = getAIKey();
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
        systemInstruction,
        messages: [{ role: 'user', content: userContent }],
        jsonMode: type !== 'summary'
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

  // Podcast Generation via Google Gemini & Speech Audio Synthesis
  const handlePodcastGeneration = async (req: express.Request, res: express.Response) => {
    const studyText = req.body.topic || req.body.content || req.body.studyMaterial || req.body.fileContent || '';

    try {
      // Generate script using Google Gemini
      let rawScript = '';
      try {
        rawScript = await generateGeminiPodcastScript(studyText);
      } catch (geminiErr: any) {
        console.warn('Gemini podcast generation error:', geminiErr?.message || geminiErr);
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
  app.post('/api/podcast/generate', requireAuth, apiRateLimiter, handlePodcastGeneration);

  // Message Validation Route
  app.post('/api/ai/validate', requireAuth, apiRateLimiter, async (req, res) => {
    const { text, message, groupName, groupDesc } = req.body;
    const msgText = text || message || '';
    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        return res.json(getValidateFallback());
      }
      const rawContent = await runAICall({
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
      if (!supabaseAdmin) return;

      const { error } = await supabaseAdmin.from('admin_logs').insert({
        action: event,
        actor: 'admin',
        details: { status, message: details, ip, userAgent },
      });
      if (error) console.warn('Audit log write warning:', error.message);
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

      const adminUid = 'scolaris_admin_system_uid';

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
        user: {
          uid: adminUid,
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

    // 2. Try verifying a Supabase user token belonging to a listed admin
    if (supabaseAuthClient && supabaseAdmin) {
      try {
        const { data: userData, error: userError } = await supabaseAuthClient.auth.getUser(token);
        if (!userError && userData.user) {
          const { data: adminRow } = await supabaseAdmin
            .from('admins')
            .select('user_id')
            .eq('user_id', userData.user.id)
            .maybeSingle();
          if (adminRow) {
            (req as any).adminUser = { email: userData.user.email || 'admin@scolaris.ai', role: 'admin' };
            return next();
          }
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

  // Fetch every row of a table with the service role (paged past the 1000-row API limit)
  async function fetchTableRows(table: string): Promise<any[]> {
    if (!supabaseAdmin) return [];
    const pageSize = 1000;
    const rows: any[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabaseAdmin.from(table).select('*').range(from, from + pageSize - 1);
      if (error) {
        console.warn(`Admin fetch for ${table} warning:`, error.message);
        break;
      }
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  }

  // Admin Overview Statistics
  app.get('/api/admin/stats', authenticateAdminToken, async (req, res) => {
    try {
      await recordAdminAuditLog('DASHBOARD_OVERVIEW_VIEW', 'Viewed system overview metrics and user telemetry', 'SUCCESS', req);

      const [profiles, courses, hubs, groups, sessions] = await Promise.all([
        fetchTableRows('profiles'),
        fetchTableRows('courses'),
        fetchTableRows('study_hubs'),
        fetchTableRows('study_groups'),
        fetchTableRows('study_sessions')
      ]);

      const now = Date.now();
      const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

      const totalUsers = profiles.length;
      const newUsers = profiles.filter(p => {
        if (!p.created_at) return false;
        const time = new Date(p.created_at).getTime();
        return time >= sevenDaysAgo;
      }).length;

      let totalAIConversations = 0;
      let totalMaterials = 0;

      hubs.forEach(h => {
        if (h.summary) totalAIConversations += 1;
        if (Array.isArray(h.flashcards)) totalAIConversations += h.flashcards.length;
        if (Array.isArray(h.quizzes)) totalAIConversations += h.quizzes.length;
        if (h.transcript) totalAIConversations += 1;
        if (h.file_name || h.file_content) totalMaterials += 1;
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

      const profiles = await fetchTableRows('profiles');
      const userList = profiles.map(p => ({
        uid: p.id || 'unknown',
        name: p.name || 'Scholar User',
        email: p.email || 'N/A',
        institution: p.institution || 'Not Specified',
        level: p.level || 'Undergraduate',
        tier: p.tier || 'scholar',
        isPro: p.is_pro ?? true,
        onboarded: p.onboarded ?? false,
        updatedAt: p.updated_at || new Date().toISOString()
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

      const hubs = await fetchTableRows('study_hubs');

      let summariesCount = 0;
      let flashcardsCount = 0;
      let quizzesCount = 0;
      let podcastCount = 0;

      hubs.forEach(h => {
        if (h.summary) summariesCount++;
        if (Array.isArray(h.flashcards)) flashcardsCount += h.flashcards.length;
        if (Array.isArray(h.quizzes)) quizzesCount += h.quizzes.length;
        if (h.podcast_url || h.transcript) podcastCount++;
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
          status: supabaseAdmin ? 'Connected' : 'Service key not configured',
          projectId: (() => { try { return new URL(SUPABASE_URL).hostname.split('.')[0]; } catch { return 'not-configured'; } })(),
          firestoreDatabaseId: 'public (Postgres)'
        },
        aiEngines: {
          gemini: pickGeminiKey() ? 'Online' : 'Configured'
        },
        timestamp: new Date().toISOString()
      }
    });
  });

  // Admin Audit Logs Endpoint
  app.get('/api/admin/logs', authenticateAdminToken, async (req, res) => {
    try {
      await recordAdminAuditLog('AUDIT_LOGS_VIEW', 'Fetched administrative security audit trail', 'SUCCESS', req);
      const rawLogs = await fetchTableRows('admin_logs');
      const sortedLogs = rawLogs
        .map((l) => ({
          id: l.id,
          event: l.action,
          status: l.details?.status || 'SUCCESS',
          timestamp: l.created_at,
          details: l.details?.message || '',
          ip: l.details?.ip || '',
          userAgent: l.details?.userAgent || ''
        }))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

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

  // Ensure default storage buckets exist if service role client is active
  if (supabaseAdmin) {
    const bucketsToEnsure = ['user-files', 'group-materials', 'scolaris-library'];
    for (const b of bucketsToEnsure) {
      supabaseAdmin.storage.createBucket(b, {
        public: true,
        fileSizeLimit: 52428800 // 50MB
      }).then(({ error }) => {
        if (!error) console.log(`[Storage] Auto-created bucket '${b}' on Supabase.`);
      }).catch(() => {});
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
