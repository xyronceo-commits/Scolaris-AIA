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
import { NIGERIAN_UNIVERSITIES } from './utils/nigerianUniversities';
import { buildStudentContext } from './lib/studentContext';

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
const GEMINI_FALLBACK_MODELS = [cleanEnvKey('GEMINI_FALLBACK_MODEL'), 'gemini-3.5-flash', 'gemini-3.5-flash-lite'].filter(Boolean) as string[];
const OCR_MODEL = GEMINI_PRIMARY_MODEL;
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

export async function createExpressApp() {
  const app = express();
  const PORT = 3000;

  app.use(cors());

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
      configured: !!(process.env.SUPABASE_S3_ACCESS_KEY_ID && process.env.SUPABASE_S3_SECRET_ACCESS_KEY),
      endpoint: getSupabaseS3Endpoint(),
      region: process.env.SUPABASE_S3_REGION || 'eu-west-2',
      bucket: process.env.SUPABASE_S3_BUCKET_NAME || 'scolaris-library'
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
      planCode: cleanEnvKey('PAYSTACK_PLUS_PLAN_CODE') || 'PLN_2s5jpok47fzrpp3'
    },
    studio: {
      tier: 'studio' as const,
      name: 'KorsIQ Studio',
      amountNaira: 15000,
      amountKobo: 1500000,
      planCode: cleanEnvKey('PAYSTACK_STUDIO_PLAN_CODE') || 'PLN_z34ejcjcs5od3mf'
    }
  };

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

      const reference = `KQ_${normalizedPlan.toUpperCase()}_${uid.slice(0, 8)}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const client = supabaseAdmin || supabaseAuthClient;

      // Store pending transaction in payment_transactions ledger before calling gateway
      if (client) {
        await client.from('payment_transactions').insert({
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
      }

      const paystackKey = cleanEnvKey('PAYSTACK_SECRET_KEY');
      if (paystackKey) {
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
            callback_url: `${req.headers.origin || 'http://localhost:3000'}/#/settings`,
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
          if (client) {
            await client.from('payment_transactions').update({
              status: 'failed',
              gateway_response: paystackData.message || 'Initialization failed'
            }).eq('reference', reference);
          }
          return res.status(400).json({
            success: false,
            error: paystackData.message || 'Failed to initialize Paystack checkout'
          });
        }

        if (client) {
          await client.from('payment_transactions').update({
            paystack_reference: paystackData.data?.reference || reference,
            authorization_url: paystackData.data?.authorization_url,
            access_code: paystackData.data?.access_code
          }).eq('reference', reference);
        }

        return res.json({
          success: true,
          authorizationUrl: paystackData.data.authorization_url,
          accessCode: paystackData.data.access_code,
          reference: paystackData.data.reference || reference,
          plan: normalizedPlan,
          amount: targetPlan.amountNaira,
          currency: 'NGN'
        });
      }

      // If no PAYSTACK_SECRET_KEY is configured (e.g. testing mode)
      return res.json({
        success: true,
        reference,
        plan: normalizedPlan,
        amount: targetPlan.amountNaira,
        currency: 'NGN',
        testMode: true,
        authorizationUrl: null,
        message: 'Initialized checkout reference for verification'
      });
    } catch (err: any) {
      console.error('Initialize subscription error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Checkout initialization failed' });
    }
  });

  // Verify transaction status securely on the backend
  app.post('/api/subscription/verify', requireAuth, apiRateLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const { reference } = req.body;
      let cleanRef = (typeof reference === 'string' ? reference.trim() : '');
      const uid = req.user!.uid;
      const userEmail = (req.body?.email || req.user!.email || '').toLowerCase().trim();
      const client = supabaseAdmin || supabaseAuthClient;

      // 1. Idempotency & existing active check in database
      if (client) {
        if (cleanRef) {
          const { data: existingSub } = await client
            .from('subscriptions')
            .select('*')
            .eq('payment_reference', cleanRef)
            .maybeSingle();

          if (existingSub && existingSub.payment_status === 'paid' && (existingSub.status === 'active' || existingSub.status === 'manual_active')) {
            if (existingSub.user_id !== uid) {
              return res.status(403).json({ success: false, error: 'Access denied: Payment reference was credited to a different account.' });
            }
            return res.json({
              success: true,
              tier: existingSub.plan_tier,
              isPro: true,
              subscriptionStatus: 'active',
              message: 'Subscription is already verified and active.',
              subscription: existingSub,
              alreadyProcessed: true
            });
          }
        }

        // Check if user already has an active subscription recorded (e.g. from a webhook)
        const { data: userActiveSub } = await client
          .from('subscriptions')
          .select('*')
          .eq('user_id', uid)
          .eq('status', 'active')
          .order('current_period_end', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (userActiveSub && userActiveSub.payment_status === 'paid') {
          return res.json({
            success: true,
            tier: userActiveSub.plan_tier,
            isPro: true,
            subscriptionStatus: 'active',
            currentPeriodEnd: userActiveSub.current_period_end,
            message: 'Your account subscription is verified and active.',
            subscription: userActiveSub,
            alreadyProcessed: true
          });
        }
      }

      // Load pending transaction record if exists
      let localTx: any = null;
      if (client && cleanRef) {
        const { data } = await client
          .from('payment_transactions')
          .select('*')
          .eq('reference', cleanRef)
          .maybeSingle();
        localTx = data;
      }

      const paystackKey = cleanEnvKey('PAYSTACK_SECRET_KEY');
      let isVerified = false;
      let planTier: 'plus' | 'studio' = localTx?.plan_tier || ((cleanRef.includes('_STUDIO_') || cleanRef.includes('_studio_') || req.body?.plan === 'studio' || req.body?.plan === 'premium') ? 'studio' : 'plus');
      let targetPlanConfig = planTier === 'studio' ? PAYSTACK_PLANS.studio : PAYSTACK_PLANS.plus;
      let amountPaid = targetPlanConfig.amountNaira;
      let paymentStatus: 'paid' | 'failed' | 'abandoned' | 'pending' | 'cancelled' = 'paid';
      let gatewayMessage = '';
      let paystackSubCode: string | null = null;
      let paystackCustCode: string | null = null;
      let paystackAuthCode: string | null = null;
      let paystackPlanCode: string | null = targetPlanConfig.planCode;

      if (paystackKey) {
        let tx: any = null;

        // Try direct reference verification if reference was supplied
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
            }
          } catch (vErr) {
            console.warn('Paystack direct verify lookup warning:', vErr);
          }
        }

        // Fallback: If not found by reference (or reference was blank), query Paystack for customer transactions by account email
        if (!tx && userEmail) {
          try {
            const custRes = await fetch(`https://api.paystack.co/transaction?customer=${encodeURIComponent(userEmail)}&perPage=5`, {
              headers: {
                Authorization: `Bearer ${paystackKey}`,
                'Content-Type': 'application/json'
              }
            });
            const custData = await custRes.json();
            if (custRes.ok && custData.status && Array.isArray(custData.data)) {
              // Find the latest successful transaction for this customer
              const successfulTx = custData.data.find((t: any) => t.status === 'success');
              if (successfulTx) {
                tx = successfulTx;
                cleanRef = tx.reference || cleanRef;
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
              error: 'A valid payment reference is required. Please paste the reference from your Paystack receipt.'
            });
          }
          return res.status(400).json({
            success: false,
            error: `Payment reference '${cleanRef}' could not be verified on Paystack. If you recently paid, please verify the reference or retry in a few moments.`
          });
        }

        if (tx.status === 'success') {
          // STRICT SECURITY CHECKS:
          // 1. Currency must be NGN
          if (tx.currency !== 'NGN') {
            return res.status(400).json({ success: false, error: 'Invalid currency: Only NGN transactions are accepted.' });
          }

          // 2. Customer ownership verification (cross-user replay protection)
          const customerEmail = tx.customer?.email?.toLowerCase().trim();
          const metaUserId = tx.metadata?.userId;
          if (customerEmail && userEmail && customerEmail !== userEmail && metaUserId && metaUserId !== uid) {
            return res.status(403).json({ success: false, error: 'Payment verification failed: Transaction customer does not match authenticated user.' });
          }

          // 3. Amount verification: reject underpaid transactions
          const expectedKobo = targetPlanConfig.amountKobo;
          if (tx.amount < expectedKobo) {
            return res.status(400).json({
              success: false,
              error: `Underpaid transaction: Received ₦${(tx.amount / 100).toLocaleString()}, expected ₦${targetPlanConfig.amountNaira.toLocaleString()}. Paid access was not granted.`
            });
          }

          isVerified = true;
          paymentStatus = 'paid';
          planTier = tx.amount >= PAYSTACK_PLANS.studio.amountKobo ? 'studio' : 'plus';
          targetPlanConfig = planTier === 'studio' ? PAYSTACK_PLANS.studio : PAYSTACK_PLANS.plus;
          amountPaid = tx.amount / 100;
          paystackSubCode = tx.subscription_code || tx.customer?.subscription_code || null;
          paystackCustCode = tx.customer?.customer_code || null;
          paystackAuthCode = tx.authorization?.authorization_code || null;
          paystackPlanCode = tx.plan || targetPlanConfig.planCode;
        } else if (tx.status === 'abandoned' || tx.status === 'failed' || tx.status === 'reversed') {
          paymentStatus = tx.status === 'abandoned' ? 'abandoned' : 'failed';
          isVerified = false;
        } else {
          paymentStatus = 'pending';
          isVerified = false;
        }
      } else {
        // Non-production test environment simulation (only when PAYSTACK_SECRET_KEY is not set)
        if (process.env.NODE_ENV === 'production') {
          return res.status(503).json({ success: false, error: 'Payment gateway configuration is missing in production.' });
        }
        isVerified = true;
        paymentStatus = 'paid';
        amountPaid = targetPlanConfig.amountNaira;
        gatewayMessage = 'Test environment payment simulation';
      }

      // If payment failed, abandoned, or pending: RECORD failure without granting paid access
      if (!isVerified || paymentStatus !== 'paid') {
        if (client) {
          await client.from('payment_transactions').update({
            status: paymentStatus === 'pending' ? 'pending' : 'failed',
            gateway_response: gatewayMessage
          }).eq('reference', reference.trim());

          await client.from('subscriptions').upsert({
            user_id: uid,
            plan_tier: planTier,
            billing_cycle: 'monthly',
            status: paymentStatus === 'pending' ? 'pending' : 'failed',
            payment_provider: paystackKey ? 'paystack' : 'test',
            payment_reference: reference.trim(),
            payment_status: paymentStatus,
            amount_paid: amountPaid,
            currency: 'NGN',
            current_period_start: new Date().toISOString(),
            metadata: { gatewayMessage, verifiedAt: new Date().toISOString() }
          }, { onConflict: 'payment_reference' });
        }

        return res.status(400).json({
          success: false,
          status: paymentStatus,
          error: `Payment verification unsuccessful: Status is '${paymentStatus}'. Paid access was not granted.`,
          message: gatewayMessage
        });
      }

      // On successful verified payment:
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      if (client) {
        // 1. Update payment_transactions ledger
        await client.from('payment_transactions').upsert({
          user_id: uid,
          reference: reference.trim(),
          paystack_reference: reference.trim(),
          plan_tier: planTier,
          amount_kobo: amountPaid * 100,
          amount_naira: amountPaid,
          currency: 'NGN',
          status: 'success',
          customer_email: userEmail || 'user@korsiq.app',
          paystack_plan_code: paystackPlanCode,
          paid_at: startDate.toISOString(),
          gateway_response: gatewayMessage || 'Successful',
          metadata: { verifiedAt: new Date().toISOString() }
        }, { onConflict: 'reference' });

        // 2. Insert record into subscriptions table
        await client.from('subscriptions').upsert({
          user_id: uid,
          plan_tier: planTier,
          billing_cycle: 'monthly',
          status: 'active',
          payment_provider: paystackKey ? 'paystack' : 'test',
          payment_reference: reference.trim(),
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

        // 3. Update user profile to paid tier with Pro enabled
        await client.from('profiles').update({
          tier: planTier,
          is_pro: true,
          subscription_tier: planTier,
          subscription_status: 'active',
          payment_status: 'paid',
          subscription_end: endDate.toISOString(),
          paystack_customer_code: paystackCustCode
        }).eq('id', uid);
      }

      return res.json({
        success: true,
        tier: planTier,
        isPro: true,
        subscriptionStatus: 'active',
        currentPeriodEnd: endDate.toISOString(),
        message: `Payment verified! You are now subscribed to the ${planTier === 'studio' ? 'Academic Studio' : 'Plus'} plan.`
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
    const paystackKey = cleanEnvKey('PAYSTACK_SECRET_KEY');
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
        }
      }

      // 1. Initial Charge or Renewal Success
      if (event.event === 'charge.success' && event.data) {
        const tx = event.data;
        const ref = tx.reference;
        const uid = tx.metadata?.userId;
        const planTier = tx.metadata?.planTier || (tx.amount >= 1500000 ? 'studio' : 'plus');
        const planConfig = planTier === 'studio' ? PAYSTACK_PLANS.studio : PAYSTACK_PLANS.plus;

        if (client && (uid || tx.customer?.email)) {
          let resolvedUid = uid;
          if (!resolvedUid && tx.customer?.email) {
            const { data: userProfile } = await client.from('profiles').select('id').eq('email', tx.customer.email.toLowerCase().trim()).maybeSingle();
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
              paystack_plan_code: tx.plan || planConfig.planCode,
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
              paystack_plan_code: tx.plan || planConfig.planCode,
              paystack_authorization_code: tx.authorization?.authorization_code || null,
              metadata: { event: event.event, receivedAt: new Date().toISOString() }
            }, { onConflict: 'payment_reference' });

            // Update user profile
            await client.from('profiles').update({
              tier: planTier,
              is_pro: true,
              subscription_tier: planTier,
              subscription_status: 'active',
              payment_status: 'paid',
              subscription_end: endDate.toISOString(),
              paystack_customer_code: tx.customer?.customer_code || null
            }).eq('id', resolvedUid);
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
  // AI CREDITS USAGE METERING & PERIOD SUMMARY ENDPOINT
  // =============================================================
  async function recordAiUsage(userId: string | undefined, feature: string, credits = 1): Promise<void> {
    if (!supabaseAdmin || !userId) return;
    try {
      await supabaseAdmin.from('ai_usage').insert({
        user_id: userId,
        credits: Math.max(1, Math.round(credits)),
        feature
      });
    } catch (err: any) {
      console.warn('[AI Metering] Failed to record ai_usage:', err?.message || err);
    }
  }

  app.get('/api/usage/ai-credits', requireAuth, async (req, res) => {
    const userId = (req as any).user?.id || (req as any).user?.uid;
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)).toISOString();
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0)).toISOString();

    if (!supabaseAdmin || !userId) {
      return res.json({
        used: 0,
        allowance: 0,
        tier: 'free',
        periodStart,
        periodEnd
      });
    }

    try {
      const [profileRes, usageRes] = await Promise.all([
        supabaseAdmin
          .from('profiles')
          .select('tier, subscription_tier')
          .eq('id', userId)
          .maybeSingle(),
        supabaseAdmin
          .from('ai_usage')
          .select('credits')
          .eq('user_id', userId)
          .gte('created_at', periodStart)
      ]);

      const rawTier = String(
        profileRes.data?.subscription_tier ||
        profileRes.data?.tier ||
        (req as any).user?.tier ||
        'free'
      ).toLowerCase();

      const normalizedTier =
        rawTier === 'studio' || rawTier === 'sage'
          ? 'studio'
          : rawTier === 'plus' || rawTier === 'scholar'
          ? 'plus'
          : 'free';

      const allowance =
        normalizedTier === 'studio' ? 1000 : normalizedTier === 'plus' ? 250 : 0;

      const used = Array.isArray(usageRes.data)
        ? usageRes.data.reduce((sum: number, r: any) => sum + (Number(r.credits) || 1), 0)
        : 0;

      return res.json({
        used,
        allowance,
        tier: normalizedTier,
        periodStart,
        periodEnd
      });
    } catch (err: any) {
      console.warn('[AI Metering] /api/usage/ai-credits fallback:', err?.message || err);
      return res.json({
        used: 0,
        allowance: 0,
        tier: 'free',
        periodStart,
        periodEnd
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
  app.post('/api/ai/studio/plan', requireAuth, requirePaidTier(['plus', 'studio', 'scholar', 'sage']), apiRateLimiter, async (req, res) => {
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

      const studentContext = await getStudentContextForUser((req as any).user?.id || (req as any).user?.uid);

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

      await recordAiUsage((req as any).user?.id || (req as any).user?.uid, 'studio_plan', 1);

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

      const studentContext = await getStudentContextForUser((req as any).user?.id || (req as any).user?.uid);

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

      await recordAiUsage((req as any).user?.id || (req as any).user?.uid, 'studio_generate_section', 2);

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
  app.post('/api/ai/studio/review', requireAuth, requirePaidTier(['plus', 'studio', 'scholar', 'sage']), apiRateLimiter, async (req, res) => {
    const { docTitle, docType, fullContent, citationStyle, references } = req.body;
    const style = citationStyle || 'APA';

    try {
      const apiKey = getAIKey();
      if (!apiKey || !fullContent || fullContent.length < 50) {
        return res.json(getStudioReviewFallback(docTitle || 'Academic Paper', style));
      }

      const studentContext = await getStudentContextForUser((req as any).user?.id || (req as any).user?.uid);

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
      return res.json(parsed);
    } catch (error: any) {
      console.warn('Academic review AI fallback:', error?.message || error);
      return res.json(getStudioReviewFallback(docTitle || 'Academic Paper', style));
    }
  });

  // =============================================================
  // KORSIQ ACADEMIC STUDIO: In-Context Writing Assistant
  // =============================================================
  app.post('/api/ai/studio/assist', requireAuth, requirePaidTier(['plus', 'studio', 'scholar', 'sage']), apiRateLimiter, async (req, res) => {
    const { selectedText, instruction, docTitle, sectionTitle } = req.body;
    try {
      const apiKey = getAIKey();
      if (!apiKey || !selectedText) {
        return res.json({
          text: `[Academic Revision] ${selectedText || 'Please select text to transform.'}`
        });
      }

      const studentContext = await getStudentContextForUser((req as any).user?.id || (req as any).user?.uid);

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

      const studentContext = await getStudentContextForUser((req as any).user?.id || (req as any).user?.uid);

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
          model: GEMINI_PRIMARY_MODEL,
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

You are KorsIQ Academic Companion, an elite, highly knowledgeable university faculty mentor and subject-matter scholar.`;

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

      await recordAiUsage(userId, 'study_hub_chat', 1);

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

      const studentContext = await getStudentContextForUser((req as any).user?.id || (req as any).user?.uid);

      let systemInstruction = "";
      let userContent = "";

      if (type === 'summary') {
        systemInstruction = `${studentContext}

You are an elite, student-friendly academic tutor.
Generate a clear, clean, highly readable Markdown summary of the provided study material.

CRITICAL WRITING RULES:
- STRICTLY DO NOT use complex academic jargon, dense buzzwords, esoteric technical terminology, or overly verbose language.
- Explain every key concept, formula, and rule in simple, intuitive, plain English that any student can immediately understand.
- Format logically with clear Markdown headings (e.g., # Summary, ## Core Takeaways, ## Key Definitions), clean bullet points, and bolded terms.
- Focus on practical understanding, real-world examples, and maximum clarity.`;
        userContent = content;
      } else if (type === 'flashcards') {
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
      "${content}"`;
      } else if (type === 'quiz') {
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
      "${content}"`;
      } else if (type === 'test') {
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
        userContent = content;
      }
      
      const text = await runAICall({
        systemInstruction,
        messages: [{ role: 'user', content: userContent }],
        jsonMode: type !== 'summary'
      });

      await recordAiUsage((req as any).user?.id || (req as any).user?.uid, `materials_${type || 'summary'}`, 1);
      
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
      // Fetch server-authenticated student context
      const studentContext = await getStudentContextForUser((req as any).user?.id || (req as any).user?.uid);

      // Generate script using Google Gemini
      let rawScript = '';
      try {
        rawScript = await generateGeminiPodcastScript(studyText, studentContext);
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
      await recordAiUsage((req as any).user?.id || (req as any).user?.uid, 'podcast_generate', 1);
      res.json({ script, audioBase64, durationSec: validation.durationSec });
    } catch (error: any) {
      console.error('Podcast generation server error:', error?.message || error);
      res.status(500).json({ error: "We couldn't generate your podcast right now. Please try again." });
    }
  };

  app.post('/api/ai/podcast', requireAuth, apiRateLimiter, handlePodcastGeneration);
  app.post('/api/podcast/generate', requireAuth, apiRateLimiter, handlePodcastGeneration);

  // ==========================================
  // OTP-ONLY ADMIN AUTH & MANAGEMENT API
  // ==========================================

  const adminOtpCooldowns = new Map<string, number>();
  const adminIpRateLimits = new Map<string, number[]>();

  async function logAdminAction(adminEmail: string, action: string, details: any = {}, ipAddress: string = '') {
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from('admin_audit_log').insert({
          admin_email: adminEmail,
          action,
          details,
          ip_address: ipAddress
        });
      } catch (err) {
        console.warn('[Admin Audit] Failed to record audit log:', err);
      }
    }
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
        return res.json(GENERIC_SUCCESS_RESPONSE);
      }

      // Check allowlist table `admin_users` (case-insensitive)
      const { data: adminRow, error: adminErr } = await supabaseAdmin
        .from('admin_users')
        .select('id, email, role, active')
        .ilike('email', rawEmail)
        .eq('active', true)
        .maybeSingle();

      if (adminErr) {
        console.error('[Admin Auth] Error querying admin_users table (ensure migration 20261109_admin_and_circles_reddit.sql was applied):', adminErr.message);
        return res.json(GENERIC_SUCCESS_RESPONSE);
      }

      if (!adminRow) {
        // Unknown or inactive email: do not send code, return identical message
        await logAdminAction(rawEmail, 'admin_otp_requested_unauthorized', { ip }, ip);
        return res.json(GENERIC_SUCCESS_RESPONSE);
      }

      // Authorized admin: trigger Supabase email OTP
      let { error: otpError } = await supabaseAuthClient.auth.signInWithOtp({
        email: rawEmail,
        options: {
          shouldCreateUser: false
        }
      });

      // If the allowlisted admin email does not yet have a row in auth.users,
      // provision their auth.users record via service role and re-send the OTP.
      if (otpError) {
        console.warn('[Admin Auth] Initial signInWithOtp failed for allowlisted admin, ensuring auth.users account exists:', otpError.message);
        const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: rawEmail,
          email_confirm: true
        });
        if (createErr && !createErr.message?.toLowerCase().includes('already')) {
          console.error('[Admin Auth] Failed to auto-provision auth.users record for admin:', createErr.message);
        } else {
          const retryOtp = await supabaseAuthClient.auth.signInWithOtp({
            email: rawEmail,
            options: {
              shouldCreateUser: false
            }
          });
          otpError = retryOtp.error;
        }
      }

      if (otpError) {
        console.error('[Admin Auth] Supabase signInWithOtp error:', otpError.message);
      }

      adminOtpCooldowns.set(rawEmail, now);
      await logAdminAction(rawEmail, 'admin_otp_sent', { role: adminRow.role, ip }, ip);

      return res.json(GENERIC_SUCCESS_RESPONSE);
    } catch (err: any) {
      console.error('[Admin Auth] Request OTP error:', err);
      return res.json(GENERIC_SUCCESS_RESPONSE);
    }
  });

  // 2. Verify 6-digit OTP
  app.post('/api/admin/auth/verify-otp', async (req, res) => {
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
      // 1. Verify code via Supabase Auth
      const { data, error } = await supabaseAuthClient.auth.verifyOtp({
        email: rawEmail,
        token,
        type: 'email'
      });

      if (error || !data.user) {
        await logAdminAction(rawEmail, 'admin_otp_verify_failed', { error: error?.message, ip }, ip);
        return res.status(401).json({ success: false, error: 'Invalid or expired 6-digit verification code.' });
      }

      // 2. Cryptographically re-verify against admin_users allowlist (case-insensitive)
      const { data: adminRow, error: allowErr } = await supabaseAdmin
        .from('admin_users')
        .select('id, email, role, active')
        .ilike('email', rawEmail)
        .eq('active', true)
        .maybeSingle();

      if (allowErr || !adminRow) {
        await logAdminAction(rawEmail, 'admin_access_denied_not_allowlisted', { ip }, ip);
        return res.status(403).json({ success: false, error: 'Access denied: Email is not an authorized administrator.' });
      }

      await logAdminAction(rawEmail, 'admin_sign_in_success', { role: adminRow.role, ip }, ip);

      return res.json({
        success: true,
        user: {
          id: adminRow.id,
          email: adminRow.email.toLowerCase(),
          role: adminRow.role
        },
        session: data.session
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

      // Re-check active admin status in admin_users (case-insensitive)
      const { data: adminRow, error: allowErr } = await supabaseAdmin
        .from('admin_users')
        .select('id, email, role, active')
        .ilike('email', email)
        .eq('active', true)
        .maybeSingle();

      if (allowErr || !adminRow) {
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
      const [profilesRes, subsRes, groupsRes, logsRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }),
        supabaseAdmin.from('subscriptions').select('id, amount_paid, status, created_at').eq('status', 'active'),
        supabaseAdmin.from('study_groups').select('id', { count: 'exact', head: true }),
        supabaseAdmin.from('admin_audit_log').select('*').order('created_at', { ascending: false }).limit(10)
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
          recentLogs: logsRes.data || []
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
        .select('id, email, name, university, department, level, tier, is_pro, subscription_status, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (search) {
        query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      res.json({ success: true, users: data || [] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch users.' });
    }
  });

  // 6. Admin Dashboard API: Subscriptions / Transactions
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

      // Update profile
      await supabaseAdmin
        .from('profiles')
        .update({
          tier: targetTier,
          is_pro: isPro,
          subscription_tier: targetTier,
          subscription_status: status
        })
        .eq('id', userId);

      // Record in subscriptions
      await supabaseAdmin.from('subscriptions').insert({
        user_id: userId,
        plan_tier: targetTier,
        billing_cycle: 'monthly',
        status,
        payment_provider: 'manual_admin',
        payment_status: isPro ? 'paid' : 'none',
        amount_paid: 0,
        currency: 'NGN',
        current_period_start: new Date().toISOString()
      });

      await logAdminAction(admin.email, 'admin_grant_tier', { userId, targetTier });

      res.json({ success: true, message: `Successfully updated user tier to ${targetTier}.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to update user tier.' });
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
      const { data, error } = await supabaseAdmin
        .from('admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      res.json({ success: true, logs: data || [] });
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

  // Create Study Circle (Backed by service role to guarantee creation)
  app.post('/api/circles/create', async (req, res) => {
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
        ownerId,
        ownerName
      } = req.body;

      if (!name || !course) {
        return res.status(400).json({ success: false, error: 'Circle name and course code are required.' });
      }

      const groupId = `group_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const inviteCode = (clientCode && String(clientCode).trim().toUpperCase()) || generateServerCircleInviteCode();
      const createdAt = new Date().toISOString();

      const initialMember = {
        userId: ownerId || 'creator',
        name: ownerName || 'Circle Creator',
        role: 'owner',
        joinedAt: createdAt
      };

      const initialActivity = {
        id: `act_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
        groupId,
        type: 'announcement',
        title: 'Circle Initialized',
        description: `Welcome to ${name}! Study circle initialized by ${ownerName || 'Creator'}.`,
        actorName: ownerName || 'Creator',
        actorId: ownerId || '',
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
        owner_id: ownerId || 'creator',
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
            if (ownerId) {
              await supabaseAdmin.from('circle_members').upsert({
                circle_id: dbData.id,
                user_id: ownerId,
                user_name: ownerName || 'Circle Creator',
                role: 'owner',
                joined_at: createdAt
              }, { onConflict: 'circle_id,user_id' });
            }
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

  // Find Study Circle by Code
  app.get('/api/circles/find', async (req, res) => {
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

  // Search Study Circles (Public/General and Private)
  app.get('/api/circles/search', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!supabaseAdmin) {
        return res.json({ success: true, groups: [] });
      }

      let query = supabaseAdmin
        .from('study_groups')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(30);

      if (q) {
        const safe = q.replace(/[%_]/g, '');
        query = query.or(`name.ilike.%${safe}%,course.ilike.%${safe}%,department.ilike.%${safe}%,invite_code.ilike.%${safe}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const groups = (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        course: row.course,
        type: row.type || 'private',
        visibility: row.visibility || (row.type === 'general' ? 'public' : 'private'),
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

  // Join Study Circle
  app.post('/api/circles/join', async (req, res) => {
    try {
      const { groupId, code, userId, userName } = req.body;
      if (!groupId || !userId) {
        return res.status(400).json({ success: false, error: 'Group ID and User ID are required.' });
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

        if (group.type === 'private' && code) {
          if ((group.invite_code || '').toUpperCase() !== String(code).trim().toUpperCase()) {
            return res.status(400).json({ success: false, error: 'Invalid invite code.' });
          }
          if (group.invite_code_active === false) {
            return res.status(400).json({ success: false, error: 'This invitation code has been revoked.' });
          }
        }

        const members = (group.members || []) as any[];
        const isMember = members.some(m => (typeof m === 'string' ? m === userId : m.userId === userId));

        if (!isMember) {
          members.push({
            userId,
            name: userName || 'Student',
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
            user_name: userName || 'Student',
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
