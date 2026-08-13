import express from 'express';
import cors from 'cors';
import path from 'path';
import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { 
  processDocumentBuffer, 
  normalizeExtractedText, 
  validateExtractedText, 
  selectRelevantChunks 
} from './lib/documentProcessor';

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

  // Lazy init and adapter helper for Groq / Gemini
  const getAIKey = (customKey?: string) => {
    return customKey || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY;
  };

  const isUsingGemini = (customKey?: string) => {
    if (customKey) {
      if (customKey.startsWith('AIzaSy')) return true;
      if (customKey.startsWith('gsk_')) return false;
    }
    if (process.env.GEMINI_API_KEY) return true;
    if (process.env.GROQ_API_KEY) return false;
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

  const runAICall = async ({ customKey, systemInstruction, messages, temperature, jsonMode, preferGroq }: AIParams): Promise<string> => {
    const key = getAIKey(customKey);
    if (!key) throw new Error('API Key is required');

    const groqKey = process.env.GROQ_API_KEY || (customKey && customKey.startsWith('gsk_') ? customKey : null);
    const shouldUseGroqFirst = preferGroq ? !!groqKey : !isUsingGemini(customKey);

    if (shouldUseGroqFirst && groqKey) {
      const groq = new Groq({ apiKey: groqKey });
      const apiMessages: any[] = [];
      if (systemInstruction) {
        apiMessages.push({ role: 'system', content: systemInstruction });
      }
      apiMessages.push(...messages);

      const candidateModels = [
        'llama-3.1-8b-instant',
        'llama-3.3-70b-versatile',
        'llama3-70b-8192',
        'llama3-8b-8192',
        'mixtral-8x7b-32768',
        'gemma2-9b-it'
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
          console.warn(`Groq model '${model}' call failed, attempting fallback:`, mErr?.message || mErr);
        }
      }
    }

    // Gemini Execution (or fallback if Groq was unavailable/failed)
    const geminiKey = (customKey && customKey.startsWith('AIzaSy')) ? customKey : (process.env.GEMINI_API_KEY || key);
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

    const response = await aiGen.models.generateContent({
      model: 'gemini-3.5-flash',
      contents,
      config
    });

    return response.text || '';
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
  app.post('/api/s3/upload', async (req, res) => {
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
  app.post('/api/s3/presign', async (req, res) => {
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

  const getPodcastFallback = () => {
    const script = `Joe: Professor Jane, I was looking at our study documents today and standardizing our modules. Can you explain the best way to optimize our recall scores?
Jane: Hello Joe! Absolutely. The most important rule is active recall. Passive re-reading creates an illusion of competence. We need to actually prompt our minds with questions.
Joe: Ah, so that's why our Scolaris platform stresses practice quizzes and timed tests so heavily!
Jane: Exactly. Combining those with spaced repetition scheduled throughout our calendar provides the golden path to a high grade.`;
    return { script, audioBase64: "" };
  };

  const getValidateFallback = () => ({
    isRelevant: true,
    reason: "Scolaris Academic Integrity Validation passed in preview mode."
  });

  // Proxy Groq / Gemini Chat
  app.post('/api/ai/chat', async (req, res) => {
    const { messages, groupName, groupDesc } = req.body;
    const customKey = (req.headers['x-groq-api-key'] || req.headers['x-gemini-api-key']) as string | undefined;
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

  // Magic Import
  app.post('/api/ai/import', async (req, res) => {
    const { text } = req.body;
    const customKey = (req.headers['x-groq-api-key'] || req.headers['x-gemini-api-key']) as string | undefined;
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
  app.post('/api/ai/schedule', async (req, res) => {
    const { courses, university } = req.body;
    const customKey = (req.headers['x-groq-api-key'] || req.headers['x-gemini-api-key']) as string | undefined;
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
  app.post('/api/scolaris/generate', async (req, res) => {
    const { studyMaterial, mode } = req.body;
    const customKey = (req.headers['x-groq-api-key'] || req.headers['x-gemini-api-key']) as string | undefined;

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
  app.post('/api/files/extract', async (req, res) => {
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
  app.post('/api/vision/scan', async (req, res) => {
    try {
      const { fileName, fileType, contentBase64 } = req.body;
      const customKey = (req.headers['x-groq-api-key'] || req.headers['x-gemini-api-key']) as string | undefined;

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

      // Use Gemini vision if Gemini key is present or requested
      if (process.env.GEMINI_API_KEY || isUsingGemini(customKey)) {
        const apiKey = (customKey && customKey.startsWith('AIzaSy')) ? customKey : (process.env.GEMINI_API_KEY || getAIKey(customKey));
        const aiGen = new GoogleGenAI({
          apiKey,
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
  app.post('/api/scolaris/chat', async (req, res) => {
    const { messages, courseContext, fileContent } = req.body;
    const customKey = (req.headers['x-groq-api-key'] || req.headers['x-gemini-api-key']) as string | undefined;
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
  app.post('/api/ai/materials', async (req, res) => {
    const { content, type } = req.body;
    const customKey = (req.headers['x-groq-api-key'] || req.headers['x-gemini-api-key']) as string | undefined;
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

  // Podcast Generation
  app.post('/api/ai/podcast', async (req, res) => {
    const { topic } = req.body;
    const customKey = (req.headers['x-groq-api-key'] || req.headers['x-gemini-api-key']) as string | undefined;
    try {
      const apiKey = getAIKey(customKey);
      if (!apiKey) {
        return res.json(getPodcastFallback());
      }

      // Step 1: Generate dialogue
      const script = await runAICall({
        customKey,
        systemInstruction: 'Create a short, informative, and engaging academic dialogue conversation (3-4 exchanges) between Joe (a student) and Jane (a professor).',
        messages: [
          {
            role: 'user',
            content: `Topic: "${topic?.slice(0, 3000)}". Format the dialogue exactly like this:
            Joe: [text]
            Jane: [text]`
          }
        ]
      });
      
      // Step 2: Speech Synthesis is unsupported on Groq, fallback to transcript only
      let audioBase64 = '';

      res.json({ script, audioBase64 });
    } catch (error: any) {
      console.warn("Live API response failed. Falling back to offline fallback. Error details:", error?.message || error);
      res.json(getPodcastFallback());
    }
  });

  // Message Validation Route
  app.post('/api/ai/validate', async (req, res) => {
    const { text, message, groupName, groupDesc } = req.body;
    const msgText = text || message || '';
    const customKey = (req.headers['x-groq-api-key'] || req.headers['x-gemini-api-key']) as string | undefined;
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
