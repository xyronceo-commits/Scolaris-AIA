import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Crisp Favicon SVG with rounded container
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <rect width="512" height="512" rx="128" fill="#0f172a"/>
  <rect width="512" height="512" rx="128" fill="url(#bg-grad)" />
  <defs>
    <linearGradient id="bg-grad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
  </defs>
  <g transform="translate(0, 30)" fill="#ffffff">
    <!-- Mortarboard Diamond Top Outline -->
    <polygon points="256,36 468,156 256,276 44,156" fill="none" stroke="#ffffff" stroke-width="16" stroke-linejoin="round"/>
    
    <!-- Vertical Center Divider -->
    <line x1="256" y1="36" x2="256" y2="276" stroke="#ffffff" stroke-width="8" stroke-dasharray="8,6"/>

    <!-- LEFT: Human Brain Anatomy Folds -->
    <g fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 238,64 C 195,59 155,84 125,114 C 100,139 85,164 95,189 C 105,214 135,234 175,244 C 205,252 230,239 240,219" />
      <path d="M 232,89 C 197,94 167,119 147,144 C 132,164 132,189 152,204 C 172,219 207,214 232,194" />
      <path d="M 217,114 C 187,119 172,139 167,164 C 165,184 182,194 207,184" />
      <path d="M 242,114 C 222,124 207,139 212,159 C 217,174 237,169 245,154" />
      <path d="M 192,79 C 172,94 147,124 137,149" />
      <path d="M 167,189 C 147,204 132,214 122,199" />
      <path d="M 222,229 C 197,234 172,224 157,209" />
      <path d="M 242,139 C 232,144 227,154 232,164 C 237,171 245,167 245,159" />
    </g>

    <!-- RIGHT: AI Digital Circuit Board / Neural Traces -->
    <g fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 272,61 L 332,61 L 382,101 L 422,101" />
      <path d="M 272,96 L 312,96 L 342,126 L 392,126 L 432,151" />
      <path d="M 272,131 L 297,131 L 322,156 L 372,156 L 402,181" />
      <path d="M 272,166 L 312,166 L 337,191 L 382,191" />
      <path d="M 272,201 L 292,201 L 322,231 L 362,231" />
      <path d="M 272,236 L 302,236 L 327,251" />

      <path d="M 332,61 L 332,91" />
      <path d="M 382,101 L 382,141" />
      <path d="M 322,156 L 322,186" />
      <path d="M 372,156 L 372,211" />
      <path d="M 312,96 L 312,146" />

      <rect x="337" y="136" width="22" height="22" fill="#ffffff" rx="3" stroke="none"/>
    </g>

    <!-- Circuit Connection Nodes -->
    <g fill="#ffffff">
      <circle cx="332" cy="61" r="7" />
      <circle cx="422" cy="101" r="7" />
      <circle cx="392" cy="126" r="7" />
      <circle cx="432" cy="151" r="7" />
      <circle cx="402" cy="181" r="7" />
      <circle cx="382" cy="191" r="7" />
      <circle cx="362" cy="231" r="7" />
      <circle cx="327" cy="251" r="7" />
      <circle cx="382" cy="141" r="6" />
      <circle cx="322" cy="186" r="6" />
      <circle cx="312" cy="146" r="6" />
    </g>

    <!-- Skullcap Base -->
    <path d="M 144,191 L 256,247 L 368,191 L 368,241 C 368,281 319,316 256,316 C 193,316 144,281 144,241 Z" fill="#ffffff"/>

    <!-- Tassel Loop & Dangling String -->
    <circle cx="468" cy="156" r="9" fill="#ffffff"/>
    <path d="M 468,165 C 472,211 475,251 472,296" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
    <circle cx="472" cy="303" r="10" fill="#ffffff"/>
    <path d="M 461,313 L 483,313 L 488,371 L 456,371 Z" fill="#ffffff"/>
  </g>
</svg>`;

// 2. OpenGraph / Twitter Banner (1200x630 SVG)
const ogBannerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <linearGradient id="brand-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#818cf8" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#6366f1" flood-opacity="0.35"/>
    </filter>
  </defs>

  <!-- Background Canvas -->
  <rect width="1200" height="630" fill="url(#bg)" />

  <!-- Decorative Atmosphere Orbs -->
  <circle cx="200" cy="150" r="300" fill="#312e81" opacity="0.3" filter="blur(80px)" />
  <circle cx="1000" cy="500" r="350" fill="#4c1d95" opacity="0.35" filter="blur(90px)" />
  <circle cx="600" cy="315" r="250" fill="#6366f1" opacity="0.1" filter="blur(60px)" />

  <!-- Content Container -->
  <g transform="translate(100, 100)" filter="url(#glow)">
    
    <!-- LEFT SIDE: Official Scolaris AI Logo Mark -->
    <g transform="translate(0, 30)">
      <!-- Mortarboard Diamond Outline Top -->
      <polygon points="200,20 370,110 200,200 30,110" fill="none" stroke="#FFFFFF" stroke-width="12" stroke-linejoin="round"/>
      
      <!-- Vertical Center Divider -->
      <line x1="200" y1="20" x2="200" y2="200" stroke="#FFFFFF" stroke-width="6" stroke-dasharray="6,4"/>

      <!-- LEFT: Brain Anatomy -->
      <g fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 185,42 C 150,38 120,58 96,82 C 78,102 65,122 73,142 C 81,162 105,178 137,186 C 160,192 180,182 188,166" />
        <path d="M 180,62 C 152,66 128,86 112,106 C 100,122 100,142 116,154 C 132,166 160,162 180,146" />
        <path d="M 168,82 C 144,86 132,102 128,122 C 126,138 140,146 160,138" />
        <path d="M 188,82 C 172,90 160,102 164,118 C 168,130 184,126 190,114" />
      </g>

      <!-- RIGHT: AI Digital Circuit -->
      <g fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 215,40 L 260,40 L 300,70 L 330,70" />
        <path d="M 215,68 L 245,68 L 270,90 L 310,90 L 340,110" />
        <path d="M 215,95 L 235,95 L 255,115 L 295,115 L 320,135" />
        <path d="M 215,122 L 245,122 L 265,142 L 300,142" />
        <path d="M 215,150 L 230,150 L 255,175 L 285,175" />

        <rect x="265" y="100" width="18" height="18" fill="#FFFFFF" rx="3" stroke="none"/>
      </g>

      <!-- Circuit Nodes -->
      <g fill="#FFFFFF">
        <circle cx="260" cy="40" r="5" />
        <circle cx="330" cy="70" r="5" />
        <circle cx="310" cy="90" r="5" />
        <circle cx="340" cy="110" r="5" />
        <circle cx="320" cy="135" r="5" />
        <circle cx="300" cy="142" r="5" />
        <circle cx="285" cy="175" r="5" />
      </g>

      <!-- Skullcap Base -->
      <path d="M 112,150 L 200,194 L 288,150 L 288,190 C 288,220 250,246 200,246 C 150,246 112,220 112,190 Z" fill="#FFFFFF"/>

      <!-- Tassel -->
      <circle cx="370" cy="110" r="7" fill="#FFFFFF"/>
      <path d="M 370,117 C 373,150 375,180 373,215" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
      <circle cx="373" cy="222" r="8" fill="#FFFFFF"/>
      <path d="M 364,230 L 382,230 L 386,275 L 360,275 Z" fill="#FFFFFF"/>
    </g>

    <!-- RIGHT SIDE: Typography & Messaging -->
    <g transform="translate(430, 80)">
      <!-- Badge -->
      <rect x="0" y="0" width="220" height="36" rx="18" fill="rgba(99, 102, 241, 0.25)" stroke="rgba(129, 140, 248, 0.4)" stroke-width="1.5" />
      <text x="110" y="23" text-anchor="middle" font-family="'Inter', sans-serif" font-weight="700" font-size="13" fill="#a5b4fc" letter-spacing="2">AI STUDY PLATFORM</text>

      <!-- Main Title -->
      <text x="0" y="110" font-family="'Inter', 'SF Pro Display', sans-serif" font-weight="900" font-size="64" fill="#FFFFFF" letter-spacing="-1">
        Scolaris<tspan fill="#818cf8"> AI</tspan>
      </text>

      <!-- Subtitle Tagline -->
      <text x="0" y="160" font-family="'Inter', sans-serif" font-weight="700" font-size="28" fill="#e2e8f0" letter-spacing="-0.5">
        Study Smarter. Learn Faster.
      </text>

      <!-- Description Line -->
      <text x="0" y="210" font-family="'Inter', sans-serif" font-weight="400" font-size="19" fill="#94a3b8">
        Turn course materials into instant flashcards, quizzes,
      </text>
      <text x="0" y="240" font-family="'Inter', sans-serif" font-weight="400" font-size="19" fill="#94a3b8">
        AI podcasts, and collaborative study circles.
      </text>

      <!-- Feature Tags -->
      <g transform="translate(0, 280)">
        <rect x="0" y="0" width="130" height="32" rx="8" fill="rgba(255,255,255,0.08)" />
        <text x="65" y="20" text-anchor="middle" font-family="'Inter', sans-serif" font-weight="600" font-size="13" fill="#cbd5e1">✦ Smart Notes</text>

        <rect x="142" y="0" width="130" height="32" rx="8" fill="rgba(255,255,255,0.08)" />
        <text x="207" y="20" text-anchor="middle" font-family="'Inter', sans-serif" font-weight="600" font-size="13" fill="#cbd5e1">✦ AI Flashcards</text>

        <rect x="284" y="0" width="130" height="32" rx="8" fill="rgba(255,255,255,0.08)" />
        <text x="349" y="20" text-anchor="middle" font-family="'Inter', sans-serif" font-weight="600" font-size="13" fill="#cbd5e1">✦ AI Podcasts</text>
      </g>
    </g>
  </g>
</svg>`;

async function run() {
  console.log('Generating Scolaris AI SEO assets & icons...');

  // Save SVGs
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSvg);
  fs.writeFileSync(path.join(publicDir, 'og-image.svg'), ogBannerSvg);

  // Generate PNG icons using Sharp
  const faviconBuffer = Buffer.from(faviconSvg);
  const ogBuffer = Buffer.from(ogBannerSvg);

  // 180x180 Apple Touch Icon
  await sharp(faviconBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  // 192x192 PWA Icon
  await sharp(faviconBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'scolaris-logo-192.png'));

  // 512x512 PWA Icon
  await sharp(faviconBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'scolaris-logo-512.png'));

  // 32x32 Favicon.ico
  await sharp(faviconBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon.ico'));

  // 1200x630 OpenGraph Banner PNG
  await sharp(ogBuffer)
    .resize(1200, 630)
    .png()
    .toFile(path.join(publicDir, 'og-image.png'));

  console.log('Successfully generated all Scolaris AI brand assets, icons, and OpenGraph images!');
}

run().catch(err => {
  console.error('Error generating assets:', err);
  process.exit(1);
});
