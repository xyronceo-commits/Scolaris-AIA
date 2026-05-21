import express from 'express';
import cors from 'cors';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Lazy init helpers
  let aiClient: GoogleGenAI | null = null;
  const getAI = () => {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY is required');
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return aiClient;
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

  // Proxy Gemini Chat
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { messages, groupName, groupDesc } = req.body;
      if (!process.env.GEMINI_API_KEY) {
        return res.json({ 
          text: `[Scolaris AI Bot - Study Companion] Let's work on this together! Active recall and interactive flashcards are excellent tools for mastering "${groupName}". Let me know what concepts we should break down first!`
        });
      }
      const prompt = `You are the Scolaris AI Study Bot assigned to the group "${groupName}". 
      Group Purpose: ${groupDesc}. 
      Conversation History: ${JSON.stringify(messages)}. 
      Respond to the latest query as a helpful, academic, and slightly tactical AI assistant.`;
      const response = await getAI().models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt
      });
      res.json({ text: response.text });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error?.message || 'AI processing failed' });
    }
  });

  // Magic Import
  app.post('/api/ai/import', async (req, res) => {
    try {
      const { text } = req.body;
      if (!process.env.GEMINI_API_KEY) {
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
        return res.json(imported);
      }
      const response = await getAI().models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `Extract course metadata from this text: "${text}". If multiple courses exist, return a list.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                code: { type: "string" },
                title: { type: "string" },
                units: { type: "number" },
                difficulty: { type: "string", description: "One of: Easy, Medium, Hard" },
                description: { type: "string" }
              },
              required: ["code", "title", "units", "difficulty"]
            }
          }
        }
      });
      res.json(JSON.parse(response.text));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error?.message || 'Import failed' });
    }
  });

  // Generate Schedule
  app.post('/api/ai/schedule', async (req, res) => {
    try {
      const { courses, university } = req.body;
      if (!process.env.GEMINI_API_KEY) {
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
        return res.json(generated);
      }
      const response = await getAI().models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `Create a weekly study schedule (Mon-Sun) for a student at ${university} taking these courses: ${JSON.stringify(courses)}. Priority should be given to Hard courses and higher units. Allocate at least 10 sessions total across the week.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                courseId: { type: "string" },
                day: { type: "string" },
                duration: { type: "number" },
                mode: { type: "string" }
              },
              required: ["courseId", "day", "duration", "mode"]
            }
          }
        }
      });
      res.json(JSON.parse(response.text));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error?.message || 'Schedule generation failed' });
    }
  });

  // Study Materials
  app.post('/api/ai/materials', async (req, res) => {
    try {
      const { content, type } = req.body;
      
      if (!process.env.GEMINI_API_KEY) {
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
          return res.json(summary);
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
          return res.json(cards);
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
          return res.json(quiz);
        } else if (type === 'test') {
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
          return res.json(test);
        }
      }

      const config: any = {};
      let prompt = "";

      if (type === 'summary') {
        prompt = `Generate a structured markdown summary of this content: ${content}`;
      } else if (type === 'flashcards') {
        prompt = `Generate a list of 5-8 high-quality flashcards (Front/Back) from this content: ${content}`;
        config.responseMimeType = "application/json";
        config.responseSchema = {
          type: "array",
          items: {
            type: "object",
            properties: {
              front: { type: "string" },
              back: { type: "string" }
            },
            required: ["front", "back"]
          }
        };
      } else if (type === 'quiz') {
        prompt = `Generate a quiz with 5 multiple-choice questions from this content: ${content}`;
        config.responseMimeType = "application/json";
        config.responseSchema = {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              answer: { type: "string" },
              explanation: { type: "string" }
            },
            required: ["question", "options", "answer", "explanation"]
          }
        };
      } else if (type === 'test') {
        prompt = `Generate a comprehensive exam simulation with 8 questions from this content: ${content}.
Include 4 Multiple-Choice questions and 4 True/False questions.
Make sure the True/False questions have exactly two options: ["True", "False"].`;
        config.responseMimeType = "application/json";
        config.responseSchema = {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              answer: { type: "string" },
              explanation: { type: "string" }
            },
            required: ["question", "options", "answer", "explanation"]
          }
        };
      }
      
      const response = await getAI().models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config
      });
      
      const text = response.text;
      
      if (type === 'summary') {
        res.json(text);
      } else {
        res.json(JSON.parse(text));
      }
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error?.message || 'Material generation failed' });
    }
  });

  // Podcast Generation
  app.post('/api/ai/podcast', async (req, res) => {
    try {
      const { topic } = req.body;
      
      if (!process.env.GEMINI_API_KEY) {
        const script = `Joe: Professor Jane, I was looking at our study documents today and standardizing our modules. Can you explain the best way to optimize our recall scores?
Jane: Hello Joe! Absolutely. The most important rule is active recall. Passive re-reading creates an illusion of competence. We need to actually prompt our minds with questions.
Joe: Ah, so that's why our Scolaris platform stresses practice quizzes and timed tests so heavily!
Jane: Exactly. Combining those with spaced repetition scheduled throughout our calendar provides the golden path to a high grade.`;
        return res.json({ script, audioBase64: "" });
      }

      // Step 1: Generate dialogue
      const scriptResponse = await getAI().models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `Create short academic conversation (3-4 exchanges) between Joe (a student) and Jane (a professor) about this content: "${topic?.slice(0, 3000)}".
Use format:
Joe: [text]
Jane: [text]`
      });
      
      const script = scriptResponse.text || '';
      
      // Step 2: Speech Synthesis in multi-speaker layout
      let audioBase64 = '';
      try {
        const ttsResponse = await getAI().models.generateContent({
          model: 'gemini-3.1-flash-tts-preview',
          contents: [{ parts: [{ text: `TTS the following conversation: ${script}` }] }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  {
                    speaker: 'Joe',
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: 'Kore' }
                    }
                  },
                  {
                    speaker: 'Jane',
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: 'Puck' }
                    }
                  }
                ]
              }
            }
          }
        });
        audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
      } catch (e) {
        console.warn('Speech synthesis failed, returning transcript only:', e);
      }

      res.json({ script, audioBase64 });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error?.message || 'Podcast failed' });
    }
  });

  // Message Validation Route
  app.post('/api/ai/validate', async (req, res) => {
    try {
      const { text, groupName, groupDesc } = req.body;
      if (!process.env.GEMINI_API_KEY) {
        return res.json({ isRelevant: true, reason: "Scolaris Academic Integrity Validation passed in preview mode." });
      }
      const response = await getAI().models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `Evaluate if the following message is relevant to the purpose of the study group "${groupName}".
        Group Description: ${groupDesc}
        Message: "${text}"
        
        Respond with a JSON object: { "isRelevant": boolean, "reason": string }`,
        config: { responseMimeType: 'application/json' }
      });
      
      res.json(JSON.parse(response.text));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error?.message || 'Validation failed' });
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
