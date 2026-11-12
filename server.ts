import express from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isAiSender } from './lib/brand';
import { GoogleGenAI } from '@google/genai';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { 
  processDocumentBuffer, 
  normalizeExtractedText, 
  validateExtractedText, 
  selectRelevantChunks 
} from './lib/documentProcessor';
import { NIGERIAN_UNIVERSITIES } from './utils/nigerianUniversities';
import { buildStudentContext } from './lib/studentContext';
import {
  AI_CREDIT_ALLOWANCES,
  AI_CREDIT_COSTS,
  getMonthlyCreditAllowance,
  getNormalizedCreditTier
} from './lib/aiCredits';
import { MAX_UPLOAD_BYTES } from './lib/limits';

// Load .env for local development (hosting platforms inject real environment variables instead)
try { process.loadEnvFile(); } catch { /* no .env file: rely on the environment */ }

export function cleanEnvKey(name: string): string {
  if (!name || typeof process === 'undefined' || !process.env) return '';
  // 1. Direct lookup
  let val = process.env[name];
  // 2. Case-insensitive and trimmed key lookup fallback (vital for Linux/Vercel hostings)
  if (!val) {
    const target = name.trim().toUpperCase();
    for (const [k, v] of Object.entries(process.env)) {
      if (k.trim().toUpperCase() === target && typeof v === 'string') {
        val = v;
        break;
      }
    }
  }
  if (!val || typeof val !== 'string') return '';
  return val.replace(/^["']+|["']+$/g, '').replace(/[\r\n]/g, '').trim();
}

export function getPaystackSecretKey(): string {
  return (
    cleanEnvKey('PAYSTACK_SECRET_KEY') ||
    cleanEnvKey('PAYSTACK_SECRET') ||
    cleanEnvKey('PAYSTACK_KEY') ||
    cleanEnvKey('SCOLARIS_PAYSTACK_SECRET_KEY')
  );
}

export function getPaystackPlusPlanCode(): string {
  return (
    cleanEnvKey('PAYSTACK_PLUS_PLAN_CODE') ||
    cleanEnvKey('PAYSTACK_PLAN_PLUS') ||
    cleanEnvKey('PAYSTACK_PLUS_CODE') ||
    'PLN_2s5jpok47fzrpp3'
  );
}

export function getPaystackStudioPlanCode(): string {
  return (
    cleanEnvKey('PAYSTACK_STUDIO_PLAN_CODE') ||
    cleanEnvKey('PAYSTACK_PLAN_STUDIO') ||
    cleanEnvKey('PAYSTACK_STUDIO_CODE') ||
    'PLN_z34ejcjcs5od3mf'
  );
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
if (!getPaystackSecretKey()) {
  console.warn('Paystack secret key is not configured: set PAYSTACK_SECRET_KEY in hosting environment variables to enable payments and verification.');
}

export function getSupabaseS3AccessKeyId(): string {
  return cleanEnvKey('SUPABASE_S3_ACCESS_KEY_ID') || cleanEnvKey('S3_ACCESS_KEY_ID') || cleanEnvKey('AWS_ACCESS_KEY_ID');
}

export function getSupabaseS3SecretAccessKey(): string {
  return cleanEnvKey('SUPABASE_S3_SECRET_ACCESS_KEY') || cleanEnvKey('S3_SECRET_ACCESS_KEY') || cleanEnvKey('AWS_SECRET_ACCESS_KEY');
}

export function getSupabaseS3Region(): string {
  return cleanEnvKey('SUPABASE_S3_REGION') || cleanEnvKey('AWS_REGION') || 'eu-west-2';
}

export function isS3Configured(): boolean {
  return Boolean(getSupabaseS3AccessKeyId() && getSupabaseS3SecretAccessKey() && getSupabaseS3Endpoint());
}

if (!isS3Configured()) {
  console.warn('Supabase S3 storage keys are not configured: set SUPABASE_S3_ACCESS_KEY_ID and SUPABASE_S3_SECRET_ACCESS_KEY to enable high-speed storage, direct uploads, and AI audio persistence.');
} else {
  console.log('✓ Supabase S3 storage is configured and active.');
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

// Gemini models are env-configurable because Google retires them. Override GEMINI_MODEL in hosting env
// instead of editing code. Later entries are fallbacks tried in order.
const GEMINI_PRIMARY_MODEL = cleanEnvKey('GEMINI_MODEL') || 'gemini-3.6-flash';
const GEMINI_FALLBACK_MODELS = [
  cleanEnvKey('GEMINI_FALLBACK_MODEL'),
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash'
].filter(Boolean) as string[];
const OCR_MODEL = GEMINI_PRIMARY_MODEL;
const OCR_MAX_PDF_BYTES = MAX_UPLOAD_BYTES; // Raised to 50 MB (single source of truth in lib/limits.ts)

function pickGeminiKey(): string | null {
  const gemini = cleanEnvKey('GEMINI_API_KEY');
  if (gemini) return gemini;
  const scolaris = cleanEnvKey('SCOLARIS_AI_KEY');
  if (scolaris && (scolaris.startsWith('AIzaSy') || !scolaris.startsWith('gsk_'))) return scolaris;
  return null;
}

/** Reads a scanned PDF or image document with Gemini's native multimodal vision across fallback models. Returns '' when it can't. */
async function ocrMediaWithGemini(buffer: Buffer, mimeType: string, apiKey: string): Promise<string> {
  if (buffer.length > OCR_MAX_PDF_BYTES) {
    console.warn(`[OCR] Skipped: file is ${(buffer.length / 1048576).toFixed(1)} MB (limit ${OCR_MAX_PDF_BYTES / 1048576} MB).`);
    return '';
  }
  const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
  const candidateModels = Array.from(new Set([OCR_MODEL, ...GEMINI_FALLBACK_MODELS]));
  const base64Data = buffer.toString('base64');

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          { inlineData: { data: base64Data, mimeType } },
          'Transcribe all text in this academic document, notes, slides, or transcript exactly as written, in reading order, page by page. ' +
            'Include course codes, course titles, headings, body text, credit units, scores, grades, bullet points, and handwritten text. Do not summarize, translate, or add commentary. ' +
            'Where there is a diagram or image with no text, write [diagram]. Output plain text only.'
        ],
        config: { temperature: 0 }
      });
      const text = normalizeExtractedText(response.text || '');
      if (text) return text;
    } catch (err: any) {
      console.warn(`[OCR] Gemini OCR model ${model} failed (${err?.status || 'ERR'}):`, err?.message || err);
    }
  }
  return '';
}

async function ocrPdfWithGemini(buffer: Buffer, apiKey: string): Promise<string> {
  return ocrMediaWithGemini(buffer, 'application/pdf', apiKey);
}

/** Normal extraction first; if a file is an image or a scanned PDF, use Gemini vision OCR. */
async function extractDocumentWithOcrFallback(
  buffer: Buffer,
  fileName: string,
  fileType: string
) {
  const lowerName = (fileName || '').toLowerCase();
  const lowerType = (fileType || '').toLowerCase();
  const isImage =
    lowerType.startsWith('image/') ||
    /\.(jpe?g|png|webp|heic|bmp|tiff|jfif)$/i.test(lowerName);

  if (isImage) {
    let imageMime = lowerType.startsWith('image/') ? lowerType : 'image/jpeg';
    if (lowerName.endsWith('.png')) imageMime = 'image/png';
    else if (lowerName.endsWith('.webp')) imageMime = 'image/webp';
    else if (lowerName.endsWith('.gif')) imageMime = 'image/gif';
    else if (lowerName.endsWith('.bmp')) imageMime = 'image/bmp';
    else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.jfif')) imageMime = 'image/jpeg';

    const key = pickGeminiKey();
    if (!key) {
      return {
        success: false,
        extractedText: '',
        fileTypeDetected: 'image',
        isScannedPdf: false,
        usedOcr: false,
        error: "Image OCR is currently unavailable on the server. Please upload a PDF with selectable text or enter grades manually."
      };
    }

    const text = await ocrMediaWithGemini(buffer, imageMime, key);
    if (text && text.trim().length >= 5) {
      return {
        success: true,
        extractedText: text,
        fileTypeDetected: 'image',
        pageCount: 1,
        usedOcr: true
      };
    }

    return {
      success: false,
      extractedText: '',
      fileTypeDetected: 'image',
      isScannedPdf: false,
      usedOcr: false,
      error: "We couldn't read clear text from this photo. Try a clearer, well-lit photo, upload a PDF transcript, or enter grades manually."
    };
  }

  const isPdf = lowerName.endsWith('.pdf') || lowerType.includes('pdf');
  const result = await processDocumentBuffer(buffer, fileName, fileType);
  if (result.success && result.extractedText && result.extractedText.trim().length >= 30) {
    return { ...result, usedOcr: false };
  }

  // If standard extraction failed or yielded negligible text on a PDF, attempt Gemini Vision OCR
  if (isPdf || result.isScannedPdf) {
    const key = pickGeminiKey();
    if (!key) {
      return {
        ...result,
        error: "This PDF looks scanned or image-based and requires OCR, but Gemini AI is not configured on the server.",
        usedOcr: false
      };
    }

    const text = await ocrPdfWithGemini(buffer, key);
    if (text && text.trim().length >= 5) {
      return {
        success: true,
        extractedText: text,
        fileTypeDetected: 'pdf',
        pageCount: result.pageCount || 1,
        usedOcr: true
      };
    }

    return {
      ...result,
      error: "This PDF contains scanned pages or slides and we couldn't read clear text from it. Please upload a clearer copy or enter grades manually.",
      usedOcr: false
    };
  }

  return { ...result, usedOcr: false };
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

export async function createExpressApp() {
  const app = express();
  const PORT = 3000;

  // Security: Disable X-Powered-By fingerprinting
  app.disable('x-powered-by');

  // Security: Standard OWASP protection headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '0');
    next();
  });

  // Security: Restrict CORS to authorized application origins and local dev
  const allowedOrigins = [
    'https://scolaris-aia.vercel.app',
    'https://korsiq.com',
    'https://www.korsiq.com',
    cleanEnvKey('APP_URL'),
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''
  ].filter(Boolean) as string[];

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, server-to-server, Paystack webhooks)
      if (!origin) return callback(null, true);
      // Allow localhost in development
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      // Allow Vercel preview and production deployments
      try {
        const host = new URL(origin).hostname;
        if (host.endsWith('.vercel.app') || allowedOrigins.some(o => o.toLowerCase() === origin.toLowerCase())) {
          return callback(null, true);
        }
      } catch {}
      // Fallback: allow request but do not reflect unauthorized origin
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-paystack-signature', 'x-requested-with']
  }));

  // URL normalizer: ensure incoming paths match Express /api routes on all hosting providers
  app.use((req, _res, next) => {
    if (
      req.url && 
      !req.url.startsWith('/api') && 
      !req.url.startsWith('/assets') && 
      req.url !== '/' && 
      req.url !== '/index.html' && 
      !req.url.startsWith('/vite') &&
      req.url !== '/admin' &&
      !req.url.startsWith('/admin')
    ) {
      req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }
    next();
  });
  app.use(express.json({
    limit: '50mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  }));
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
    rawBody?: Buffer;
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
      req.user = { uid: data.user.id, id: data.user.id, email: data.user.email };
      next();
    } catch (err: any) {
      console.warn('[Auth Middleware] Error verifying token:', err?.message || err);
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired access token' });
    }
  };

  // Helper to fetch server-authenticated student profile & courses for AI tailoring
  const getStudentContextForUser = async (userId?: string): Promise<string> => {
    if (!supabaseAdmin || !userId) return buildStudentContext(null, []);
    try {
      const [profileRes, coursesRes] = await Promise.all([
        // NOTE: the profiles column is `institution` (there is no `university` column)
        supabaseAdmin.from('profiles').select('department, major, level, institution, name').eq('id', userId).maybeSingle(),
        supabaseAdmin.from('courses').select('code, title, credits').eq('user_id', userId)
      ]);
      if (profileRes.error) console.warn('Student context profile query failed:', profileRes.error.message);
      if (coursesRes.error) console.warn('Student context courses query failed:', coursesRes.error.message);
      const p: any = profileRes.data;
      const profile = p ? { ...p, university: p.institution || '' } : null;
      // NOTE: the courses column is `credits` (mapped to `units` in the client)
      const courseRows = (coursesRes.data || []).map((c: any) => ({ code: c.code, title: c.title, units: c.credits }));
      return buildStudentContext(profile, courseRows);
    } catch (err) {
      console.warn('Failed to fetch student context for AI:', err);
      return buildStudentContext(null, []);
    }
  };

  // Middleware to enforce paid feature tier access on the backend (Plus / Studio / Scholar / Sage)
  const requirePaidTier = (allowedTiers: string[] = ['plus', 'studio', 'scholar', 'sage']) => {
    return async (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
      const uid = req.user?.uid;
      if (!uid) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      }

      try {
        const client = supabaseAdmin || supabaseAuthClient;
        if (!client) {
          // If Supabase client is not available in mock/local mode, allow through
          return next();
        }

        const { data: profile, error } = await client
          .from('profiles')
          .select('tier, is_pro, subscription_tier, subscription_status, subscription_end')
          .eq('id', uid)
          .maybeSingle();

        if (error) {
          console.warn('[Paid Tier Gate] Failed to load profile:', error.message);
        }

        const userTier = (profile?.subscription_tier || profile?.tier || 'free').toLowerCase();
        const isPro = profile?.is_pro === true;
        const normalizedAllowed = allowedTiers.map(t => t.toLowerCase());

        // Check if subscription has expired
        if (profile?.subscription_end) {
          const expiryTime = new Date(profile.subscription_end).getTime();
          if (!isNaN(expiryTime) && Date.now() > expiryTime) {
            return res.status(403).json({
              success: false,
              error: 'Subscription expired: Your billing period has ended. Please renew to continue using premium features.',
              code: 'SUBSCRIPTION_EXPIRED',
              requiredTiers: allowedTiers,
              currentTier: userTier,
              isPro: false,
              subscriptionEnd: profile.subscription_end
            });
          }
        }

        const subStatus = (profile?.subscription_status || '').toLowerCase();
        if (subStatus === 'expired' || subStatus === 'failed') {
          return res.status(403).json({
            success: false,
            error: 'Subscription inactive: Your subscription is currently expired or past due. Please update payment.',
            code: 'SUBSCRIPTION_INACTIVE',
            requiredTiers: allowedTiers,
            currentTier: userTier
          });
        }

        const hasAccess = isPro && normalizedAllowed.includes(userTier);

        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            error: 'Subscription required: This feature is only available on Plus and Academic Studio plans.',
            code: 'SUBSCRIPTION_REQUIRED',
            requiredTiers: allowedTiers,
            currentTier: userTier,
            isPro
          });
        }

        next();
      } catch (err: any) {
        console.error('[Paid Tier Gate] Subscription verification error:', err);
        return res.status(500).json({ success: false, error: 'Failed to verify subscription permissions' });
      }
    };
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

    const geminiCandidateModels = Array.from(new Set([GEMINI_PRIMARY_MODEL, ...GEMINI_FALLBACK_MODELS]));
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
    console.error('[Gemini AI Execution Fatal]:', { models: geminiCandidateModels, status: lastError?.status, reason: failureReason });
    throw new Error(`Gemini AI service error: ${failureReason}`);
  };

  let s3Client: S3Client | null = null;
  const getS3 = () => {
    if (!s3Client) {
      const accessKeyId = getSupabaseS3AccessKeyId();
      const secretAccessKey = getSupabaseS3SecretAccessKey();
      if (!accessKeyId || !secretAccessKey) {
        throw new Error('Supabase S3 access keys SUPABASE_S3_ACCESS_KEY_ID and SUPABASE_S3_SECRET_ACCESS_KEY are not configured.');
      }
      s3Client = new S3Client({
        endpoint: getSupabaseS3Endpoint(),
        region: getSupabaseS3Region(),
        forcePathStyle: true,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }
    return s3Client;
  };

  function inferBucketFromKey(key: string, explicitBucket?: string): string {
    if (explicitBucket && typeof explicitBucket === 'string' && explicitBucket.trim()) {
      return explicitBucket.trim();
    }
    const clean = String(key || '').trim();
    if (clean.startsWith('users/')) return 'user-files';
    if (clean.startsWith('groups/')) return 'group-materials';
    if (clean.startsWith('library/')) return 'scolaris-library';
    return cleanEnvKey('SUPABASE_S3_BUCKET_NAME') || 'user-files';
  }

  async function downloadBufferViaS3(bucketName: string, key: string): Promise<Buffer | null> {
    if (!isS3Configured()) return null;
    try {
      const s3 = getS3();
      const cmd = new GetObjectCommand({ Bucket: bucketName, Key: key });
      const res = await s3.send(cmd);
      if (res.Body) {
        const bytes = await res.Body.transformToByteArray();
        return Buffer.from(bytes);
      }
    } catch {
      // not found in this bucket or S3 error
    }
    return null;
  }

  // API Routes
  app.get('/api/health', (req, res) => {
    const paystackKey = getPaystackSecretKey();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        supabase: Boolean(supabaseAuthClient),
        supabaseAdmin: Boolean(supabaseAdmin),
        gemini: Boolean(pickGeminiKey()),
        paystack: Boolean(paystackKey),
        s3: isS3Configured()
      }
    });
  });

  // SEO Static Deliverables
  app.get('/robots.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=43200');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(process.cwd(), 'public', 'robots.txt'));
  });

  app.get('/sitemap.xml', (req, res) => {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=43200');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(process.cwd(), 'public', 'sitemap.xml'));
  });

  // Get S3 configuration details
  app.get('/api/s3/config', (req, res) => {
    res.json({
      configured: isS3Configured(),
      endpoint: getSupabaseS3Endpoint(),
      region: getSupabaseS3Region(),
      buckets: {
        userFiles: 'user-files',
        groupMaterials: 'group-materials',
        library: 'scolaris-library'
      }
    });
  });

  // =============================================================
  // KORSIQ SUBSCRIPTION & PAYMENT MANAGEMENT (PAYSTACK & VERIFICATION)
  // =============================================================

  const PAYSTACK_PLANS = {
    plus: {
      tier: 'plus' as const,
      name: 'KorsIQ Plus',
      amountNaira: 7500,
      amountKobo: 750000,
      planCode: getPaystackPlusPlanCode()
    },
    studio: {
      tier: 'studio' as const,
      name: 'KorsIQ Studio',
      amountNaira: 15000,
      amountKobo: 1500000,
      planCode: getPaystackStudioPlanCode()
    }
  };

  /**
   * Resiliently updates the user's profile tier/pro status, falling back gracefully
   * if optional subscription columns have not yet been migrated on the live database.
   */
  async function activatePaidProfile(
    client: SupabaseClient,
    userId: string,
    planTier: 'plus' | 'studio' | 'free',
    isPro: boolean,
    subscriptionStatus: string,
    paymentStatus: string,
    endDateIso: string | null,
    paystackCustCode?: string | null
  ) {
    const fullUpdate: Record<string, any> = {
      tier: planTier,
      is_pro: isPro,
      subscription_tier: planTier,
      subscription_status: subscriptionStatus,
      payment_status: paymentStatus,
      subscription_end: endDateIso
    };
    if (paystackCustCode !== undefined) {
      fullUpdate.paystack_customer_code = paystackCustCode;
    }

    let { error } = await client.from('profiles').update(fullUpdate).eq('id', userId);
    if (error && (error.code === 'PGRST204' || error.message?.includes('column') || error.message?.includes('schema cache'))) {
      const withoutCustCode = {
        tier: planTier,
        is_pro: isPro,
        subscription_tier: planTier,
        subscription_status: subscriptionStatus,
        payment_status: paymentStatus,
        subscription_end: endDateIso
      };
      const retry1 = await client.from('profiles').update(withoutCustCode).eq('id', userId);
      error = retry1.error;

      if (error && (error.code === 'PGRST204' || error.message?.includes('column') || error.message?.includes('schema cache'))) {
        const coreOnly = { tier: planTier, is_pro: isPro };
        const retry2 = await client.from('profiles').update(coreOnly).eq('id', userId);
        error = retry2.error;
      }
    }
    if (error) {
      console.error('[Subscription] Failed to update profile tier:', error.message);
    }
    return { error };
  }

  // Initialize checkout transaction
  app.post('/api/subscription/initialize', requireAuth, apiRateLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const { plan, billingCycle = 'monthly' } = req.body;
      const normalizedPlan = (plan === 'studio' || plan === 'sage' || plan === 'premium') ? 'studio' : 'plus';
      const targetPlan = PAYSTACK_PLANS[normalizedPlan];
      const uid = req.user!.uid;
      const email = req.user?.email?.trim();

      if (!email || !email.includes('@')) {
        return res.status(400).json({
          success: false,
          error: 'A valid email address associated with your account is required to initiate subscription.'
        });
      }

      if (!supabaseAdmin) {
        console.error('[Subscription Initialize] SUPABASE_SERVICE_ROLE_KEY is not configured; cannot write to payment_transactions ledger.');
        return res.status(503).json({
          success: false,
          error: 'Payment ledger service is not configured on the server (missing SUPABASE_SERVICE_ROLE_KEY).'
        });
      }

      const paystackKey = getPaystackSecretKey();
      if (!paystackKey) {
        console.error('[Subscription Initialize] PAYSTACK_SECRET_KEY is not configured on the server.');
        return res.status(503).json({
          success: false,
          error: 'Payment gateway is not configured on the server (missing PAYSTACK_SECRET_KEY in server environment).'
        });
      }

      const reference = `KQ_${normalizedPlan.toUpperCase()}_${uid.slice(0, 8)}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      // Store pending transaction in payment_transactions ledger BEFORE calling gateway. Fail loudly if insert fails.
      const { error: ledgerInsertErr } = await supabaseAdmin.from('payment_transactions').insert({
        user_id: uid,
        reference,
        plan_tier: normalizedPlan,
        amount_kobo: targetPlan.amountKobo,
        amount_naira: targetPlan.amountNaira,
        currency: 'NGN',
        status: 'pending',
        customer_email: email,
        paystack_plan_code: targetPlan.planCode,
        metadata: { billingCycle, initiatedAt: new Date().toISOString() }
      });

      if (ledgerInsertErr) {
        console.error('[Subscription Initialize] Failed to insert payment_transactions row:', ledgerInsertErr);
        return res.status(500).json({
          success: false,
          error: `Could not create payment ledger record: ${ledgerInsertErr.message}`
        });
      }

      const origin = req.headers.origin || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
      const callbackUrl = `${origin.replace(/\/$/, '')}/?payment=return`;

      const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paystackKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          amount: targetPlan.amountKobo,
          plan: targetPlan.planCode,
          reference,
          currency: 'NGN',
          callback_url: callbackUrl,
          metadata: {
            userId: uid,
            planTier: normalizedPlan,
            planCode: targetPlan.planCode,
            billingCycle
          }
        })
      });

      const paystackData = await paystackRes.json();
      if (!paystackRes.ok || !paystackData.status) {
        await supabaseAdmin.from('payment_transactions').update({
          status: 'failed',
          gateway_response: paystackData.message || 'Initialization failed'
        }).eq('reference', reference);

        return res.status(400).json({
          success: false,
          error: paystackData.message || 'Failed to initialize Paystack checkout'
        });
      }

      const returnedRef = paystackData.data?.reference || reference;
      await supabaseAdmin.from('payment_transactions').update({
        paystack_reference: returnedRef,
        authorization_url: paystackData.data?.authorization_url,
        access_code: paystackData.data?.access_code
      }).eq('reference', reference);

      return res.json({
        success: true,
        authorizationUrl: paystackData.data.authorization_url,
        accessCode: paystackData.data.access_code,
        reference: returnedRef,
        plan: normalizedPlan,
        amount: targetPlan.amountNaira,
        currency: 'NGN'
      });
    } catch (err: any) {
      console.error('Initialize subscription error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Checkout initialization failed' });
    }
  });

  // Verify transaction status securely on the backend (also serves as manual receipt recovery endpoint)
  app.post('/api/subscription/verify', requireAuth, apiRateLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const { reference } = req.body;
      let cleanRef = (typeof reference === 'string' ? reference.trim() : '').replace(/[^a-zA-Z0-9_-]/g, '');
      const uid = req.user!.uid;
      const userEmail = (req.user?.email || req.body?.email || '').toLowerCase().trim();
      const client = supabaseAdmin || supabaseAuthClient;

      if (!supabaseAdmin) {
        console.warn('[Subscription Verify] SUPABASE_SERVICE_ROLE_KEY is missing; ledger/subscription writes may fail under RLS.');
      }

      // 1. Idempotency check if this exact payment_reference was already processed
      if (client && cleanRef) {
        const { data: existingSub } = await client
          .from('subscriptions')
          .select('*')
          .eq('payment_reference', cleanRef)
          .maybeSingle();

        if (existingSub && existingSub.payment_status === 'paid' && (existingSub.status === 'active' || existingSub.status === 'manual_active')) {
          if (existingSub.user_id !== uid) {
            return res.status(403).json({ success: false, error: 'Access denied: Payment reference belongs to a different account.' });
          }
          await activatePaidProfile(
            client,
            uid,
            existingSub.plan_tier === 'studio' ? 'studio' : 'plus',
            true,
            'active',
            'paid',
            existingSub.current_period_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            existingSub.paystack_customer_code
          );
          return res.json({
            success: true,
            tier: existingSub.plan_tier,
            isPro: true,
            subscriptionStatus: 'active',
            currentPeriodEnd: existingSub.current_period_end,
            message: 'Subscription is verified and active.',
            subscription: existingSub,
            alreadyProcessed: true
          });
        }
      }

      // Load pending transaction record if exists in ledger
      let localTx: any = null;
      if (client && cleanRef) {
        const { data } = await client
          .from('payment_transactions')
          .select('*')
          .or(`reference.eq.${cleanRef},paystack_reference.eq.${cleanRef}`)
          .limit(1)
          .maybeSingle();
        localTx = data;

        // Enforce ledger ownership: a user cannot verify another user's ledger reference
        if (localTx && localTx.user_id && localTx.user_id !== uid) {
          return res.status(403).json({
            success: false,
            error: 'Access denied: This payment reference was initiated by a different user.'
          });
        }
      }

      const paystackKey = getPaystackSecretKey();
      if (!paystackKey) {
        return res.status(503).json({
          success: false,
          error: 'Payment verification is unavailable: PAYSTACK_SECRET_KEY is not configured on the server. If recently added in Vercel environment variables, please redeploy the project.'
        });
      }

      let isVerified = false;
      const requestedPlan = req.body?.plan === 'studio' || req.body?.plan === 'premium' ? 'studio' : req.body?.plan === 'plus' ? 'plus' : undefined;
      let planTier: 'plus' | 'studio' =
        localTx?.plan_tier ||
        ((cleanRef.toUpperCase().includes('_STUDIO_')) ? 'studio' : (cleanRef.toUpperCase().includes('_PLUS_') ? 'plus' : (requestedPlan || 'plus')));
      let targetPlanConfig = planTier === 'studio' ? PAYSTACK_PLANS.studio : PAYSTACK_PLANS.plus;
      let amountPaid = targetPlanConfig.amountNaira;
      let paymentStatus: 'paid' | 'failed' | 'abandoned' | 'pending' | 'cancelled' = 'paid';
      let gatewayMessage = '';
      let paystackSubCode: string | null = null;
      let paystackCustCode: string | null = null;
      let paystackAuthCode: string | null = null;
      let paystackPlanCode: string | null = targetPlanConfig.planCode;
      let paidAtIso: string | null = null;

      let tx: any = null;

      // Try direct reference verification with Paystack if reference was supplied
      if (cleanRef) {
        try {
          const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(cleanRef)}`, {
            headers: {
              Authorization: `Bearer ${paystackKey}`,
              'Content-Type': 'application/json'
            }
          });
          const verifyData = await verifyRes.json();
          if (verifyRes.ok && verifyData.status && verifyData.data) {
            tx = verifyData.data;
          } else if (verifyData?.message) {
            gatewayMessage = verifyData.message;
          }
        } catch (vErr) {
          console.warn('Paystack direct verify lookup warning:', vErr);
        }
      }

      // Recovery fallback: If no reference was found (or user paid via direct Paystack shop link without reference),
      // look up recent Paystack transactions for this authenticated user's email
      if (!tx && !cleanRef && userEmail) {
        try {
          const custRes = await fetch(`https://api.paystack.co/transaction?customer=${encodeURIComponent(userEmail)}&perPage=10`, {
            headers: {
              Authorization: `Bearer ${paystackKey}`,
              'Content-Type': 'application/json'
            }
          });
          const custData = await custRes.json();
          if (custRes.ok && custData.status && Array.isArray(custData.data)) {
            const matchingTx = custData.data.find((t: any) =>
              t.status === 'success' &&
              t.currency === 'NGN' &&
              t.amount >= PAYSTACK_PLANS.plus.amountKobo &&
              t.customer?.email?.toLowerCase().trim() === userEmail
            );
            if (matchingTx) {
              tx = matchingTx;
              cleanRef = matchingTx.reference || cleanRef;
            }
          }
        } catch (cErr) {
          console.warn('Paystack customer transaction search warning:', cErr);
        }
      }

      if (!tx) {
        if (!cleanRef) {
          return res.status(400).json({
            success: false,
            error: 'No verified payment was found. Please paste the reference from your Paystack receipt.'
          });
        }
        return res.status(400).json({
          success: false,
          error: `Payment reference '${cleanRef}' could not be verified on Paystack${gatewayMessage ? ` (${gatewayMessage})` : ''}. Check the reference on your receipt and try again.`
        });
      }

      const resolvedRef = (localTx?.reference || tx.reference || cleanRef).trim();
      gatewayMessage = tx.gateway_response || gatewayMessage || tx.status;

      if (tx.status === 'success') {
        // STRICT SECURITY CHECKS:
        // 1. Currency must be NGN
        if (tx.currency !== 'NGN') {
          return res.status(400).json({ success: false, error: 'Invalid currency: Only NGN transactions are accepted.' });
        }

        // 2. Customer ownership verification (cross-user replay protection)
        const customerEmail = tx.customer?.email?.toLowerCase().trim();
        const metaUserId = tx.metadata?.userId;
        const emailMatches = Boolean(customerEmail && userEmail && customerEmail === userEmail);
        const userIdMatches = Boolean(metaUserId && metaUserId === uid) || Boolean(localTx && localTx.user_id === uid);
        if (!emailMatches && !userIdMatches) {
          return res.status(403).json({
            success: false,
            error: 'Payment verification failed: This transaction receipt belongs to a different email address.'
          });
        }

        // 3. Determine target plan and verify exact minimum amount in kobo
        // If localTx exists, enforce localTx.plan_tier; otherwise infer from metadata or amount
        if (localTx?.plan_tier === 'studio' || tx.metadata?.planTier === 'studio') {
          planTier = 'studio';
        } else if (localTx?.plan_tier === 'plus' || tx.metadata?.planTier === 'plus') {
          planTier = 'plus';
        } else {
          planTier = tx.amount >= PAYSTACK_PLANS.studio.amountKobo ? 'studio' : 'plus';
        }
        targetPlanConfig = planTier === 'studio' ? PAYSTACK_PLANS.studio : PAYSTACK_PLANS.plus;

        const expectedKobo = targetPlanConfig.amountKobo;
        if (tx.amount < expectedKobo) {
          return res.status(400).json({
            success: false,
            error: `Underpaid transaction: Received ₦${(tx.amount / 100).toLocaleString()}, expected at least ₦${targetPlanConfig.amountNaira.toLocaleString()} for ${targetPlanConfig.name}.`
          });
        }

        isVerified = true;
        paymentStatus = 'paid';
        amountPaid = tx.amount / 100;
        paidAtIso = tx.paid_at ? new Date(tx.paid_at).toISOString() : new Date().toISOString();
        paystackSubCode = tx.subscription_code || tx.customer?.subscription_code || null;
        paystackCustCode = tx.customer?.customer_code || null;
        paystackAuthCode = tx.authorization?.authorization_code || null;
        paystackPlanCode = (typeof tx.plan === 'string' ? tx.plan : tx.plan?.plan_code) || targetPlanConfig.planCode;
      } else if (tx.status === 'abandoned' || tx.status === 'failed' || tx.status === 'reversed') {
        paymentStatus = tx.status === 'abandoned' ? 'abandoned' : 'failed';
        isVerified = false;
      } else {
        paymentStatus = 'pending';
        isVerified = false;
      }

      // If payment failed, abandoned, or pending: record status without granting paid access
      if (!isVerified || paymentStatus !== 'paid') {
        if (client && resolvedRef) {
          await client.from('payment_transactions').update({
            status: paymentStatus === 'pending' ? 'pending' : 'failed',
            paystack_reference: tx.reference || resolvedRef,
            gateway_response: gatewayMessage
          }).eq('reference', resolvedRef);
        }

        return res.status(400).json({
          success: false,
          status: paymentStatus,
          error: paymentStatus === 'pending'
            ? 'Your payment is still being processed by Paystack. Please wait a moment and try again.'
            : `Payment verification unsuccessful: Paystack reported status '${tx.status || paymentStatus}'. Paid access was not granted.`,
          message: gatewayMessage
        });
      }

      // On successful verified payment:
      const startDate = paidAtIso ? new Date(paidAtIso) : new Date();
      const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      if (client) {
        // 1. Upsert payment_transactions ledger (handles both initialized rows and manual receipt recovery)
        const { error: txUpsertErr } = await client.from('payment_transactions').upsert({
          user_id: uid,
          reference: resolvedRef,
          paystack_reference: tx.reference || resolvedRef,
          plan_tier: planTier,
          amount_kobo: Math.round(amountPaid * 100),
          amount_naira: amountPaid,
          currency: 'NGN',
          status: 'success',
          customer_email: userEmail || tx.customer?.email || 'user@korsiq.app',
          paystack_plan_code: paystackPlanCode,
          paid_at: startDate.toISOString(),
          gateway_response: gatewayMessage || 'Successful',
          metadata: { verifiedAt: new Date().toISOString(), recovered: !localTx }
        }, { onConflict: 'reference' });

        if (txUpsertErr) {
          console.error('[Subscription Verify] payment_transactions upsert warning:', txUpsertErr.message);
        }

        // 2. Upsert record into subscriptions table
        const { error: subUpsertErr } = await client.from('subscriptions').upsert({
          user_id: uid,
          plan_tier: planTier,
          billing_cycle: 'monthly',
          status: 'active',
          payment_provider: 'paystack',
          payment_reference: resolvedRef,
          payment_status: 'paid',
          amount_paid: amountPaid,
          currency: 'NGN',
          current_period_start: startDate.toISOString(),
          current_period_end: endDate.toISOString(),
          paystack_subscription_code: paystackSubCode,
          paystack_customer_code: paystackCustCode,
          paystack_plan_code: paystackPlanCode,
          paystack_authorization_code: paystackAuthCode,
          metadata: { gatewayMessage, verifiedAt: new Date().toISOString() }
        }, { onConflict: 'payment_reference' });

        if (subUpsertErr) {
          console.warn('[Subscription Verify] subscriptions upsert warning (falling back to core columns):', subUpsertErr.message);
          await client.from('subscriptions').upsert({
            user_id: uid,
            plan_tier: planTier,
            billing_cycle: 'monthly',
            status: 'active',
            payment_provider: 'paystack',
            payment_reference: resolvedRef,
            payment_status: 'paid',
            amount_paid: amountPaid,
            currency: 'NGN',
            current_period_start: startDate.toISOString(),
            current_period_end: endDate.toISOString()
          }, { onConflict: 'payment_reference' });
        }

        // 3. Update user profile to paid tier with Pro enabled
        await activatePaidProfile(
          client,
          uid,
          planTier,
          true,
          'active',
          'paid',
          endDate.toISOString(),
          paystackCustCode
        );
      }

      return res.json({
        success: true,
        reference: resolvedRef,
        tier: planTier,
        isPro: true,
        subscriptionStatus: 'active',
        currentPeriodEnd: endDate.toISOString(),
        message: `Payment verified! Your account is now active on ${planTier === 'studio' ? 'KorsIQ Premium' : 'KorsIQ Plus'}.`
      });
    } catch (err: any) {
      console.error('Verify subscription error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Payment verification failed' });
    }
  });

  // Get current verified subscription details
  app.get('/api/subscription/status', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const uid = req.user!.uid;
      const client = supabaseAdmin || supabaseAuthClient;

      if (!client) {
        return res.json({ success: true, tier: 'free', isPro: false, subscriptionStatus: 'inactive' });
      }

      const [profileRes, subRes] = await Promise.all([
        client.from('profiles').select('tier, is_pro, subscription_tier, subscription_status, subscription_end, paystack_customer_code').eq('id', uid).maybeSingle(),
        client.from('subscriptions').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(1)
      ]);

      const profile = profileRes.data;
      const latestSub = subRes.data?.[0];

      let isPro = profile?.is_pro ?? false;
      let subscriptionStatus = profile?.subscription_status || (isPro ? 'active' : 'inactive');

      // Check if period has ended
      if (profile?.subscription_end) {
        const expiry = new Date(profile.subscription_end).getTime();
        if (!isNaN(expiry) && Date.now() > expiry) {
          isPro = false;
          subscriptionStatus = 'expired';
        }
      }

      return res.json({
        success: true,
        tier: profile?.subscription_tier || profile?.tier || 'free',
        isPro,
        subscriptionStatus,
        subscriptionEnd: profile?.subscription_end || latestSub?.current_period_end || null,
        latestSubscription: latestSub || null
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'Failed to fetch subscription status' });
    }
  });

  // Paystack Webhook Handler (Supports both canonical /api/subscription/webhook and /api/paystack/webhook)
  app.post(['/api/subscription/webhook', '/api/paystack/webhook'], async (req: AuthenticatedRequest, res) => {
    const paystackKey = getPaystackSecretKey();
    if (!paystackKey) {
      return res.status(400).json({ error: 'Paystack secret is not configured' });
    }

    try {
      const signature = req.headers['x-paystack-signature'] as string;
      const rawBody = req.rawBody;

      if (!signature || !rawBody) {
        return res.status(401).json({ error: 'Missing webhook signature or raw payload' });
      }

      const expectedSig = crypto.createHmac('sha512', paystackKey).update(rawBody).digest('hex');
      if (!safeCompareStrings(signature, expectedSig)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const event = JSON.parse(rawBody.toString('utf8'));
      const client = supabaseAdmin || supabaseAuthClient;

      // Deduplicate webhook events
      const eventId = event.id ? String(event.id) : `${event.event}_${event.data?.reference || event.data?.id || Date.now()}`;
      if (client) {
        const { data: existingEvent } = await client
          .from('webhook_events')
          .select('id, status')
          .eq('event_id', eventId)
          .maybeSingle();

        if (existingEvent && existingEvent.status === 'processed') {
          return res.status(200).json({ received: true, message: 'Event already processed' });
        }

        if (!existingEvent) {
          await client.from('webhook_events').insert({
            event_id: eventId,
            event_type: event.event,
            reference: event.data?.reference || null,
            payload: event,
            status: 'received'
          });
        } else {
          // Existing event had status 'failed' or 'received' — mark as 'received' for retry
          await client.from('webhook_events').update({
            status: 'received',
            error_message: null
          }).eq('event_id', eventId);
        }
      }

      // 1. Initial Charge or Renewal Success
      if (event.event === 'charge.success' && event.data) {
        const tx = event.data;
        const ref = tx.reference;
        const uid = tx.metadata?.userId;
        const planTier: 'plus' | 'studio' = tx.metadata?.planTier === 'studio' || tx.amount >= PAYSTACK_PLANS.studio.amountKobo ? 'studio' : 'plus';
        const planConfig = planTier === 'studio' ? PAYSTACK_PLANS.studio : PAYSTACK_PLANS.plus;

        // Verify currency and minimum expected amount before granting access
        const isCurrencyValid = !tx.currency || tx.currency === 'NGN';
        const isAmountValid = typeof tx.amount === 'number' && tx.amount >= planConfig.amountKobo;

        if (!isCurrencyValid || !isAmountValid) {
          console.error('[Webhook charge.success] Rejected underpaid or non-NGN charge:', {
            reference: ref,
            currency: tx.currency,
            amountKobo: tx.amount,
            expectedKobo: planConfig.amountKobo
          });
        } else if (client && (uid || tx.customer?.email)) {
          let resolvedUid = uid;
          if (!resolvedUid && tx.customer?.email) {
            const { data: userProfile } = await client.from('profiles').select('id').ilike('email', tx.customer.email.toLowerCase().trim()).maybeSingle();
            resolvedUid = userProfile?.id;
          }

          if (resolvedUid && ref) {
            const startDate = tx.paid_at ? new Date(tx.paid_at) : new Date();
            const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

            // Record transaction in ledger
            await client.from('payment_transactions').upsert({
              user_id: resolvedUid,
              reference: ref,
              paystack_reference: ref,
              plan_tier: planTier,
              amount_kobo: tx.amount,
              amount_naira: tx.amount / 100,
              currency: tx.currency || 'NGN',
              status: 'success',
              customer_email: tx.customer?.email || 'student@korsiq.app',
              paystack_plan_code: (typeof tx.plan === 'string' ? tx.plan : tx.plan?.plan_code) || planConfig.planCode,
              paid_at: startDate.toISOString(),
              gateway_response: tx.gateway_response || 'charge.success',
              metadata: { event: event.event, receivedAt: new Date().toISOString() }
            }, { onConflict: 'reference' });

            // Upsert subscription
            await client.from('subscriptions').upsert({
              user_id: resolvedUid,
              plan_tier: planTier,
              billing_cycle: 'monthly',
              status: 'active',
              payment_provider: 'paystack',
              payment_reference: ref,
              payment_status: 'paid',
              amount_paid: tx.amount / 100,
              currency: tx.currency || 'NGN',
              current_period_start: startDate.toISOString(),
              current_period_end: endDate.toISOString(),
              paystack_subscription_code: tx.subscription_code || tx.customer?.subscription_code || null,
              paystack_customer_code: tx.customer?.customer_code || null,
              paystack_plan_code: (typeof tx.plan === 'string' ? tx.plan : tx.plan?.plan_code) || planConfig.planCode,
              paystack_authorization_code: tx.authorization?.authorization_code || null,
              metadata: { event: event.event, receivedAt: new Date().toISOString() }
            }, { onConflict: 'payment_reference' });

            // Update user profile resiliently
            await activatePaidProfile(
              client,
              resolvedUid,
              planTier,
              true,
              'active',
              'paid',
              endDate.toISOString(),
              tx.customer?.customer_code || null
            );
          }
        }
      }

      // 2. Subscription Created
      else if (event.event === 'subscription.create' && event.data) {
        const sub = event.data;
        const subCode = sub.subscription_code;
        const custCode = sub.customer?.customer_code;
        const planCode = sub.plan?.plan_code;

        if (client && (subCode || custCode)) {
          if (custCode) {
            await client.from('subscriptions').update({
              paystack_subscription_code: subCode,
              paystack_plan_code: planCode
            }).eq('paystack_customer_code', custCode);
          }
        }
      }

      // 3. Invoice Create: Never activate subscription on invoice creation
      else if (event.event === 'invoice.create') {
        // Explicitly ignore activation on invoice.create per Rule 1
      }

      // 4. Invoice Payment Failed (Failed Renewal)
      else if (event.event === 'invoice.payment_failed' && event.data) {
        const inv = event.data;
        const subCode = inv.subscription?.subscription_code;
        const custCode = inv.customer?.customer_code;

        if (client && (subCode || custCode)) {
          const query = subCode 
            ? client.from('subscriptions').update({ status: 'past_due', payment_status: 'failed' }).eq('paystack_subscription_code', subCode)
            : client.from('subscriptions').update({ status: 'past_due', payment_status: 'failed' }).eq('paystack_customer_code', custCode);
          await query;
        }
      }

      // 5. Subscription Disabled / Non-Renewal (Cancelled)
      else if ((event.event === 'subscription.disable' || event.event === 'subscription.not_renew') && event.data) {
        const sub = event.data;
        const subCode = sub.subscription_code;
        const custCode = sub.customer?.customer_code;

        if (client && (subCode || custCode)) {
          const nowIso = new Date().toISOString();
          const subQuery = subCode
            ? client.from('subscriptions').update({ status: 'cancelled', cancelled_at: nowIso }).eq('paystack_subscription_code', subCode)
            : client.from('subscriptions').update({ status: 'cancelled', cancelled_at: nowIso }).eq('paystack_customer_code', custCode);
          await subQuery;

          // Preserve access until paid period ends where applicable
          if (custCode) {
            await client.from('profiles').update({
              subscription_status: 'cancelled'
            }).eq('paystack_customer_code', custCode);
          }
        }
      }

      // 6. Charge Refunded or Reversed
      else if ((event.event === 'refund.processed' || event.event === 'charge.reversed') && event.data) {
        const tx = event.data;
        const ref = tx.reference || tx.transaction_reference;
        const subCode = tx.subscription_code;
        const custCode = tx.customer?.customer_code;

        if (client) {
          if (ref) {
            await client.from('payment_transactions').update({
              status: 'refunded',
              gateway_response: event.event
            }).eq('reference', ref);

            const { data: sub } = await client.from('subscriptions').select('user_id').eq('payment_reference', ref).maybeSingle();
            const targetUid = sub?.user_id;

            await client.from('subscriptions').update({
              status: 'cancelled',
              payment_status: 'refunded'
            }).eq('payment_reference', ref);

            if (targetUid) {
              await client.from('profiles').update({
                tier: 'free',
                is_pro: false,
                subscription_tier: 'free',
                subscription_status: 'cancelled',
                payment_status: 'none'
              }).eq('id', targetUid);
            }
          } else if (subCode || custCode) {
            const query = subCode 
              ? client.from('subscriptions').update({ status: 'cancelled', payment_status: 'refunded' }).eq('paystack_subscription_code', subCode)
              : client.from('subscriptions').update({ status: 'cancelled', payment_status: 'refunded' }).eq('paystack_customer_code', custCode);
            await query;

            if (custCode) {
              await client.from('profiles').update({
                tier: 'free',
                is_pro: false,
                subscription_tier: 'free',
                subscription_status: 'cancelled',
                payment_status: 'none'
              }).eq('paystack_customer_code', custCode);
            }
          }
        }
      }

      // Mark webhook event as processed successfully
      if (client) {
        await client.from('webhook_events').update({
          status: 'processed',
          processed_at: new Date().toISOString()
        }).eq('event_id', eventId);
      }

      return res.status(200).json({ received: true });
    } catch (err: any) {
      console.error('Webhook error:', err);
      // Record failure on webhook event if client exists
      const client = supabaseAdmin || supabaseAuthClient;
      if (client && req.body?.id) {
        await client.from('webhook_events').update({
          status: 'failed',
          error_message: err.message
        }).eq('event_id', String(req.body.id));
      }
      return res.status(500).json({ error: 'Webhook processing error' });
    }
  });

  // Standard S3 Upload Proxy Route
  app.post('/api/s3/upload', requireAuth, apiRateLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const uid = req.user?.uid;
      const { fileName, fileType, contentBase64, courseId, groupId, bucket: reqBucket } = req.body;
      if (!fileName || !contentBase64) {
        return res.status(400).json({ error: 'fileName and contentBase64 parameters are required' });
      }

      const buffer = Buffer.from(contentBase64, 'base64');
      const safeCourseId = typeof courseId === 'string' ? courseId.replace(/[^a-zA-Z0-9_-]/g, '') : '';
      const safeGroupId = typeof groupId === 'string' ? groupId.replace(/[^a-zA-Z0-9_-]/g, '') : '';
      const cleanName = path.basename(String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_'));
      const randomId = Math.random().toString(36).substring(2, 8);
      const fileId = `file_${Date.now()}_${randomId}`;

      let bucket = reqBucket;
      let fileKey = '';

      if (safeGroupId) {
        bucket = bucket || 'group-materials';
        fileKey = `groups/${safeGroupId}/${fileId}_${cleanName}`;
      } else if (safeCourseId && uid) {
        bucket = bucket || 'user-files';
        fileKey = `users/${uid}/courses/${safeCourseId}/${fileId}_${cleanName}`;
      } else if (uid) {
        bucket = bucket || 'user-files';
        fileKey = `users/${uid}/uploads/${fileId}_${cleanName}`;
      } else {
        bucket = bucket || cleanEnvKey('SUPABASE_S3_BUCKET_NAME') || 'scolaris-library';
        fileKey = `uploads/${Date.now()}-${randomId}-${cleanName}`;
      }

      const s3 = getS3();
      const contentType = fileType || 'application/octet-stream';
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: fileKey,
        Body: buffer,
        ContentType: contentType,
      });

      await s3.send(command);

      res.json({
        success: true,
        fileId,
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

  // Direct S3 Upload Presign Route (allows client to upload directly to S3, bypassing Vercel 4.5MB limit)
  app.post('/api/s3/presign-upload', requireAuth, apiRateLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Authentication required' });

      const { fileName, fileType, courseId, groupId, targetBucket } = req.body;
      if (!fileName || typeof fileName !== 'string') {
        return res.status(400).json({ error: 'fileName is required' });
      }

      const safeCourseId = typeof courseId === 'string' ? courseId.replace(/[^a-zA-Z0-9_-]/g, '') : '';
      const safeGroupId = typeof groupId === 'string' ? groupId.replace(/[^a-zA-Z0-9_-]/g, '') : '';
      const cleanName = path.basename(fileName.replace(/[^a-zA-Z0-9._-]/g, '_'));
      const randomId = Math.random().toString(36).substring(2, 8);
      const fileId = `file_${Date.now()}_${randomId}`;

      let bucket = targetBucket;
      let fileKey = '';

      if (safeGroupId) {
        bucket = bucket || 'group-materials';
        fileKey = `groups/${safeGroupId}/${fileId}_${cleanName}`;
      } else if (safeCourseId) {
        bucket = bucket || 'user-files';
        fileKey = `users/${uid}/courses/${safeCourseId}/${fileId}_${cleanName}`;
      } else {
        bucket = bucket || 'user-files';
        fileKey = `users/${uid}/uploads/${fileId}_${cleanName}`;
      }

      const s3 = getS3();
      const contentType = typeof fileType === 'string' && fileType.trim() ? fileType.trim() : 'application/octet-stream';
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: fileKey,
        ContentType: contentType
      });

      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

      res.json({
        success: true,
        fileId,
        key: fileKey,
        bucket,
        uploadUrl,
        publicUrl: `${getSupabasePublicObjectBase()}/${bucket}/${fileKey}`
      });
    } catch (error: any) {
      console.error('S3 Presign Upload Error:', error);
      res.status(500).json({ error: error?.message || 'Failed to generate presigned upload URL' });
    }
  });

  // S3 Presign Download Proxy Route (supports dynamic bucket detection and attachment headers)
  app.post('/api/s3/presign', requireAuth, apiRateLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const { key, bucket: reqBucket, downloadName } = req.body;
      const cleanKey = typeof key === 'string' ? key.trim() : '';
      if (!cleanKey || cleanKey.includes('..') || cleanKey.includes('\\') || cleanKey.startsWith('/')) {
        return res.status(400).json({ error: 'Invalid or unsafe storage path.' });
      }

      const uid = req.user?.uid;
      // Ownership check for user-isolated paths: users/<userId>/...
      if (cleanKey.startsWith('users/') && uid && !cleanKey.startsWith(`users/${uid}/`)) {
        return res.status(403).json({ error: 'Access denied to this storage object.' });
      }

      const bucket = inferBucketFromKey(cleanKey, reqBucket);
      const s3 = getS3();

      const filename = typeof downloadName === 'string' && downloadName.trim()
        ? path.basename(downloadName.trim())
        : cleanKey.split('/').pop() || 'download';

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: cleanKey,
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`
      });

      const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      res.json({ presignedUrl, bucket, key: cleanKey });
    } catch (error: any) {
      console.error('S3 Presign Error:', error);
      res.status(500).json({ error: error?.message || 'Failed to generate presigned download URL' });
    }
  });

  // S3 Secure Delete Route
  app.post('/api/s3/delete', requireAuth, apiRateLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const uid = req.user?.uid;
      const { key, bucket: reqBucket } = req.body;
      const cleanKey = typeof key === 'string' ? key.trim() : '';
      if (!cleanKey || cleanKey.includes('..') || cleanKey.includes('\\') || cleanKey.startsWith('/')) {
        return res.status(400).json({ error: 'Invalid or unsafe storage path.' });
      }

      // Ownership guard
      if (cleanKey.startsWith('users/') && uid && !cleanKey.startsWith(`users/${uid}/`)) {
        return res.status(403).json({ error: 'Access denied: cannot delete another user file.' });
      }

      const bucket = inferBucketFromKey(cleanKey, reqBucket);
      const s3 = getS3();
      await s3.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: cleanKey
      }));

      res.json({ success: true, key: cleanKey, bucket });
    } catch (error: any) {
      console.error('S3 Delete Error:', error);
      res.status(500).json({ error: error?.message || 'Failed to delete object from storage' });
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
    // Split both by newline and before course code boundaries so PDF tables flattened onto one line are parsed per course
    const segments = (text || '')
      .split(/\r?\n|(?=\b[A-Z]{2,4}\s*\d{3}\b)/)
      .map(s => s.trim())
      .filter(Boolean);

    const structuredRegex = /^([A-Z]{2,4})\s*(\d{3})\b\s*[:\-\|]?\s*(.*?)(?:\s+(\d)\s*(?:units?|cr|credits?)?)?(?:\s+(?:grade|score)?\s*[:\-]?\s*|\s+)([A-F][\+\-]?)(?:\s+\d{1,3}%?|\s*)$/i;

    for (const seg of segments) {
      const match = seg.match(structuredRegex);
      if (match) {
        const code = (match[1] + match[2]).toUpperCase();
        const rawTitle = (match[3] || '')
          .replace(/\b(?:grade|units?|credits?|cr)\b\s*[:\-]?/gi, '')
          .trim()
          .replace(/^[:\-\|,\s]+|[:\-\|,\s]+$/g, '');
        const units = match[4] ? parseInt(match[4], 10) : 3;
        const rawGrade = (match[5] || '').trim().toUpperCase();
        if (/^[A-F][\+\-]?$/.test(rawGrade) && !courses.some(c => c.code === code)) {
          courses.push({
            code,
            title: rawTitle || `Course ${code}`,
            creditUnits: !isNaN(units) && units >= 1 && units <= 12 ? units : 3,
            grade: rawGrade
          });
        }
      } else {
        const codeMatch = seg.match(/^([A-Z]{2,4}\s*\d{3})\b/i);
        // Require explicit uppercase grade token at the end or after "Grade:" so English article "a" is never mistaken for a grade
        const gradeMatch = seg.match(/(?:grade\s*[:\-]?\s*|\b\d\s*(?:units?|cr|credits?)?\s+|\s+)([A-F][\+\-]?)\s*$/);
        const unitMatch = seg.match(/\b([1-6])\s*(?:units?|cr|credits?)\b/i);
        if (codeMatch && gradeMatch) {
          const code = codeMatch[1].replace(/\s+/g, '').toUpperCase();
          const units = unitMatch ? parseInt(unitMatch[1], 10) : 3;
          if (!courses.some(c => c.code === code)) {
            courses.push({
              code,
              title: `Course ${code}`,
              creditUnits: units,
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

  async function generateGeminiPodcastScript(studyMaterial: string, studentContext: string = ''): Promise<string> {
    const systemInstruction = `${studentContext ? `${studentContext}\n\n` : ''}You are an expert producer for KorsIQ Academic Podcasts.
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

  // =============================================================
  // AI CREDITS LEDGER, ATOMIC SPEND/REFUND & BALANCE ENDPOINT
  // =============================================================
  // Rule: Chatbot, Academic Adviser, Study Planner, and Timetable are NOT metered.
  // Credits apply ONLY to Study Hub generation tools and Academic Studio tools.

  async function getAiCreditBalanceForUser(userId: string | undefined) {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)).toISOString();
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0)).toISOString();

    if (!supabaseAdmin || !userId) {
      return {
        balance: AI_CREDIT_ALLOWANCES.free,
        used: 0,
        allowance: AI_CREDIT_ALLOWANCES.free,
        tier: 'free' as const,
        periodStart,
        periodEnd,
        costs: AI_CREDIT_COSTS
      };
    }

    // 1. Try the atomic Postgres RPC first
    try {
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('get_ai_credit_balance', {
        p_user_id: userId
      });
      if (!rpcErr && rpcData && typeof rpcData === 'object') {
        return {
          balance: Number(rpcData.balance ?? AI_CREDIT_ALLOWANCES.free),
          used: Number(rpcData.used ?? 0),
          allowance: Number(rpcData.allowance ?? AI_CREDIT_ALLOWANCES.free),
          tier: getNormalizedCreditTier(rpcData.tier),
          periodStart: rpcData.period_start || periodStart,
          periodEnd: rpcData.period_end || periodEnd,
          costs: AI_CREDIT_COSTS
        };
      }
    } catch {}

    // 2. Fallback if the RPC migration has not been applied yet on the live DB
    try {
      const profileRes = await supabaseAdmin
        .from('profiles')
        .select('tier, subscription_tier')
        .eq('id', userId)
        .maybeSingle();

      const rawTier =
        profileRes.data?.subscription_tier ||
        profileRes.data?.tier ||
        'free';
      const normalizedTier = getNormalizedCreditTier(rawTier);
      const allowance = getMonthlyCreditAllowance(normalizedTier);

      // Try reading ai_credit_ledger first; fall back to ai_usage if ai_credit_ledger is not yet created
      const ledgerRes = await supabaseAdmin
        .from('ai_credit_ledger')
        .select('delta')
        .eq('user_id', userId)
        .gte('created_at', periodStart);

      if (!ledgerRes.error && Array.isArray(ledgerRes.data)) {
        const netDelta = ledgerRes.data.reduce((sum: number, r: any) => sum + (Number(r.delta) || 0), 0);
        const balance = Math.max(0, allowance + netDelta);
        const used = Math.max(0, -netDelta);
        return {
          balance,
          used,
          allowance,
          tier: normalizedTier,
          periodStart,
          periodEnd,
          costs: AI_CREDIT_COSTS
        };
      }

      const usageRes = await supabaseAdmin
        .from('ai_usage')
        .select('credits')
        .eq('user_id', userId)
        .gte('created_at', periodStart);

      const used = Array.isArray(usageRes.data)
        ? usageRes.data.reduce((sum: number, r: any) => sum + (Number(r.credits) || 1), 0)
        : 0;
      const balance = Math.max(0, allowance - used);

      return {
        balance,
        used,
        allowance,
        tier: normalizedTier,
        periodStart,
        periodEnd,
        costs: AI_CREDIT_COSTS
      };
    } catch (err: any) {
      console.warn('[AI Credits] Balance lookup fallback warning:', err?.message || err);
      return {
        balance: AI_CREDIT_ALLOWANCES.free,
        used: 0,
        allowance: AI_CREDIT_ALLOWANCES.free,
        tier: 'free' as const,
        periodStart,
        periodEnd,
        costs: AI_CREDIT_COSTS
      };
    }
  }

  async function consumeAiCredits(
    userId: string | undefined,
    feature: string,
    cost: number,
    requestId?: string
  ): Promise<{
    success: boolean;
    balance: number;
    used: number;
    allowance: number;
    required: number;
    periodEnd: string;
    requestId: string;
  }> {
    const reqId = (requestId && requestId.trim()) || `${feature}_${userId || 'anon'}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const current = await getAiCreditBalanceForUser(userId);

    if (!supabaseAdmin || !userId || cost <= 0) {
      return {
        success: true,
        balance: current.balance,
        used: current.used,
        allowance: current.allowance,
        required: cost,
        periodEnd: current.periodEnd,
        requestId: reqId
      };
    }

    // 1. Try the atomic Postgres RPC first
    try {
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('consume_ai_credits', {
        p_user_id: userId,
        p_cost: cost,
        p_feature: feature,
        p_request_id: reqId
      });

      if (!rpcErr && rpcData && typeof rpcData === 'object') {
        return {
          success: Boolean(rpcData.success),
          balance: Number(rpcData.balance ?? 0),
          used: Number(rpcData.used ?? 0),
          allowance: Number(rpcData.allowance ?? current.allowance),
          required: cost,
          periodEnd: rpcData.period_end || current.periodEnd,
          requestId: reqId
        };
      }
    } catch {}

    // 2. Fallback if RPC migration is not yet applied on the live DB
    if (current.balance < cost) {
      return {
        success: false,
        balance: current.balance,
        used: current.used,
        allowance: current.allowance,
        required: cost,
        periodEnd: current.periodEnd,
        requestId: reqId
      };
    }

    try {
      const { error: ledgerErr } = await supabaseAdmin.from('ai_credit_ledger').insert({
        user_id: userId,
        delta: -cost,
        entry_type: 'spend',
        feature,
        request_id: reqId,
        period_start: current.periodStart
      });

      if (ledgerErr) {
        // Fallback to ai_usage if ai_credit_ledger table is not yet migrated
        await supabaseAdmin.from('ai_usage').insert({
          user_id: userId,
          credits: cost,
          feature: `${feature}:${reqId}`
        });
      }
    } catch (err: any) {
      console.warn('[AI Credits] Fallback spend insert warning:', err?.message || err);
    }

    return {
      success: true,
      balance: Math.max(0, current.balance - cost),
      used: current.used + cost,
      allowance: current.allowance,
      required: cost,
      periodEnd: current.periodEnd,
      requestId: reqId
    };
  }

  async function refundAiCredits(
    userId: string | undefined,
    feature: string,
    cost: number,
    requestId: string
  ): Promise<void> {
    if (!supabaseAdmin || !userId || !requestId || cost <= 0) return;

    try {
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('refund_ai_credits', {
        p_user_id: userId,
        p_request_id: requestId
      });
      if (!rpcErr && rpcData?.success) return;
    } catch {}

    try {
      const now = new Date();
      const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)).toISOString();
      const { error: ledgerErr } = await supabaseAdmin.from('ai_credit_ledger').insert({
        user_id: userId,
        delta: cost,
        entry_type: 'refund',
        feature,
        request_id: `${requestId}:refund`,
        period_start: periodStart,
        metadata: { refunded_request_id: requestId }
      });

      if (ledgerErr) {
        await supabaseAdmin
          .from('ai_usage')
          .delete()
          .eq('user_id', userId)
          .eq('feature', `${feature}:${requestId}`);
      }
    } catch (err: any) {
      console.warn('[AI Credits] Refund fallback warning:', err?.message || err);
    }
  }

  app.get(['/api/usage/ai-credits', '/api/credits/balance'], requireAuth, async (req, res) => {
    const userId = (req as any).user?.id || (req as any).user?.uid;
    const summary = await getAiCreditBalanceForUser(userId);
    return res.json(summary);
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
      const studentContext = await getStudentContextForUser((req as any).user?.id || (req as any).user?.uid);
      const aiContent = await runAICall({
        systemInstruction: `${studentContext}

Create a weekly study schedule (Monday-Sunday) for a student at ${university}. 
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

  // Parse Course Outline / Syllabus into Structured Topics & Assessments (Metered: 3 credits)
  app.post('/api/ai/outline/parse', requireAuth, apiRateLimiter, async (req: AuthenticatedRequest, res) => {
    const uid = req.user!.uid;
    const { text, fileBase64, fileName, fileType, requestId, courseCode, units } = req.body;
    const reqId = typeof requestId === 'string' && requestId.trim()
      ? requestId.trim()
      : `outline_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    let rawText = typeof text === 'string' ? text.trim() : '';

    // If file is provided, extract its text using our multi-model / OCR pipeline
    if (!rawText && fileBase64 && fileName) {
      try {
        const buffer = Buffer.from(fileBase64, 'base64');
        const extRes = await extractDocumentWithOcrFallback(buffer, fileName, fileType || '');
        if (extRes.success && extRes.extractedText) {
          rawText = extRes.extractedText;
        } else {
          return res.status(400).json({
            success: false,
            error: extRes.error || "We couldn't extract text from this document. Please upload a clear PDF, DOCX, or photo."
          });
        }
      } catch (err: any) {
        return res.status(400).json({
          success: false,
          error: `Error processing file: ${err?.message || 'Unsupported or corrupted document'}`
        });
      }
    }

    if (!rawText || rawText.length < 15) {
      return res.status(400).json({
        success: false,
        error: 'Please provide course outline text or upload a syllabus document (PDF, Word, or photo).'
      });
    }

    // 1. Deduct 3 AI credits atomically with idempotent requestId
    const creditCharge = await consumeAiCredits(uid, 'outline_analysis', 3, reqId);
    if (!creditCharge.success) {
      return res.status(402).json({
        success: false,
        code: 'INSUFFICIENT_CREDITS',
        error: `You need 3 AI credits to analyze a syllabus. You have ${creditCharge.balance} remaining.`,
        balance: creditCharge.balance,
        required: 3
      });
    }

    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        throw new Error('AI analysis service is currently unavailable.');
      }

      const systemInstruction = `You are KorsIQ Academic Syllabus & Course Outline Analyst.
Analyze the provided university course outline / syllabus and extract structured topics, schedule, and grading scheme.

CRITICAL RULES:
1. NEVER INVENT OR FABRICATE DATA. If a field is not stated or unclear in the text, mark "isFlagged": true and provide "flagReason" (e.g. "Missing in syllabus - please verify").
2. Extract the course code, course title, and credit units. If credit units are not explicitly stated, set "units": 3, "isUnitsFlagged": true, "flagReason": "Credit units not found in outline".
3. Extract all weekly topics. Each topic must have:
   - "weekNumber": integer (1 to 15).
   - "title": concise topic title.
   - "description": summary of topic content.
   - "learningObjectives": array of strings (learning goals).
   - "isFlagged": boolean (true if week number or title was ambiguous).
   - "flagReason": string or null.
4. Extract grading components and assessments:
   - "assessments": array of { "title": string, "type": "test"|"quiz"|"assignment"|"midterm"|"exam"|"practical"|"project", "weightPercent": number, "dueDate": string (YYYY-MM-DD) or null, "isFlagged": boolean, "flagReason": string or null }.
   - If total CA + exam percentage does not sum to 100%, flag it. Default to 30% CA and 70% exam if unspecified, but mark as flagged!

Return valid JSON with:
{
  "courseCode": string,
  "courseTitle": string,
  "units": number,
  "isUnitsFlagged": boolean,
  "topics": [
    {
      "weekNumber": number,
      "title": string,
      "description": string,
      "learningObjectives": string[],
      "isFlagged": boolean,
      "flagReason": string | null
    }
  ],
  "assessments": [
    {
      "title": string,
      "type": "test",
      "weightPercent": number,
      "dueDate": string | null,
      "isFlagged": boolean,
      "flagReason": string | null
    }
  ],
  "caWeightPercent": number,
  "examWeightPercent": number,
  "isGradingFlagged": boolean,
  "flagReason": string | null
}`;

      const aiContent = await runAICall({
        systemInstruction,
        messages: [{ role: 'user', content: `Analyze this course syllabus:\n\n${rawText.slice(0, 30000)}` }],
        jsonMode: true
      });

      const parsed = JSON.parse(aiContent || '{}');

      // Fallback topic if outline had sparse text
      if (!parsed.topics || !Array.isArray(parsed.topics) || parsed.topics.length === 0) {
        parsed.topics = [
          {
            weekNumber: 1,
            title: parsed.courseTitle || 'Course Overview & Fundamentals',
            description: 'Introduction to course concepts',
            learningObjectives: ['Understand core principles'],
            isFlagged: true,
            flagReason: 'Extracted with low confidence from unstructured text'
          }
        ];
      }

      res.json({
        success: true,
        parsed: {
          courseCode: parsed.courseCode || courseCode || 'COURSE',
          courseTitle: parsed.courseTitle || 'Course Syllabus',
          units: typeof parsed.units === 'number' && parsed.units > 0 ? parsed.units : (units || 3),
          isUnitsFlagged: Boolean(parsed.isUnitsFlagged),
          topics: parsed.topics,
          assessments: parsed.assessments || [],
          caWeightPercent: parsed.caWeightPercent || 30,
          examWeightPercent: parsed.examWeightPercent || 70,
          isGradingFlagged: Boolean(parsed.isGradingFlagged),
          flagReason: parsed.flagReason || null,
          extractedTextLength: rawText.length
        },
        creditsRemaining: creditCharge.balance
      });
    } catch (aiErr: any) {
      console.error('[AI Outline Parse] Error:', aiErr?.message || aiErr);
      // REFUND CREDITS ON FAILURE
      await refundAiCredits(uid, 'outline_analysis', 3, reqId);
      return res.status(500).json({
        success: false,
        error: `Could not parse syllabus: ${aiErr?.message || 'AI processing error'}. Deducted credits have been refunded.`
      });
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

      const studentContext = await getStudentContextForUser((req as any).user?.id || (req as any).user?.uid);

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
        systemInstruction: `${studentContext}

You are KorsIQ Academic Reasoning Advisor.
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

      const studentContext = await getStudentContextForUser((req as any).user?.id || (req as any).user?.uid);

      const aiContent = await runAICall({
        systemInstruction: `${studentContext}

You are KorsIQ Personalized Timetable and Revision Architect.
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

      const studentContext = await getStudentContextForUser((req as any).user?.id || (req as any).user?.uid);

      const systemInstruction = `${studentContext}

You are KorsIQ Academic Adviser, a brilliant, compassionate, and mathematically precise academic mentor.
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
4. Keep explanations concise, structured with bullet points, and actionable.
5. ALWAYS use Markdown signs: bold signs **like this** for key concepts and target numbers, and dollar signs $...$ for all mathematical calculations, equations, and CGPA arithmetic.`;

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
  // KORSIQ ACADEMIC STUDIO: Outline Planning Engine (2 credits)
  // =============================================================
  app.post('/api/ai/studio/plan', requireAuth, requirePaidTier(['plus', 'studio', 'scholar', 'sage']), apiRateLimiter, async (req, res) => {
    const { title, docType, subject, instructions, targetWordCount, citationStyle, references, requestId } = req.body;
    const wordGoal = Number(targetWordCount) || 1500;
    const style = citationStyle || 'APA';
    const type = docType || 'assignment';
    const userId = (req as any).user?.id || (req as any).user?.uid;
    const cost = AI_CREDIT_COSTS.studio_plan;

    const spend = await consumeAiCredits(userId, 'studio_plan', cost, requestId);
    if (!spend.success) {
      return res.status(402).json({
        error: 'Not enough credits',
        code: 'INSUFFICIENT_CREDITS',
        balance: spend.balance,
        required: cost,
        allowance: spend.allowance,
        resetDate: spend.periodEnd
      });
    }

    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        await refundAiCredits(userId, 'studio_plan', cost, spend.requestId);
        return res.status(503).json({ error: 'AI service is not configured on the server.' });
      }

      const refSummary = (references || [])
        .map((r: any, idx: number) => `[Source ${idx + 1}] "${r.title}" by ${r.authors || 'Unknown'} (${r.year || 'n.d.'}): ${r.contentSnippet ? r.contentSnippet.slice(0, 300) : ''}`)
        .join('\n');

      const studentContext = await getStudentContextForUser(userId);

      const systemInstruction = `${studentContext}

You are KorsIQ Academic Studio Planning Engine, an expert academic advisor, curriculum specialist, and research director.
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
      return res.json({ ...parsed, creditsRemaining: spend.balance });
    } catch (error: any) {
      console.error('Academic studio plan AI failed, refunding credits:', error?.message || error);
      await refundAiCredits(userId, 'studio_plan', cost, spend.requestId);
      return res.status(500).json({ error: error?.message || 'Failed to generate outline. Your credits have been refunded.' });
    }
  });

  // =============================================================
  // KORSIQ ACADEMIC STUDIO: Section Generation Engine (3 credits / 10 full doc / 1 rewrite)
  // =============================================================
  app.post('/api/ai/studio/generate-section', requireAuth, requirePaidTier(['plus', 'studio', 'scholar', 'sage']), apiRateLimiter, async (req, res) => {
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
      mode,
      isFullDocumentFirstSection,
      isFullDocumentContinuation,
      requestId
    } = req.body;

    const wordCount = Number(targetWords) || 400;
    const style = citationStyle || 'APA';
    const userId = (req as any).user?.id || (req as any).user?.uid;

    // Determine exact credit cost:
    // - Full document batch: 10 credits charged once on the first section, 0 on continuation sections
    // - Rewrite / citation check mode on existing content: 1 credit
    // - Standard section write: 3 credits
    const isRewriteMode = Boolean(mode && ['expand', 'simplify', 'academic_tone', 'grammar', 'citations'].includes(mode));
    const cost = isFullDocumentContinuation
      ? 0
      : isFullDocumentFirstSection
      ? AI_CREDIT_COSTS.studio_full_doc
      : isRewriteMode
      ? AI_CREDIT_COSTS.studio_assist
      : AI_CREDIT_COSTS.studio_section;
    const featureKey = isFullDocumentFirstSection
      ? 'studio_full_doc'
      : isRewriteMode
      ? 'studio_assist'
      : 'studio_section';

    const spend = await consumeAiCredits(userId, featureKey, cost, requestId);
    if (!spend.success) {
      return res.status(402).json({
        error: 'Not enough credits',
        code: 'INSUFFICIENT_CREDITS',
        balance: spend.balance,
        required: cost,
        allowance: spend.allowance,
        resetDate: spend.periodEnd
      });
    }

    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        await refundAiCredits(userId, featureKey, cost, spend.requestId);
        return res.status(503).json({ error: 'AI service is not configured on the server.' });
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

      const studentContext = await getStudentContextForUser(userId);

      const systemInstruction = `${studentContext}

You are KorsIQ Academic Writing Engine, a world-class academic scholar and writer.
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
        wordCount: (aiResponse || '').trim().split(/\s+/).filter(Boolean).length,
        creditsRemaining: spend.balance
      });
    } catch (error: any) {
      console.error('Section generation AI failed, refunding credits:', error?.message || error);
      await refundAiCredits(userId, featureKey, cost, spend.requestId);
      return res.status(500).json({ error: error?.message || 'Section generation failed. Your credits have been refunded.' });
    }
  });

  // =============================================================
  // KORSIQ ACADEMIC STUDIO: Comprehensive Document Review Engine (1 credit)
  // =============================================================
  app.post('/api/ai/studio/review', requireAuth, requirePaidTier(['plus', 'studio', 'scholar', 'sage']), apiRateLimiter, async (req, res) => {
    const { docTitle, docType, fullContent, citationStyle, references, requestId } = req.body;
    const style = citationStyle || 'APA';
    const userId = (req as any).user?.id || (req as any).user?.uid;
    const cost = AI_CREDIT_COSTS.studio_review;

    if (!fullContent || fullContent.length < 50) {
      return res.status(400).json({ error: 'Please write at least 50 characters before running Academic Review.' });
    }

    const spend = await consumeAiCredits(userId, 'studio_review', cost, requestId);
    if (!spend.success) {
      return res.status(402).json({
        error: 'Not enough credits',
        code: 'INSUFFICIENT_CREDITS',
        balance: spend.balance,
        required: cost,
        allowance: spend.allowance,
        resetDate: spend.periodEnd
      });
    }

    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        await refundAiCredits(userId, 'studio_review', cost, spend.requestId);
        return res.status(503).json({ error: 'AI service is not configured on the server.' });
      }

      const studentContext = await getStudentContextForUser(userId);

      const systemInstruction = `${studentContext}

You are KorsIQ Academic Reviewer, an exacting academic editor and peer-review referee.
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
      return res.json({ ...parsed, creditsRemaining: spend.balance });
    } catch (error: any) {
      console.error('Academic review AI failed, refunding credits:', error?.message || error);
      await refundAiCredits(userId, 'studio_review', cost, spend.requestId);
      return res.status(500).json({ error: error?.message || 'Document review failed. Your credits have been refunded.' });
    }
  });

  // =============================================================
  // KORSIQ ACADEMIC STUDIO: In-Context Writing Assistant (1 credit)
  // =============================================================
  app.post('/api/ai/studio/assist', requireAuth, requirePaidTier(['plus', 'studio', 'scholar', 'sage']), apiRateLimiter, async (req, res) => {
    const { selectedText, instruction, docTitle, sectionTitle, requestId } = req.body;
    const userId = (req as any).user?.id || (req as any).user?.uid;
    const cost = AI_CREDIT_COSTS.studio_assist;

    if (!selectedText) {
      return res.status(400).json({ error: 'Please select text to transform.' });
    }

    const spend = await consumeAiCredits(userId, 'studio_assist', cost, requestId);
    if (!spend.success) {
      return res.status(402).json({
        error: 'Not enough credits',
        code: 'INSUFFICIENT_CREDITS',
        balance: spend.balance,
        required: cost,
        allowance: spend.allowance,
        resetDate: spend.periodEnd
      });
    }

    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        await refundAiCredits(userId, 'studio_assist', cost, spend.requestId);
        return res.status(503).json({ error: 'AI service is not configured on the server.' });
      }

      const studentContext = await getStudentContextForUser(userId);

      const systemInstruction = `${studentContext}

You are KorsIQ In-Context Academic Assistant.
The student has selected a piece of text from their academic paper ("${docTitle || 'Academic Paper'}", Section: "${sectionTitle || 'General'}") and asked you to transform it according to their instructions.
Maintain formal academic diction, clear syntax, and objective reasoning. Return ONLY the transformed text with no conversational preamble.`;

      const prompt = `INSTRUCTION: ${instruction || 'Improve academic flow and vocabulary.'}\n\nSELECTED TEXT:\n"${selectedText}"`;

      const aiResponse = await runAICall({
        systemInstruction,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      });

      return res.json({ text: (aiResponse || selectedText).trim(), creditsRemaining: spend.balance });
    } catch (err: any) {
      await refundAiCredits(userId, 'studio_assist', cost, spend.requestId);
      return res.status(500).json({ error: err?.message || 'Rewrite failed. Your credits have been refunded.' });
    }
  });

  // KorsIQ Generate (Flashcards: 2 credits, Quiz: 2 credits)
  app.post('/api/scolaris/generate', requireAuth, apiRateLimiter, async (req, res) => {
    const { studyMaterial, mode, requestId } = req.body;

    if (!studyMaterial) {
      return res.status(400).json({ error: "No study material provided." });
    }

    if (mode !== 'quiz' && mode !== 'flashcards') {
      return res.status(400).json({ error: "Invalid mode. Use 'quiz' or 'flashcards'." });
    }

    const userId = (req as any).user?.id || (req as any).user?.uid;
    const cost = mode === 'quiz' ? AI_CREDIT_COSTS.quiz : AI_CREDIT_COSTS.flashcards;

    const spend = await consumeAiCredits(userId, mode, cost, requestId);
    if (!spend.success) {
      return res.status(402).json({
        error: 'Not enough credits',
        code: 'INSUFFICIENT_CREDITS',
        balance: spend.balance,
        required: cost,
        allowance: spend.allowance,
        resetDate: spend.periodEnd
      });
    }

    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        await refundAiCredits(userId, mode, cost, spend.requestId);
        return res.status(503).json({ error: "Our AI service is temporarily unavailable. Please try again shortly." });
      }

      const studentContext = await getStudentContextForUser(userId);

      let systemPrompt = "";
      let userPrompt = "";

      if (mode === "quiz") {
        systemPrompt = `${studentContext}\n\nYou are an elite academic assessment engine. Your job is to output structurally perfect JSON arrays representing multiple-choice quizzes. Do not include any introductory conversational text, explanations, or Markdown formatting outside of the raw JSON code structure itself.`;
        
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
        systemPrompt = `${studentContext}\n\nYou are an elite memorization assistant. Your job is to output structurally perfect JSON arrays representing flashcards for active recall study. Do not include any introductory text or conversational prose outside of the raw JSON structure.`;
        
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

      res.json({ success: true, data: parsedData, creditsRemaining: spend.balance });
    } catch (error: any) {
      console.warn("KorsIQ Generation failed, refunding credits:", error?.message || error);
      await refundAiCredits(userId, mode, cost, spend.requestId);
      res.status(500).json({ error: error?.message || "Generation failed. Your credits have been refunded." });
    }
  });

  // Authenticated profile update endpoint (saves department, major, institution, level, target_cgpa, etc. via service_role)
  const handleProfileSave = async (req: any, res: any) => {
    const userId = req.user?.uid || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Database service is not configured on the server.' });
    }

    try {
      const body = req.body || {};
      const baseFields: Record<string, any> = {};
      if (typeof body.name === 'string') baseFields.name = body.name.trim();
      if (typeof body.email === 'string' && body.email.trim()) baseFields.email = body.email.trim();
      if (typeof body.university === 'string') baseFields.institution = body.university.trim();
      else if (typeof body.institution === 'string') baseFields.institution = body.institution.trim();
      if (typeof body.level === 'string') baseFields.level = body.level.trim();
      if (typeof body.age === 'number' && !isNaN(body.age)) baseFields.age = body.age;
      if (typeof body.semesterEnd === 'string') baseFields.semester_end = body.semesterEnd;
      else if (typeof body.semester_end === 'string') baseFields.semester_end = body.semester_end;
      if (typeof body.targetCGPA === 'number' && !isNaN(body.targetCGPA)) baseFields.target_cgpa = body.targetCGPA;
      else if (typeof body.target_cgpa === 'number' && !isNaN(body.target_cgpa)) baseFields.target_cgpa = body.target_cgpa;
      if (typeof body.avatarIcon === 'string' && body.avatarIcon) baseFields.avatar_icon = body.avatarIcon;
      else if (typeof body.avatar_icon === 'string' && body.avatar_icon) baseFields.avatar_icon = body.avatar_icon;
      if (typeof body.onboarded === 'boolean') baseFields.onboarded = body.onboarded;
      if (typeof body.tutorialSeen === 'boolean') baseFields.tutorial_seen = body.tutorialSeen;
      else if (typeof body.tutorial_seen === 'boolean') baseFields.tutorial_seen = body.tutorial_seen;
      if (body.notifications && typeof body.notifications === 'object') baseFields.notifications = body.notifications;

      const extendedFields: Record<string, any> = {};
      if (typeof body.department === 'string') extendedFields.department = body.department.trim();
      if (typeof body.major === 'string') extendedFields.major = body.major.trim();
      else if (typeof body.department === 'string') extendedFields.major = body.department.trim();
      if (typeof body.academicGoals === 'string') extendedFields.academic_goals = body.academicGoals;
      else if (typeof body.academic_goals === 'string') extendedFields.academic_goals = body.academic_goals;
      if (typeof body.studyStyle === 'string') extendedFields.study_style = body.studyStyle;
      else if (typeof body.study_style === 'string') extendedFields.study_style = body.study_style;
      if (Array.isArray(body.assistanceAreas)) extendedFields.assistance_areas = body.assistanceAreas;
      else if (Array.isArray(body.assistance_areas)) extendedFields.assistance_areas = body.assistance_areas;

      const fullUpdate = { ...baseFields, ...extendedFields };
      if (Object.keys(fullUpdate).length === 0) {
        return res.status(400).json({ error: 'No profile fields provided to update.' });
      }

      let { data: updated, error: updateErr } = await supabaseAdmin
        .from('profiles')
        .update(fullUpdate)
        .eq('id', userId)
        .select('*')
        .maybeSingle();

      let droppedExtendedFields = false;
      if (updateErr && (updateErr.code === 'PGRST204' || updateErr.message?.includes('column') || updateErr.message?.includes('schema cache'))) {
        // Try with just department & major if academic_goals/study_style/assistance_areas are missing
        const deptOnlyUpdate: Record<string, any> = { ...baseFields };
        if (extendedFields.department !== undefined) deptOnlyUpdate.department = extendedFields.department;
        if (extendedFields.major !== undefined) deptOnlyUpdate.major = extendedFields.major;
        const retryDept = await supabaseAdmin
          .from('profiles')
          .update(deptOnlyUpdate)
          .eq('id', userId)
          .select('*')
          .maybeSingle();
        if (!retryDept.error) {
          updated = retryDept.data;
          updateErr = null;
        } else {
          const retryBase = await supabaseAdmin
            .from('profiles')
            .update(baseFields)
            .eq('id', userId)
            .select('*')
            .maybeSingle();
          updated = retryBase.data;
          updateErr = retryBase.error;
          droppedExtendedFields = true;
        }
      }

      // If row did not exist yet, insert it with Free plan defaults
      if (!updateErr && !updated) {
        const insertPayload = {
          id: userId,
          email: req.user?.email || baseFields.email || '',
          tier: 'free',
          is_pro: false,
          ...fullUpdate
        };
        const ins = await supabaseAdmin.from('profiles').insert(insertPayload).select('*').maybeSingle();
        updated = ins.data;
        updateErr = ins.error;
      }

      if (updateErr) {
        console.error('[Profile Save] Failed to save profile for user', userId, updateErr);
        return res.status(500).json({ error: updateErr.message || 'Failed to save profile.', droppedExtendedFields });
      }

      return res.json({ success: true, profile: updated, droppedExtendedFields });
    } catch (err: any) {
      console.error('[Profile Save] Unexpected error:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'Failed to save profile.' });
    }
  };

  app.patch('/api/profile', requireAuth, apiRateLimiter, handleProfileSave);
  app.post('/api/profile', requireAuth, apiRateLimiter, handleProfileSave);

  // Helper: Download a file buffer directly from S3 or Supabase Storage (bypasses Vercel 4.5MB body limit)
  async function downloadStorageBufferForUser(
    userId: string,
    storagePath: string,
    preferredBucket?: string
  ): Promise<{ buffer: Buffer | null; error?: string }> {
    const cleanPath = String(storagePath || '').trim();
    if (!cleanPath || cleanPath.includes('..')) {
      return { buffer: null, error: 'Invalid storage path.' };
    }
    // Ownership guard: personal files live under users/<userId>/...
    if (cleanPath.startsWith('users/') && userId && !cleanPath.startsWith(`users/${userId}/`)) {
      return { buffer: null, error: 'Access denied to this storage object.' };
    }

    const candidateBuckets = Array.from(
      new Set([preferredBucket || inferBucketFromKey(cleanPath), 'user-files', 'group-materials', 'scolaris-library'].filter(Boolean))
    );

    // 1. High-speed S3 direct streaming download
    if (isS3Configured()) {
      for (const bucketName of candidateBuckets) {
        const s3Buf = await downloadBufferViaS3(bucketName, cleanPath);
        if (s3Buf && s3Buf.length > 0) {
          return { buffer: s3Buf };
        }
      }
    }

    // 2. Supabase Admin REST download fallback
    if (supabaseAdmin) {
      let lastErr = 'Could not download file from storage.';
      for (const bucketName of candidateBuckets) {
        try {
          const { data: blob, error } = await supabaseAdmin.storage.from(bucketName).download(cleanPath);
          if (!error && blob) {
            const ab = await blob.arrayBuffer();
            return { buffer: Buffer.from(ab) };
          }
          if (error?.message) lastErr = error.message;
        } catch (err: any) {
          if (err?.message) lastErr = err.message;
        }
      }
      return { buffer: null, error: lastErr };
    }

    return { buffer: null, error: 'Neither S3 nor Supabase storage is configured.' };
  }

  // Unique service for parsing and extracting clean textual material from PDFs, DOCX, PPTX, and text documents
  app.post('/api/files/extract', requireAuth, apiRateLimiter, async (req, res) => {
    const userId = (req as any).user?.id || (req as any).user?.uid;
    const { fileName, fileType, contentBase64, storagePath, bucket, fileId } = req.body;

    const markUserFileStatus = async (status: 'ready' | 'failed') => {
      if (fileId && userId && supabaseAdmin) {
        try {
          await supabaseAdmin
            .from('user_files')
            .update({ status })
            .eq('id', fileId)
            .eq('user_id', userId);
        } catch {}
      }
    };

    try {
      let buffer: Buffer | null = null;

      if (storagePath && typeof storagePath === 'string' && storagePath.trim()) {
        const dl = await downloadStorageBufferForUser(userId, storagePath, bucket);
        if (dl.buffer) {
          buffer = dl.buffer;
        } else if (!contentBase64) {
          console.error('[Extract Error] Failed to download from storage:', storagePath, dl.error);
          await markUserFileStatus('failed');
          return res.status(200).json({
            success: false,
            error: dl.error || 'Uploaded, could not read text from cloud storage. Please retry.',
            fileName
          });
        }
      }

      if (!buffer && contentBase64 && typeof contentBase64 === 'string') {
        buffer = Buffer.from(contentBase64, 'base64');
      }

      if (!buffer) {
        return res.status(400).json({ success: false, error: 'Either storagePath or contentBase64 is required.' });
      }

      if (buffer.length > MAX_UPLOAD_BYTES) {
        await markUserFileStatus('failed');
        return res.status(400).json({
          success: false,
          error: 'File exceeds the 50 MB maximum size limit.',
          fileName
        });
      }

      const result = await extractDocumentWithOcrFallback(buffer, fileName || 'document', fileType || '');

      if (!result.success) {
        console.error('[Extract Error] Extraction/OCR failed for', fileName, ':', result.error);
        await markUserFileStatus('failed');
        return res.status(200).json({
          success: false,
          error: result.error || "Uploaded, could not read text. Please try again or use Retry.",
          isScannedPdf: result.isScannedPdf,
          fileName
        });
      }

      await markUserFileStatus('ready');
      res.json({
        success: true,
        fileName,
        fileTypeDetected: result.fileTypeDetected,
        extractedText: result.extractedText,
        pageCount: result.pageCount,
        usedOcr: result.usedOcr
      });
    } catch (error: any) {
      console.error('[Extract Error] Backend exception for', fileName, ':', error?.message || error);
      await markUserFileStatus('failed');
      res.status(500).json({ success: false, error: error?.message || 'File extraction failed' });
    }
  });

  // SSRF-safe server-side URL content extractor for Study Hub "Upload from a link"
  const isPrivateOrReservedIp = (ip: string): boolean => {
    const clean = ip.toLowerCase().replace(/^::ffff:/, '');
    if (
      clean === 'localhost' ||
      clean === '::1' ||
      clean === '0.0.0.0' ||
      clean.startsWith('127.') ||
      clean.startsWith('10.') ||
      clean.startsWith('192.168.') ||
      clean.startsWith('169.254.') ||
      clean.startsWith('0.') ||
      clean.startsWith('fc') ||
      clean.startsWith('fd') ||
      clean.startsWith('fe80:')
    ) {
      return true;
    }
    const m172 = clean.match(/^172\.(\d+)\./);
    if (m172) {
      const second = parseInt(m172[1], 10);
      if (second >= 16 && second <= 31) return true;
    }
    const m100 = clean.match(/^100\.(\d+)\./);
    if (m100) {
      const second = parseInt(m100[1], 10);
      if (second >= 64 && second <= 127) return true;
    }
    return false;
  };

  app.post('/api/files/extract-url', requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      if (!rawUrl) {
        return res.status(400).json({ success: false, error: 'Please enter a valid http:// or https:// URL.' });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl);
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid URL format. Include http:// or https://.' });
      }

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return res.status(400).json({ success: false, error: 'Only http:// and https:// links are supported.' });
      }

      const hostname = parsedUrl.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        isPrivateOrReservedIp(hostname)
      ) {
        return res.status(400).json({ success: false, error: 'Private or local network URLs are not allowed.' });
      }

      // Resolve DNS to block SSRF via DNS rebinding or private A/AAAA records
      try {
        const dns = await import('dns');
        const records = await dns.promises.lookup(hostname, { all: true });
        if (!records || records.length === 0 || records.some(r => isPrivateOrReservedIp(r.address))) {
          return res.status(400).json({ success: false, error: 'That URL resolves to a restricted network address and cannot be fetched.' });
        }
      } catch {
        return res.status(400).json({ success: false, error: "We couldn't resolve that domain. Check the URL and try again." });
      }

      const MAX_URL_BYTES = 10 * 1024 * 1024; // 10 MB limit
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      let response: Response;
      try {
        response = await fetch(parsedUrl.toString(), {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent': 'KorsIQ-StudyHub/1.0 (+https://korsiq.com)',
            'Accept': 'text/html,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*;q=0.8'
          }
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        return res.status(200).json({
          success: false,
          error: `We couldn't read that link (HTTP ${response.status}). Make sure the page or file is publicly accessible.`
        });
      }

      // Re-verify final redirected URL hostname against SSRF
      if (response.url) {
        try {
          const finalUrl = new URL(response.url);
          if (isPrivateOrReservedIp(finalUrl.hostname) || finalUrl.hostname.toLowerCase() === 'localhost') {
            return res.status(400).json({ success: false, error: 'Redirect to a private network address was blocked.' });
          }
        } catch {}
      }

      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > MAX_URL_BYTES) {
        return res.status(200).json({
          success: false,
          error: 'That file is larger than 10 MB. Download it and upload from your device instead.'
        });
      }

      const arrayBuf = await response.arrayBuffer();
      if (arrayBuf.byteLength > MAX_URL_BYTES) {
        return res.status(200).json({
          success: false,
          error: 'That file is larger than 10 MB. Download it and upload from your device instead.'
        });
      }

      const buffer = Buffer.from(arrayBuf);
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const pathPart = parsedUrl.pathname.split('/').filter(Boolean).pop() || parsedUrl.hostname;
      const derivedName = decodeURIComponent(pathPart).slice(0, 80) || parsedUrl.hostname;

      const isDocBinary =
        contentType.includes('application/pdf') ||
        contentType.includes('officedocument') ||
        /\.(pdf|docx|pptx)$/i.test(parsedUrl.pathname);

      let extractedText = '';
      if (isDocBinary) {
        const result = await extractDocumentWithOcrFallback(buffer, derivedName, contentType);
        if (!result.success || !result.extractedText) {
          return res.status(200).json({
            success: false,
            error: result.error || "We couldn't extract readable text from that document link."
          });
        }
        extractedText = result.extractedText;
      } else {
        const rawHtmlOrText = buffer.toString('utf-8');
        if (contentType.includes('html') || /<html|<body|<article|<p\b/i.test(rawHtmlOrText)) {
          extractedText = rawHtmlOrText
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
            .replace(/<\/(p|div|h[1-6]|li|tr|section|article|br)>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        } else {
          extractedText = rawHtmlOrText.trim();
        }
      }

      const validation = validateExtractedText(extractedText);
      if (!validation.isValid || extractedText.length < 40) {
        return res.status(200).json({
          success: false,
          error: "We couldn't find enough readable text at that link. Try another link or upload the file from your device."
        });
      }

      return res.json({
        success: true,
        fileName: derivedName,
        extractedText: normalizeExtractedText(extractedText)
      });
    } catch (error: any) {
      const isTimeout = error?.name === 'AbortError';
      return res.status(200).json({
        success: false,
        error: isTimeout
          ? 'That link took too long to respond. Please try another link or upload from your device.'
          : "We couldn't read that link. Check the URL and try again."
      });
    }
  });

  // Vision Document Scanner Endpoint: Parses handwritten notes & PDFs into structured study content
  app.post('/api/vision/scan', requireAuth, apiRateLimiter, async (req, res) => {
    const userId = (req as any).user?.id || (req as any).user?.uid;
    try {
      const { fileName, fileType, contentBase64, storagePath, bucket } = req.body;

      let resolvedBase64 = typeof contentBase64 === 'string' && contentBase64.trim() ? contentBase64.trim() : '';
      if (!resolvedBase64 && storagePath && typeof storagePath === 'string') {
        const dl = await downloadStorageBufferForUser(userId, storagePath, bucket);
        if (!dl.buffer) {
          console.error('[Vision Scan Error] Could not download storagePath:', storagePath, dl.error);
          return res.status(200).json({
            success: false,
            error: dl.error || 'Could not download file from storage for OCR scanning.'
          });
        }
        resolvedBase64 = dl.buffer.toString('base64');
      }

      if (!resolvedBase64) {
        return res.status(400).json({ error: 'Either storagePath or contentBase64 parameter is required' });
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
            data: resolvedBase64,
            mimeType: mime
          }
        };

        const visionCandidateModels = Array.from(new Set([GEMINI_PRIMARY_MODEL, ...GEMINI_FALLBACK_MODELS]));
        let rawText = '';
        let lastVisionErr: any = null;
        for (const model of visionCandidateModels) {
          try {
            const response = await aiGen.models.generateContent({
              model,
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
            if (response?.text) {
              rawText = response.text;
              break;
            }
          } catch (modelErr: any) {
            lastVisionErr = modelErr;
            console.warn(`[Vision Scan] Model ${model} failed (${modelErr?.status || 'ERR'}):`, modelErr?.message || modelErr);
          }
        }

        if (!rawText) {
          throw lastVisionErr || new Error('Gemini vision models failed to transcribe the document.');
        }

        const resultJson = JSON.parse(rawText);
        return res.json({ success: true, data: resultJson });
      } else {
        // Fallback for non-Gemini: extract text first then generate JSON assets
        let textContent = '';
        const buffer = Buffer.from(resolvedBase64, 'base64');
        const isPdf = mime === 'application/pdf' || fileName?.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          textContent = await parsePdfBuffer(buffer);
        } else {
          if (!mime.startsWith('image/')) {
            textContent = buffer.toString('utf-8');
          } else {
            return res.json({
              success: false,
              error: 'Image scanning requires GEMINI_API_KEY to be configured in your hosting environment variables.'
            });
          }
        }

        if (!textContent || textContent.trim().length < 20) {
          return res.json({
            success: false,
            error: 'Uploaded, could not read text from this scanned PDF. Ensure GEMINI_API_KEY is configured for Vision OCR.'
          });
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
      console.error('[Vision Scan Error] Failed for', req.body?.fileName, ':', error?.message || error);
      return res.status(200).json({
        success: false,
        error: error?.message || 'Uploaded, could not read text during OCR scan. Please try again.'
      });
    }
  });

  // =============================================================
  // PERSISTENT AI CONVERSATIONS & CHAT HISTORY (STUDY HUB AI)
  // =============================================================
  app.get('/api/ai/conversations', requireAuth, async (req, res) => {
    const userId = (req as any).user?.id || (req as any).user?.uid;
    const courseIdParam = typeof req.query.courseId === 'string' ? req.query.courseId.trim() : undefined;
    if (!supabaseAdmin || !userId) {
      return res.json({ conversations: [] });
    }
    try {
      let query = supabaseAdmin
        .from('ai_conversations')
        .select('id, user_id, course_id, title, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (courseIdParam === 'general') {
        query = query.is('course_id', null);
      } else if (courseIdParam) {
        query = query.eq('course_id', courseIdParam);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('ai_conversations list warning:', error.message);
        return res.json({ conversations: [] });
      }
      return res.json({ conversations: data || [] });
    } catch (err: any) {
      console.warn('Failed to fetch ai_conversations:', err?.message || err);
      return res.json({ conversations: [] });
    }
  });

  app.get('/api/ai/conversations/:id/messages', requireAuth, async (req, res) => {
    const userId = (req as any).user?.id || (req as any).user?.uid;
    const convId = req.params.id;
    if (!supabaseAdmin || !userId || !convId) {
      return res.json({ messages: [] });
    }
    try {
      const { data: conv } = await supabaseAdmin
        .from('ai_conversations')
        .select('id, user_id')
        .eq('id', convId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!conv) {
        return res.status(404).json({ error: 'Conversation not found.' });
      }
      const { data, error } = await supabaseAdmin
        .from('ai_messages')
        .select('id, conversation_id, role, content, created_at')
        .eq('conversation_id', convId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) {
        console.warn('ai_messages fetch warning:', error.message);
        return res.json({ messages: [] });
      }
      return res.json({ messages: data || [] });
    } catch (err: any) {
      return res.json({ messages: [] });
    }
  });

  app.patch('/api/ai/conversations/:id', requireAuth, async (req, res) => {
    const userId = (req as any).user?.id || (req as any).user?.uid;
    const convId = req.params.id;
    const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 80) : '';
    if (!title) {
      return res.status(400).json({ error: 'Title is required.' });
    }
    if (!supabaseAdmin || !userId) {
      return res.status(503).json({ error: 'Database unavailable.' });
    }
    try {
      const { data, error } = await supabaseAdmin
        .from('ai_conversations')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', convId)
        .eq('user_id', userId)
        .select('id, user_id, course_id, title, created_at, updated_at')
        .maybeSingle();
      if (error || !data) {
        return res.status(404).json({ error: error?.message || 'Conversation not found.' });
      }
      return res.json({ conversation: data });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to rename conversation.' });
    }
  });

  app.delete('/api/ai/conversations/:id', requireAuth, async (req, res) => {
    const userId = (req as any).user?.id || (req as any).user?.uid;
    const convId = req.params.id;
    if (!supabaseAdmin || !userId) {
      return res.status(503).json({ error: 'Database unavailable.' });
    }
    try {
      await supabaseAdmin
        .from('ai_messages')
        .delete()
        .eq('conversation_id', convId)
        .eq('user_id', userId);
      const { error } = await supabaseAdmin
        .from('ai_conversations')
        .delete()
        .eq('id', convId)
        .eq('user_id', userId);
      if (error) {
        return res.status(400).json({ error: error.message });
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to delete conversation.' });
    }
  });

  // Advanced Academic AI Companion / tutoring endpoint (with DB-backed conversation history)
  app.post('/api/scolaris/chat', requireAuth, apiRateLimiter, async (req, res) => {
    const { messages, message, conversationId, courseId, courseContext, fileContent } = req.body;
    try {
      const apiKey = getAIKey();
      if (!apiKey) {
        return res.status(503).json({
          error: "AI service credentials are not configured on the server. Please configure GROQ_API_KEY or GEMINI_API_KEY in your hosting environment variables."
        });
      }

      const userId = (req as any).user?.id || (req as any).user?.uid;
      const studentContext = await getStudentContextForUser(userId);

      // Extract the new user message
      const clientMsgs = Array.isArray(messages) ? messages : [];
      const rawUserMessage = typeof message === 'string' && message.trim()
        ? message.trim()
        : (clientMsgs.length > 0 ? String(clientMsgs[clientMsgs.length - 1]?.content || clientMsgs[clientMsgs.length - 1]?.text || '').trim() : '');

      if (!rawUserMessage) {
        return res.status(400).json({ error: 'Message content is required.' });
      }

      let systemPrompt = `${studentContext}

You are KorsIQ Academic Companion, an elite, highly knowledgeable university faculty mentor and subject-matter scholar.

MANDATORY MARKDOWN & MATHEMATICAL FORMATTING RULES:
- ALWAYS format your responses using rich, structured GitHub-flavored Markdown.
- Use bold signs **like this** for all key terms, important concepts, definitions, rules, and core takeaways.
- Use italic signs *like this* for technical terms, subtle emphasis, Latin phrases, or book/paper citations.
- For all mathematical, scientific, engineering, and statistical formulas, equations, or variables, ALWAYS use LaTeX dollar signs:
  - Inline formulas: enclose with single dollar signs, e.g. $E = mc^2$, $f(x) = \\frac{d}{dx} [x^2]$, $\\sigma = \\sqrt{\\frac{\\sum (x - \\bar{x})^2}{N}}$, $\\text{pH} = -\\log[H^+]$.
  - Standalone/Display equations: enclose with double dollar signs on their own lines, e.g.:
    $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$
- Structure your answers with clear Markdown headings (## for major sections, ### for sub-topics).
- Use organized bullet points (- ) and numbered lists (1. ) for step-by-step solutions, proofs, or breakdowns.
- Use code blocks with language specifiers (e.g. \`\`\`python, \`\`\`java, \`\`\`sql) for programming syntax or pseudo-code.
- Use Markdown tables (| Column 1 | Column 2 |) when comparing ideas, methods, or showing reference data.
- Use blockquotes (> ) for memorable axioms, exam alerts, or key takeaways.`;

      if (courseContext) {
        systemPrompt += `\n\nACTIVE COURSE CONTEXT:
The student is currently working on: "${courseContext}".
Focus your analysis, definitions, and problem-solving techniques on the scope and curriculum of this course.`;
      }

      if (fileContent && typeof fileContent === 'string' && fileContent.trim().length > 0) {
        const val = validateExtractedText(fileContent);
        if (val.isValid) {
          const cleanText = selectRelevantChunks(fileContent, rawUserMessage, 14000);
          systemPrompt += `\n\nCRITICAL CONTEXT: The student has uploaded a source material file to study. Below is clean readable text extracted from their file:
---
${cleanText}
---
Always refer to this context when answering questions about the material, explaining topics covered, or quizzing the student!`;
        } else {
          console.warn('Blocked raw binary or corrupted fileContent from chat system prompt:', val.reason);
        }
      }

      // Load authoritative conversation history from the database for the authenticated user
      let activeConv: any = null;
      let conversationMessages: { role: string; content: string }[] = [];

      if (supabaseAdmin && userId) {
        try {
          if (conversationId) {
            const { data: existingConv } = await supabaseAdmin
              .from('ai_conversations')
              .select('id, user_id, course_id, title, created_at, updated_at')
              .eq('id', conversationId)
              .eq('user_id', userId)
              .maybeSingle();

            if (existingConv) {
              activeConv = existingConv;
              const { data: dbMsgs } = await supabaseAdmin
                .from('ai_messages')
                .select('role, content, created_at')
                .eq('conversation_id', existingConv.id)
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(20);

              if (Array.isArray(dbMsgs) && dbMsgs.length > 0) {
                conversationMessages = dbMsgs
                  .slice()
                  .reverse()
                  .map((m: any) => ({
                    role: m.role === 'assistant' ? 'assistant' : 'user',
                    content: m.content
                  }));
              }
            }
          }

          if (!activeConv) {
            const autoTitle = rawUserMessage.replace(/\s+/g, ' ').slice(0, 60);
            const { data: createdConv } = await supabaseAdmin
              .from('ai_conversations')
              .insert({
                user_id: userId,
                course_id: courseId || null,
                title: autoTitle || 'New conversation'
              })
              .select('id, user_id, course_id, title, created_at, updated_at')
              .maybeSingle();
            if (createdConv) {
              activeConv = createdConv;
            }
          }
        } catch (dbHistErr: any) {
          console.warn('AI conversation DB lookup fallback:', dbHistErr?.message || dbHistErr);
        }
      }

      // Append the current user prompt to the authoritative DB history
      const messagesForAI = [
        ...conversationMessages,
        { role: 'user', content: rawUserMessage }
      ];

      const aiContent = await runAICall({
        systemInstruction: systemPrompt,
        messages: messagesForAI,
        temperature: 0.5
      });

      // Chat (AI tutor, Circle @korsiq) is NOT credit-metered (protected by rate limiting only)

      // Persist both the user message and the AI response to the database
      let savedUserMsg: any = null;
      let savedAssistantMsg: any = null;
      if (supabaseAdmin && userId && activeConv?.id) {
        try {
          const nowIso = new Date().toISOString();
          const { data: insertedMsgs } = await supabaseAdmin
            .from('ai_messages')
            .insert([
              {
                conversation_id: activeConv.id,
                user_id: userId,
                role: 'user',
                content: rawUserMessage
              },
              {
                conversation_id: activeConv.id,
                user_id: userId,
                role: 'assistant',
                content: aiContent
              }
            ])
            .select('id, conversation_id, role, content, created_at');

          if (Array.isArray(insertedMsgs)) {
            savedUserMsg = insertedMsgs.find((m: any) => m.role === 'user') || null;
            savedAssistantMsg = insertedMsgs.find((m: any) => m.role === 'assistant') || null;
          }

          const updatedTitle = activeConv.title === 'New conversation'
            ? rawUserMessage.replace(/\s+/g, ' ').slice(0, 60)
            : activeConv.title;

          const { data: updatedConv } = await supabaseAdmin
            .from('ai_conversations')
            .update({ title: updatedTitle, updated_at: nowIso })
            .eq('id', activeConv.id)
            .eq('user_id', userId)
            .select('id, user_id, course_id, title, created_at, updated_at')
            .maybeSingle();
          if (updatedConv) activeConv = updatedConv;
        } catch (saveErr: any) {
          console.warn('Failed to persist AI chat messages:', saveErr?.message || saveErr);
        }
      }

      res.json({
        text: aiContent,
        conversation: activeConv,
        userMessage: savedUserMsg,
        assistantMessage: savedAssistantMsg
      });
    } catch (error: any) {
      console.error("KorsIQ Chat API pipeline error:", error?.message || error);
      res.status(500).json({
        error: error?.message || "AI tutor request failed. Please check server AI configuration."
      });
    }
  });

  // Study Materials (Summary: 1 credit, Flashcards/Quiz/Test: 2 credits)
  app.post('/api/ai/materials', requireAuth, apiRateLimiter, async (req, res) => {
    const { content, type, requestId } = req.body;
    const userId = (req as any).user?.id || (req as any).user?.uid;
    const materialType = type === 'flashcards' || type === 'quiz' || type === 'test' ? type : 'summary';
    const cost = materialType === 'summary' ? AI_CREDIT_COSTS.summary : AI_CREDIT_COSTS.flashcards;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: "No study material provided." });
    }

    const val = validateExtractedText(content);
    if (!val.isValid) {
      return res.status(400).json({
        error: val.reason || "We couldn't read this document correctly. Please try uploading another copy or text-based material."
      });
    }

    const spend = await consumeAiCredits(userId, materialType, cost, requestId);
    if (!spend.success) {
      return res.status(402).json({
        error: 'Not enough credits',
        code: 'INSUFFICIENT_CREDITS',
        balance: spend.balance,
        required: cost,
        allowance: spend.allowance,
        resetDate: spend.periodEnd
      });
    }

    try {
      const cleanContent = normalizeExtractedText(content);
      const apiKey = getAIKey();
      if (!apiKey) {
        await refundAiCredits(userId, materialType, cost, spend.requestId);
        return res.status(503).json({ error: "AI service is not configured on the server. Your credits have been refunded." });
      }

      const studentContext = await getStudentContextForUser(userId);

      let systemInstruction = "";
      let userContent = "";

      if (materialType === 'summary') {
        systemInstruction = `${studentContext}

You are an elite, student-friendly academic tutor.
Generate a clear, clean, highly readable Markdown summary of the provided study material.

CRITICAL WRITING & MARKDOWN RULES:
- STRICTLY DO NOT use complex academic jargon, dense buzzwords, esoteric technical terminology, or overly verbose language.
- Explain every key concept, formula, and rule in simple, intuitive, plain English that any student can immediately understand.
- ALWAYS use bold signs **like this** for all key terms, definitions, and core takeaways.
- For all mathematical, scientific, engineering, or statistical formulas, ALWAYS use LaTeX dollar signs ($...$ for inline and $$...$$ for display equations).
- Format logically with clear Markdown headings (e.g., # Summary, ## Core Takeaways, ## Key Definitions), clean bullet points (- ), and numbered steps (1. ).
- Focus on practical understanding, real-world examples, and maximum clarity.`;
        userContent = cleanContent;
      } else if (materialType === 'flashcards') {
        systemInstruction = `${studentContext}

You are an elite memorization assistant. Your job is to output structurally perfect JSON arrays representing flashcards for active recall study. Do not include any introductory text or conversational prose outside of the raw JSON structure.`;
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
      "${cleanContent}"`;
      } else if (materialType === 'quiz') {
        systemInstruction = `${studentContext}

You are an elite academic assessment engine. Your job is to output structurally perfect JSON arrays representing multiple-choice quizzes. Do not include any introductory conversational text, explanations, or Markdown formatting outside of the raw JSON code structure itself.`;
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
      "${cleanContent}"`;
      } else if (materialType === 'test') {
        systemInstruction = `${studentContext}

Generate a comprehensive exam simulation with 8 questions from the provided text content.
            You must return a valid JSON object with key "test" containing an array of 8 questions.
            Include 4 Multiple-Choice questions and 4 True/False questions.
            Make sure the True/False questions have exactly two options: ["True", "False"].
            Each question has:
            - "question": string
            - "options": array of strings
            - "answer": string (must exactly match one of the options)
            - "explanation": string explaining why it is correct`;
        userContent = cleanContent;
      }
      
      const text = await runAICall({
        systemInstruction,
        messages: [{ role: 'user', content: userContent }],
        jsonMode: materialType !== 'summary'
      });

      if (materialType === 'summary') {
        res.json(text);
      } else {
        const parsed = JSON.parse(text || '{}');
        let data = parsed.flashcards || parsed.quiz || parsed.test || parsed;
        
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
      console.warn("Materials AI generation failed, refunding credits:", error?.message || error);
      await refundAiCredits(userId, materialType, cost, spend.requestId);
      res.status(500).json({ error: error?.message || "Generation failed. Your credits have been refunded." });
    }
  });

  // Podcast Generation via Google Gemini & Speech Audio Synthesis (6 credits)
  const handlePodcastGeneration = async (req: express.Request, res: express.Response) => {
    const studyText = req.body.topic || req.body.content || req.body.studyMaterial || req.body.fileContent || '';
    const userId = (req as any).user?.id || (req as any).user?.uid;
    const cost = AI_CREDIT_COSTS.podcast;

    if (!studyText || typeof studyText !== 'string' || !studyText.trim()) {
      return res.status(400).json({ error: "Please provide study text or select a material to generate a podcast." });
    }

    // Step 1: Check credit balance first WITHOUT consuming credits yet
    const balanceInfo = await getAiCreditBalanceForUser(userId);
    if (balanceInfo.balance < cost) {
      return res.status(402).json({
        error: 'Not enough credits',
        code: 'INSUFFICIENT_CREDITS',
        balance: balanceInfo.balance,
        required: cost,
        allowance: balanceInfo.allowance,
        resetDate: balanceInfo.periodEnd
      });
    }

    try {
      const studentContext = await getStudentContextForUser(userId);

      // Generate script using Google Gemini
      const rawScript = await generateGeminiPodcastScript(studyText, studentContext);
      if (!rawScript || typeof rawScript !== 'string' || !rawScript.trim()) {
        throw new Error('Failed to generate podcast script from AI service.');
      }

      // Step 2: Clean script of Markdown, special symbols, and formatting noise before audio generation
      const script = cleanScriptFormatting(rawScript);

      // Step 3: Audio Generation & Output Stream Validation
      let wavBuffer: Buffer | null = null;
      let validation: { valid: boolean; error?: string; durationSec?: number } = { valid: false, error: 'Audio generator not called', durationSec: 0 };
      try {
        wavBuffer = generateSpeechWav(script);
        validation = validateWavBuffer(wavBuffer);
      } catch (audioErr: any) {
        console.warn('Podcast audio synthesis exception:', audioErr?.message || audioErr);
        validation = { valid: false, error: audioErr?.message || 'Audio synthesis exception', durationSec: 0 };
      }

      if (!validation.valid || !wavBuffer) {
        console.error('Audio validation failed for podcast output:', validation.error);
        // Script succeeded but audio failed: return script, charge 0 credits per spec!
        return res.json({
          success: true,
          script,
          audioBase64: null,
          audioFailed: true,
          audioError: validation.error || 'Audio synthesis was unable to render voice track.',
          creditsCharged: 0,
          creditsRemaining: balanceInfo.balance
        });
      }

      // Step 4: BOTH script and valid playable audio succeeded -> now consume credits
      const spend = await consumeAiCredits(userId, 'podcast', cost, req.body?.requestId);
      const audioBase64 = wavBuffer.toString('base64');

      let persistentAudioUrl: string | null = null;
      let podcastStorageKey: string | null = null;
      if (isS3Configured() && wavBuffer) {
        try {
          podcastStorageKey = `users/${userId}/podcasts/podcast_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.wav`;
          const s3 = getS3();
          await s3.send(new PutObjectCommand({
            Bucket: 'user-files',
            Key: podcastStorageKey,
            Body: wavBuffer,
            ContentType: 'audio/wav'
          }));
          const getCmd = new GetObjectCommand({
            Bucket: 'user-files',
            Key: podcastStorageKey
          });
          // 7-day presigned streaming playback URL
          persistentAudioUrl = await getSignedUrl(s3, getCmd, { expiresIn: 7 * 24 * 3600 });
        } catch (s3AudioErr: any) {
          console.warn('[Podcast S3 Storage] Could not persist audio track to S3:', s3AudioErr?.message || s3AudioErr);
        }
      }

      res.json({
        success: true,
        script,
        audioBase64,
        audioUrl: persistentAudioUrl,
        storageKey: podcastStorageKey,
        durationSec: validation.durationSec,
        creditsCharged: spend.success ? cost : 0,
        creditsRemaining: spend.balance
      });
    } catch (error: any) {
      console.error('Podcast generation server error (0 credits charged):', error?.message || error);
      res.status(500).json({ error: "We couldn't generate your podcast right now. No credits were charged." });
    }
  };

  app.post('/api/ai/podcast', requireAuth, apiRateLimiter, handlePodcastGeneration);
  app.post('/api/podcast/generate', requireAuth, apiRateLimiter, handlePodcastGeneration);

  // ==========================================
  // OTP-ONLY ADMIN AUTH & MANAGEMENT API
  // ==========================================

  const adminOtpCooldowns = new Map<string, number>();
  const adminIpRateLimits = new Map<string, number[]>();

  // Checks both `admin_users` (20261109 migration) and `admins` (20261107 migration applied on live DB)
  async function findAuthorizedAdmin(rawEmail: string): Promise<{ id: string; email: string; role: string; active: boolean } | null> {
    if (!supabaseAdmin || !rawEmail) return null;
    const cleanEmail = rawEmail.trim().toLowerCase();

    // 1. Check `admin_users` table first
    try {
      const { data: userRow, error: userErr } = await supabaseAdmin
        .from('admin_users')
        .select('id, email, role, active')
        .ilike('email', cleanEmail)
        .eq('active', true)
        .maybeSingle();

      if (!userErr && userRow) {
        return {
          id: userRow.id,
          email: String(userRow.email || cleanEmail).toLowerCase(),
          role: userRow.role || 'super_admin',
          active: Boolean(userRow.active)
        };
      }
    } catch {}

    // 2. Fallback to `admins` table (applied via 20261107_admin_system.sql)
    try {
      const { data: legacyRow, error: legacyErr } = await supabaseAdmin
        .from('admins')
        .select('id, email, role, is_active')
        .ilike('email', cleanEmail)
        .eq('is_active', true)
        .maybeSingle();

      if (!legacyErr && legacyRow) {
        return {
          id: legacyRow.id,
          email: String(legacyRow.email || cleanEmail).toLowerCase(),
          role: legacyRow.role || 'super_admin',
          active: Boolean(legacyRow.is_active)
        };
      }
    } catch {}

    return null;
  }

  async function logAdminAction(adminEmail: string, action: string, details: any = {}, ipAddress: string = '') {
    if (!supabaseAdmin) return;
    try {
      const { error } = await supabaseAdmin.from('admin_audit_log').insert({
        admin_email: adminEmail,
        action,
        details,
        ip_address: ipAddress
      });
      if (error) {
        // Fallback to `admin_logs` table (20261107_admin_system.sql)
        await supabaseAdmin.from('admin_logs').insert({
          admin_email: adminEmail,
          action,
          details,
          ip_address: ipAddress
        });
      }
    } catch (err) {
      console.warn('[Admin Audit] Failed to record audit log:', err);
    }
  }

  async function fetchAdminAuditLogs(limit = 100): Promise<any[]> {
    if (!supabaseAdmin) return [];
    try {
      const { data, error } = await supabaseAdmin
        .from('admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!error && Array.isArray(data)) return data;
    } catch {}

    try {
      const { data: fallbackData } = await supabaseAdmin
        .from('admin_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (Array.isArray(fallbackData)) return fallbackData;
    } catch {}
    return [];
  }

  // 1. Submit email to request 6-digit OTP
  app.post('/api/admin/auth/request-otp', async (req, res) => {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown';
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!rawEmail || !rawEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'A valid email address is required.' });
    }

    // Rate limit per IP: max 10 requests per 15 minutes
    const now = Date.now();
    const ipTimes = (adminIpRateLimits.get(ip) || []).filter(t => now - t < 15 * 60 * 1000);
    if (ipTimes.length >= 10) {
      return res.status(429).json({ success: false, error: 'Too many requests. Please wait a few minutes before trying again.' });
    }
    ipTimes.push(now);
    adminIpRateLimits.set(ip, ipTimes);

    // Rate limit per email: 60-second cooldown
    const lastSent = adminOtpCooldowns.get(rawEmail) || 0;
    if (now - lastSent < 60 * 1000) {
      const waitSec = Math.ceil((60 * 1000 - (now - lastSent)) / 1000);
      return res.status(429).json({ success: false, error: `Please wait ${waitSec} seconds before requesting a new code.` });
    }

    // Generic response identical whether authorized or not
    const GENERIC_SUCCESS_RESPONSE = {
      success: true,
      message: 'If this email is authorized, a 6-digit verification code has been sent.'
    };

    try {
      if (!supabaseAdmin || !supabaseAuthClient) {
        console.error(
          '[Admin Auth] Cannot process OTP request: SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY is missing in server environment variables.'
        );
        return res.status(503).json({ success: false, error: 'Admin authentication service is not configured on the server.' });
      }

      // Check allowlist across `admin_users` and `admins` (case-insensitive)
      const adminRow = await findAuthorizedAdmin(rawEmail);

      if (!adminRow) {
        // Unknown or inactive email: do not send code, return identical message
        await logAdminAction(rawEmail, 'admin_otp_requested_unauthorized', { ip }, ip);
        return res.json(GENERIC_SUCCESS_RESPONSE);
      }

      // Ensure auth.users record exists for the allowlisted admin
      try {
        await supabaseAdmin.auth.admin.createUser({
          email: rawEmail,
          email_confirm: true
        });
      } catch {}

      // Trigger Supabase email OTP for the allowlisted admin
      const { error: otpError } = await supabaseAuthClient.auth.signInWithOtp({
        email: rawEmail,
        options: {
          shouldCreateUser: true
        }
      });

      if (otpError) {
        console.error('[Admin Auth] Supabase signInWithOtp error:', otpError.message);
        return res.status(429).json({
          success: false,
          error: otpError.message || 'Could not dispatch OTP email right now. Please wait 60 seconds and try again.'
        });
      }

      adminOtpCooldowns.set(rawEmail, now);
      await logAdminAction(rawEmail, 'admin_otp_sent', { role: adminRow.role, ip }, ip);

      return res.json(GENERIC_SUCCESS_RESPONSE);
    } catch (err: any) {
      console.error('[Admin Auth] Request OTP error:', err);
      return res.json(GENERIC_SUCCESS_RESPONSE);
    }
  });

  // 2. Verify 6-digit OTP (Rate limited to thwart brute-forcing)
  app.post('/api/admin/auth/verify-otp', apiRateLimiter, async (req, res) => {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown';
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';

    if (!rawEmail || !token) {
      return res.status(400).json({ success: false, error: 'Email and 6-digit verification code are required.' });
    }

    if (!supabaseAdmin || !supabaseAuthClient) {
      console.error(
        '[Admin Auth] Cannot verify OTP: SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY is missing in server environment variables.'
      );
      return res.status(503).json({ success: false, error: 'Authentication service unavailable.' });
    }

    try {
      // 1. Verify code via Supabase Auth (try 'email', then 'magiclink', then 'signup')
      let verifyRes = await supabaseAuthClient.auth.verifyOtp({
        email: rawEmail,
        token,
        type: 'email'
      });

      if (verifyRes.error || !verifyRes.data?.user) {
        const fallbackMagic = await supabaseAuthClient.auth.verifyOtp({
          email: rawEmail,
          token,
          type: 'magiclink'
        });
        if (!fallbackMagic.error && fallbackMagic.data?.user) {
          verifyRes = fallbackMagic;
        } else {
          const fallbackSignup = await supabaseAuthClient.auth.verifyOtp({
            email: rawEmail,
            token,
            type: 'signup'
          });
          if (!fallbackSignup.error && fallbackSignup.data?.user) {
            verifyRes = fallbackSignup;
          }
        }
      }

      if (verifyRes.error || !verifyRes.data?.user) {
        await logAdminAction(rawEmail, 'admin_otp_verify_failed', { error: verifyRes.error?.message, ip }, ip);
        return res.status(401).json({ success: false, error: 'Invalid or expired 6-digit verification code.' });
      }

      // 2. Cryptographically re-verify against allowlist (`admin_users` or `admins`)
      const adminRow = await findAuthorizedAdmin(rawEmail);

      if (!adminRow) {
        await logAdminAction(rawEmail, 'admin_access_denied_not_allowlisted', { ip }, ip);
        return res.status(403).json({ success: false, error: 'Access denied: Email is not an authorized administrator.' });
      }

      // Update last_login_at on `admins` if present (non-blocking)
      try {
        await supabaseAdmin
          .from('admins')
          .update({ last_login_at: new Date().toISOString() })
          .ilike('email', rawEmail);
      } catch {}

      await logAdminAction(rawEmail, 'admin_sign_in_success', { role: adminRow.role, ip }, ip);

      return res.json({
        success: true,
        user: {
          id: adminRow.id,
          email: adminRow.email.toLowerCase(),
          role: adminRow.role
        },
        session: verifyRes.data.session
      });
    } catch (err: any) {
      console.error('[Admin Auth] Verify error:', err);
      return res.status(500).json({ success: false, error: 'Failed to verify admin code.' });
    }
  });

  // 3. Strict Admin Authorization Middleware for Protected Admin API
  const requireAdminAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!supabaseAdmin || !supabaseAuthClient) {
      return res.status(503).json({ success: false, error: 'Admin service unavailable: Supabase credentials unconfigured.' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing admin authorization token.' });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing access token.' });
    }

    try {
      // Cryptographically validate JWT against Supabase Auth
      const { data, error } = await supabaseAuthClient.auth.getUser(token);
      if (error || !data.user || !data.user.email) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Admin session expired or invalid.' });
      }

      const email = data.user.email.toLowerCase().trim();

      // Re-check active admin status in allowlist (`admin_users` or `admins`)
      const adminRow = await findAuthorizedAdmin(email);

      if (!adminRow) {
        return res.status(403).json({ success: false, error: 'Forbidden: Admin privileges inactive or revoked.' });
      }

      (req as any).adminUser = adminRow;
      next();
    } catch (err: any) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Token validation failed.' });
    }
  };

  // 4. Admin Dashboard API: Overview
  app.get('/api/admin/overview', requireAdminAuth, async (_req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'Database service unavailable.' });
    try {
      const [profilesRes, subsRes, groupsRes, pendingTxRes, recentLogs] = await Promise.all([
        supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }),
        supabaseAdmin.from('subscriptions').select('id, amount_paid, status, created_at').eq('status', 'active'),
        supabaseAdmin.from('study_groups').select('id', { count: 'exact', head: true }),
        supabaseAdmin.from('payment_transactions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        fetchAdminAuditLogs(10)
      ]);

      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthRevenue = (subsRes.data || [])
        .filter((s: any) => s.created_at >= firstOfMonth)
        .reduce((sum: number, s: any) => sum + (Number(s.amount_paid) || 0), 0);

      res.json({
        success: true,
        data: {
          totalUsers: profilesRes.count || 0,
          activeSubscriptions: subsRes.data?.length || 0,
          monthRevenue,
          totalCircles: groupsRes.count || 0,
          pendingPayments: pendingTxRes.count || 0,
          recentLogs
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch overview metrics.' });
    }
  });

  // 5. Admin Dashboard API: Users search
  app.get('/api/admin/users', requireAdminAuth, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'Database service unavailable.' });
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    try {
      let query = supabaseAdmin
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (search) {
        const safeSearch = search.replace(/[,()"'%_]/g, '').trim();
        if (safeSearch) {
          query = query.or(`email.ilike.%${safeSearch}%,name.ilike.%${safeSearch}%`);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      const users = (data || []).map((u: any) => ({
        ...u,
        university: u.institution || u.university || '',
        department: u.department || u.major || '',
        tier: u.subscription_tier || u.tier || 'free'
      }));
      res.json({ success: true, users });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch users.' });
    }
  });

  // 6. Admin Dashboard API: Subscriptions & Payment Transactions
  app.get('/api/admin/subscriptions', requireAdminAuth, async (_req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'Database service unavailable.' });
    try {
      const { data, error } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      res.json({ success: true, subscriptions: data || [] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch subscriptions.' });
    }
  });

  // 6b. Admin Dashboard API: Payment Transactions Ledger + Filter
  app.get('/api/admin/payments', requireAdminAuth, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'Database service unavailable.' });
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : '';
    try {
      let txQuery = supabaseAdmin
        .from('payment_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (statusFilter && statusFilter !== 'all') {
        txQuery = txQuery.eq('status', statusFilter);
      }

      const [{ data: transactions, error: txErr }, { data: subscriptions }] = await Promise.all([
        txQuery,
        supabaseAdmin.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(100)
      ]);

      if (txErr) throw txErr;
      res.json({
        success: true,
        transactions: transactions || [],
        subscriptions: subscriptions || []
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch payment transactions.' });
    }
  });

  // 6c. Admin Dashboard API: Verify a Pending Payment Reference with Paystack
  app.post('/api/admin/payments/verify', requireAdminAuth, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'Database service unavailable.' });
    const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim() : '';
    const admin = (req as any).adminUser;

    if (!reference) {
      return res.status(400).json({ success: false, error: 'Payment reference is required.' });
    }

    const secretKey = getPaystackSecretKey();
    if (!secretKey) {
      return res.status(503).json({ success: false, error: 'PAYSTACK_SECRET_KEY is not configured on the server. If recently added in Vercel environment variables, please redeploy the project.' });
    }

    try {
      const { data: txRecord } = await supabaseAdmin
        .from('payment_transactions')
        .select('*')
        .eq('reference', reference)
        .maybeSingle();

      const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${secretKey}` }
      });
      const verifyData: any = await verifyResponse.json().catch(() => ({}));

      if (!verifyResponse.ok || !verifyData.status || !verifyData.data) {
        await logAdminAction(admin.email, 'admin_verify_payment_not_found', { reference, paystackMessage: verifyData?.message });
        return res.status(400).json({
          success: false,
          error: verifyData?.message || 'Paystack could not find or verify this reference.'
        });
      }

      const txData = verifyData.data;
      const gatewayStatus = String(txData.status || '').toLowerCase();

      if (gatewayStatus !== 'success') {
        const mappedStatus = gatewayStatus === 'abandoned' ? 'abandoned' : gatewayStatus === 'failed' ? 'failed' : 'pending';
        if (txRecord) {
          await supabaseAdmin
            .from('payment_transactions')
            .update({
              status: mappedStatus,
              gateway_response: txData.gateway_response || `Paystack status: ${gatewayStatus}`
            })
            .eq('reference', reference);
        }
        await logAdminAction(admin.email, 'admin_verify_payment_non_success', { reference, gatewayStatus });
        return res.json({
          success: false,
          status: mappedStatus,
          error: `Paystack reports transaction status "${gatewayStatus}" (${txData.gateway_response || 'not paid'}).`
        });
      }

      const userId = txRecord?.user_id || txData.metadata?.userId || txData.metadata?.user_id;
      const rawPlan = String(txRecord?.plan_tier || txRecord?.plan || txData.metadata?.planTier || txData.metadata?.plan || '').toLowerCase();
      const planKey: 'plus' | 'studio' =
        rawPlan === 'studio' || rawPlan === 'sage' || Number(txData.amount) >= 1500000 ? 'studio' : 'plus';
      const cycleKey: 'monthly' | 'annual' =
        (txRecord?.metadata?.billingCycle || txData.metadata?.billingCycle || txData.metadata?.billing_cycle) === 'annual'
          ? 'annual'
          : 'monthly';

      if (!userId) {
        return res.status(400).json({ success: false, error: 'Payment succeeded on Paystack, but no user_id is linked to this reference.' });
      }

      const periodStart = txData.paid_at ? new Date(txData.paid_at) : new Date();
      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + (cycleKey === 'annual' ? 365 : 30));
      const periodEndIso = periodEnd.toISOString();
      const amountNaira = (Number(txData.amount) || Number(txRecord?.amount_kobo) || 0) / 100;

      await supabaseAdmin
        .from('payment_transactions')
        .update({
          status: 'paid',
          paid_at: periodStart.toISOString(),
          gateway_response: txData.gateway_response || 'Approved',
          channel: txData.channel || null
        })
        .eq('reference', reference);

      await supabaseAdmin.from('subscriptions').upsert(
        {
          user_id: userId,
          plan_tier: planKey,
          billing_cycle: cycleKey,
          status: 'active',
          payment_provider: 'paystack',
          payment_reference: reference,
          payment_status: 'paid',
          amount_paid: amountNaira,
          currency: txData.currency || 'NGN',
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEndIso,
          paystack_customer_code: txData.customer?.customer_code || null,
          paystack_authorization_code: txData.authorization?.authorization_code || null
        },
        { onConflict: 'payment_reference' }
      );

      await activatePaidProfile(
        supabaseAdmin,
        userId,
        planKey,
        true,
        'active',
        'paid',
        periodEndIso,
        txData.customer?.customer_code || undefined
      );

      await logAdminAction(admin.email, 'admin_verify_payment_activated', {
        reference,
        userId,
        plan: planKey,
        amountNaira
      });

      return res.json({
        success: true,
        status: 'paid',
        plan: planKey,
        periodEnd: periodEndIso,
        message: `Verified with Paystack and activated ${planKey.toUpperCase()} plan for user ${userId}.`
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Failed to verify payment with Paystack.' });
    }
  });

  // 7. Admin Dashboard API: Manual Grant / Revoke Subscription
  app.post('/api/admin/subscriptions/grant-tier', requireAdminAuth, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'Database service unavailable.' });
    const { userId, targetTier } = req.body;
    const admin = (req as any).adminUser;

    if (!userId || !targetTier) {
      return res.status(400).json({ success: false, error: 'userId and targetTier are required.' });
    }

    try {
      const isPro = targetTier === 'plus' || targetTier === 'studio';
      const status = isPro ? 'active' : 'inactive';
      const periodEnd = isPro ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;

      // Update profile
      const { error: profErr } = await supabaseAdmin
        .from('profiles')
        .update({
          tier: targetTier,
          is_pro: isPro,
          subscription_tier: targetTier,
          subscription_status: status,
          payment_status: isPro ? 'paid' : 'none',
          subscription_end: periodEnd
        })
        .eq('id', userId);

      if (profErr) {
        await supabaseAdmin
          .from('profiles')
          .update({ tier: targetTier, is_pro: isPro })
          .eq('id', userId);
      }

      // Record in subscriptions
      await supabaseAdmin.from('subscriptions').insert({
        user_id: userId,
        plan_tier: targetTier,
        billing_cycle: 'monthly',
        status: isPro ? 'manual_active' : 'inactive',
        payment_provider: 'manual_admin',
        payment_status: isPro ? 'paid' : 'none',
        amount_paid: 0,
        currency: 'NGN',
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd
      });

      await logAdminAction(admin.email, 'admin_grant_tier', { userId, targetTier });

      res.json({ success: true, message: `Successfully updated user tier to ${targetTier}.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to update user tier.' });
    }
  });

  // 7b. Admin Dashboard API: AI Credits Lookup & Adjustment
  app.get('/api/admin/credits', requireAdminAuth, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'Database service unavailable.' });
    const queryVal = typeof req.query.user === 'string' ? req.query.user.trim() : '';
    if (!queryVal) {
      return res.status(400).json({ success: false, error: 'Enter a user email or UUID.' });
    }

    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(queryVal);
      const safeVal = queryVal.replace(/[,()"'%_]/g, '').trim();
      if (!isUuid && !safeVal) {
        return res.status(400).json({ success: false, error: 'Invalid user search query.' });
      }
      const { data: userRow, error: userErr } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .or(isUuid ? `id.eq.${queryVal}` : `email.ilike.${safeVal}`)
        .maybeSingle();

      if (userErr || !userRow) {
        return res.status(404).json({ success: false, error: 'No user found matching that email or UUID.' });
      }

      const balanceInfo = await getAiCreditBalanceForUser(userRow.id);
      const { data: ledgerRows } = await supabaseAdmin
        .from('ai_credit_ledger')
        .select('*')
        .eq('user_id', userRow.id)
        .order('created_at', { ascending: false })
        .limit(30);

      return res.json({
        success: true,
        user: {
          id: userRow.id,
          email: userRow.email,
          name: userRow.name,
          tier: balanceInfo.tier
        },
        credits: balanceInfo,
        ledger: ledgerRows || []
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Failed to load user AI credits.' });
    }
  });

  app.post('/api/admin/credits/adjust', requireAdminAuth, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'Database service unavailable.' });
    const admin = (req as any).adminUser;
    const userQuery = typeof req.body?.user === 'string' ? req.body.user.trim() : '';
    const delta = Number(req.body?.delta);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : 'Admin credit adjustment';

    if (!userQuery || !Number.isFinite(delta) || delta === 0) {
      return res.status(400).json({ success: false, error: 'Valid user (email or UUID) and non-zero credit delta are required.' });
    }

    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userQuery);
      const safeVal = userQuery.replace(/[,()"'%_]/g, '').trim();
      if (!isUuid && !safeVal) {
        return res.status(400).json({ success: false, error: 'Invalid user format.' });
      }
      const { data: userRow } = await supabaseAdmin
        .from('profiles')
        .select('id, email, name')
        .or(isUuid ? `id.eq.${userQuery}` : `email.ilike.${safeVal}`)
        .maybeSingle();

      if (!userRow) {
        return res.status(404).json({ success: false, error: 'No user found matching that email or UUID.' });
      }

      const { error: insertErr } = await supabaseAdmin.from('ai_credit_ledger').insert({
        user_id: userRow.id,
        action: `admin_adjust:${reason.slice(0, 60)}`,
        delta: Math.trunc(delta),
        request_id: `admin_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
      });

      if (insertErr) {
        return res.status(500).json({
          success: false,
          error: `Could not insert into ai_credit_ledger (${insertErr.message}). Ensure migration 20261110_ai_credit_ledger_and_rpc.sql is applied.`
        });
      }

      await logAdminAction(admin.email, 'admin_adjust_credits', {
        targetUserId: userRow.id,
        targetEmail: userRow.email,
        delta: Math.trunc(delta),
        reason
      });

      const updatedBalance = await getAiCreditBalanceForUser(userRow.id);
      return res.json({
        success: true,
        message: `${delta > 0 ? 'Granted' : 'Deducted'} ${Math.abs(Math.trunc(delta))} AI credits for ${userRow.email}.`,
        credits: updatedBalance
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Failed to adjust AI credits.' });
    }
  });

  // 8. Admin Dashboard API: Circles list
  app.get('/api/admin/circles', requireAdminAuth, async (_req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'Database service unavailable.' });
    try {
      const { data, error } = await supabaseAdmin
        .from('study_groups')
        .select('id, name, course, type, owner_id, member_count, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      res.json({ success: true, circles: data || [] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to list circles.' });
    }
  });

  // 9. Admin Dashboard API: Remove inappropriate Circle Post
  app.delete('/api/admin/circles/posts/:postId', requireAdminAuth, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'Database service unavailable.' });
    const postId = req.params.postId;
    const admin = (req as any).adminUser;

    try {
      const { error } = await supabaseAdmin.from('circle_discussions').delete().eq('id', postId);
      if (error) throw error;
      await logAdminAction(admin.email, 'admin_delete_circle_post', { postId });
      res.json({ success: true, message: 'Circle post deleted.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to delete post.' });
    }
  });

  // 10. Admin Dashboard API: Audit log
  app.get('/api/admin/audit-log', requireAdminAuth, async (_req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'Database service unavailable.' });
    try {
      const logs = await fetchAdminAuditLogs(100);
      res.json({ success: true, logs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch audit log.' });
    }
  });

  // ==========================================
  // PUBLIC / STUDENT CIRCLES API ENDPOINTS
  // ==========================================

  // Helper to generate formatted circle invite code (KQ-XXXX-XX)
  function generateServerCircleInviteCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let p1 = '';
    for (let i = 0; i < 4; i++) {
      p1 += chars.charAt(crypto.randomInt(0, chars.length));
    }
    let p2 = '';
    for (let i = 0; i < 2; i++) {
      p2 += chars.charAt(crypto.randomInt(0, chars.length));
    }
    return `KQ-${p1}-${p2}`;
  }

  // Create Study Circle (Backed by service role to guarantee creation, authenticated & rate limited)
  app.post('/api/circles/create', requireAuth, apiRateLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const {
        name,
        description,
        course,
        type,
        department,
        level,
        university,
        academicSession,
        groupImage,
        inviteCode: clientCode,
        ownerName
      } = req.body;

      if (!name || !course) {
        return res.status(400).json({ success: false, error: 'Circle name and course code are required.' });
      }

      // Security: enforce ownerId from authenticated session to prevent spoofing
      const ownerId = req.user!.uid;
      const userEmail = req.user?.email || '';
      const fallbackName = userEmail ? userEmail.split('@')[0] : 'Circle Creator';
      const effectiveOwnerName = (typeof ownerName === 'string' && ownerName.trim()) || fallbackName;

      const groupId = `group_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const inviteCode = (clientCode && String(clientCode).trim().toUpperCase()) || generateServerCircleInviteCode();
      const createdAt = new Date().toISOString();

      const initialMember = {
        userId: ownerId,
        name: effectiveOwnerName,
        role: 'owner',
        joinedAt: createdAt
      };

      const initialActivity = {
        id: `act_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
        groupId,
        type: 'announcement',
        title: 'Circle Initialized',
        description: `Welcome to ${name}! Study circle initialized by ${effectiveOwnerName}.`,
        actorName: effectiveOwnerName,
        actorId: ownerId,
        timestamp: Date.now()
      };

      const welcomeMessage = {
        id: 'welcome',
        sender: 'KorsIQ',
        text: `Welcome to ${name}! Upload study materials or start a discussion to collaborate.`,
        timestamp: Date.now()
      };

      const groupRecord = {
        id: groupId,
        name: String(name).trim(),
        description: String(description || '').trim(),
        course: String(course).trim(),
        type: type === 'general' ? 'general' : 'private',
        visibility: type === 'general' ? 'public' : 'private',
        invite_code: inviteCode,
        invite_code_active: true,
        department: String(department || '').trim(),
        level: String(level || '').trim(),
        university: String(university || '').trim(),
        academic_session: String(academicSession || '').trim(),
        group_image: String(groupImage || '').trim(),
        owner_id: ownerId,
        members: [initialMember],
        member_count: 1,
        messages: [welcomeMessage],
        discussions: [],
        activity_feed: [initialActivity],
        created_at: createdAt,
        updated_at: createdAt
      };

      if (supabaseAdmin) {
        try {
          const { data: dbData, error: dbErr } = await supabaseAdmin
            .from('study_groups')
            .insert(groupRecord)
            .select('*')
            .maybeSingle();

          if (!dbErr && dbData) {
            await supabaseAdmin.from('circle_members').upsert({
              circle_id: dbData.id,
              user_id: ownerId,
              user_name: effectiveOwnerName,
              role: 'owner',
              joined_at: createdAt
            }, { onConflict: 'circle_id,user_id' });

            return res.json({
              success: true,
              group: {
                id: dbData.id,
                name: dbData.name,
                description: dbData.description || '',
                course: dbData.course,
                type: dbData.type,
                visibility: dbData.visibility || 'private',
                inviteCode: dbData.invite_code,
                inviteCodeActive: dbData.invite_code_active !== false,
                department: dbData.department || '',
                level: dbData.level || '',
                university: dbData.university || '',
                academicSession: dbData.academic_session || '',
                groupImage: dbData.group_image || '',
                ownerId: dbData.owner_id,
                members: dbData.members || [initialMember],
                memberCount: dbData.member_count || 1,
                messages: dbData.messages || [welcomeMessage],
                sharedMaterials: [],
                discussions: dbData.discussions || [],
                activityFeed: dbData.activity_feed || [initialActivity],
                createdAt: dbData.created_at || createdAt,
                updatedAt: dbData.updated_at || createdAt
              }
            });
          }
        } catch (dbErr: any) {
          console.warn('Database insert into study_groups fallback warning:', dbErr?.message);
        }
      }

      // Successful in-memory / direct response
      res.json({
        success: true,
        group: {
          id: groupId,
          name: groupRecord.name,
          description: groupRecord.description,
          course: groupRecord.course,
          type: groupRecord.type,
          visibility: groupRecord.visibility,
          inviteCode,
          inviteCodeActive: true,
          department: groupRecord.department,
          level: groupRecord.level,
          university: groupRecord.university,
          academicSession: groupRecord.academic_session,
          groupImage: groupRecord.group_image,
          ownerId: groupRecord.owner_id,
          members: [initialMember],
          memberCount: 1,
          messages: [welcomeMessage],
          sharedMaterials: [],
          discussions: [],
          activityFeed: [initialActivity],
          createdAt,
          updatedAt: createdAt
        }
      });
    } catch (err: any) {
      console.error('Error in /api/circles/create:', err);
      res.status(500).json({ success: false, error: err?.message || 'Server error creating study circle.' });
    }
  });

  // Find Study Circle by Code (Rate limited to thwart brute-forcing)
  app.get('/api/circles/find', apiRateLimiter, async (req, res) => {
    try {
      const code = String(req.query.code || '').trim().toUpperCase();
      if (!code) return res.status(400).json({ success: false, error: 'Invite code is required.' });

      if (supabaseAdmin) {
        const { data, error } = await supabaseAdmin
          .from('study_groups')
          .select('*')
          .ilike('invite_code', code)
          .maybeSingle();

        if (!error && data) {
          if (data.invite_code_active === false) {
            return res.json({ success: false, error: 'This invitation code has been revoked by the circle creator.' });
          }
          return res.json({
            success: true,
            group: {
              id: data.id,
              name: data.name,
              description: data.description || '',
              course: data.course,
              type: data.type,
              visibility: data.visibility || 'private',
              inviteCode: data.invite_code,
              inviteCodeActive: data.invite_code_active !== false,
              department: data.department || '',
              level: data.level || '',
              university: data.university || '',
              academicSession: data.academic_session || '',
              groupImage: data.group_image || '',
              ownerId: data.owner_id,
              members: data.members || [],
              memberCount: data.member_count || (data.members ? data.members.length : 1),
              messages: data.messages || [],
              sharedMaterials: [],
              discussions: data.discussions || [],
              activityFeed: data.activity_feed || [],
              createdAt: data.created_at,
              updatedAt: data.updated_at
            }
          });
        }
      }

      res.status(404).json({ success: false, error: "That code doesn't match any circle. Check the code and try again." });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Error looking up circle.' });
    }
  });

  // Search Study Circles (Public/General Circles Only - protects private circles from discovery)
  app.get('/api/circles/search', apiRateLimiter, async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!supabaseAdmin) {
        return res.json({ success: true, groups: [] });
      }

      let query = supabaseAdmin
        .from('study_groups')
        .select('*')
        .eq('type', 'general')
        .order('updated_at', { ascending: false })
        .limit(30);

      if (q) {
        const safe = q.replace(/[,()"'%_]/g, '').trim();
        if (safe) {
          query = query.or(`name.ilike.%${safe}%,course.ilike.%${safe}%,department.ilike.%${safe}%`);
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      const groups = (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        course: row.course,
        type: row.type || 'general',
        visibility: row.visibility || 'public',
        inviteCode: row.invite_code,
        inviteCodeActive: row.invite_code_active !== false,
        department: row.department || '',
        level: row.level || '',
        university: row.university || '',
        academicSession: row.academic_session || '',
        groupImage: row.group_image || '',
        ownerId: row.owner_id,
        members: row.members || [],
        memberCount: row.member_count || (row.members ? row.members.length : 1),
        messages: [],
        sharedMaterials: [],
        discussions: [],
        activityFeed: [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json({ success: true, groups });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Error searching circles.' });
    }
  });

  // Join Study Circle (Authenticated, Rate limited, and strictly validated)
  app.post('/api/circles/join', requireAuth, apiRateLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const { groupId, code, userName } = req.body;
      const userId = req.user!.uid;
      const effectiveUserName = (typeof userName === 'string' && userName.trim()) || req.user?.email?.split('@')[0] || 'Student';

      if (!groupId) {
        return res.status(400).json({ success: false, error: 'Group ID is required.' });
      }

      if (supabaseAdmin) {
        const { data: group, error: fetchErr } = await supabaseAdmin
          .from('study_groups')
          .select('*')
          .eq('id', groupId)
          .maybeSingle();

        if (fetchErr || !group) {
          return res.status(404).json({ success: false, error: 'Circle not found.' });
        }

        // Security: Strictly enforce private circle invite code check
        const isPrivate = group.type === 'private' || group.visibility === 'private';
        if (isPrivate) {
          const providedCode = String(code || '').trim().toUpperCase();
          const expectedCode = String(group.invite_code || '').trim().toUpperCase();
          if (!providedCode || providedCode !== expectedCode) {
            return res.status(403).json({ success: false, error: 'A valid invitation code is required to join a private circle.' });
          }
          if (group.invite_code_active === false) {
            return res.status(403).json({ success: false, error: 'This invitation code has been revoked by the circle creator.' });
          }
        }

        const members = (group.members || []) as any[];
        const isMember = members.some(m => (typeof m === 'string' ? m === userId : m.userId === userId));

        if (!isMember) {
          members.push({
            userId,
            name: effectiveUserName,
            role: 'member',
            joinedAt: new Date().toISOString()
          });

          await supabaseAdmin
            .from('study_groups')
            .update({
              members,
              member_count: members.length,
              updated_at: new Date().toISOString()
            })
            .eq('id', groupId);

          await supabaseAdmin.from('circle_members').upsert({
            circle_id: groupId,
            user_id: userId,
            user_name: effectiveUserName,
            role: 'member',
            joined_at: new Date().toISOString()
          }, { onConflict: 'circle_id,user_id' });
        }

        return res.json({
          success: true,
          group: {
            id: group.id,
            name: group.name,
            description: group.description || '',
            course: group.course,
            type: group.type,
            visibility: group.visibility || 'private',
            inviteCode: group.invite_code,
            inviteCodeActive: group.invite_code_active !== false,
            department: group.department || '',
            level: group.level || '',
            university: group.university || '',
            academicSession: group.academic_session || '',
            groupImage: group.group_image || '',
            ownerId: group.owner_id,
            members,
            memberCount: members.length,
            messages: group.messages || [],
            sharedMaterials: [],
            discussions: group.discussions || [],
            activityFeed: group.activity_feed || [],
            createdAt: group.created_at,
            updatedAt: group.updated_at
          }
        });
      }

      res.json({ success: true, message: 'Joined circle.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to join circle.' });
    }
  });

  // Vite / static file serving only when NOT running as serverless function
  if (!process.env.VERCEL) {
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

  // OWASP: Global Centralized Error Handler - prevent internal stack trace disclosure (CWE-209)
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Global Server Error]:', err?.message || err);
    if (res.headersSent) return;
    const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({
      success: false,
      error: status < 500 && err?.message ? err.message : 'An internal server error occurred. Please try again later.'
    });
  });

  return app;
}

export async function startServer() {
  const app = await createExpressApp();
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  return app;
}

// Auto-start only in standalone / local development (not when imported as a serverless module)
if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  startServer();
}
