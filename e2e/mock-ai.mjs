/**
 * Mock OpenAI-compatible AI server for tests (fork addition).
 * The NutriTrace server is pointed at it with
 *   AI_PROVIDER=oai-compat AI_BASE_URL=http://127.0.0.1:4010 AI_MODEL=mock AI_ENABLED=true
 * It answers by recognising which feature is asking (from the system prompt):
 *   - Smart Log parser  → splits the text into foods, deterministic estimates
 *   - Photo estimate    → a fixed protein-shake estimate (414 ml, 170 kcal)
 *   - Trace chat        → a plain reply
 * Special inputs exercise failure paths:
 *   text containing "BADJSON"  → returns prose, not JSON
 *   text containing "SLOWAI"   → waits 4 s before answering
 */
import http from 'node:http';

const PORT = Number(process.env.MOCK_AI_PORT || 4010);
const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks', 'snack'];

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(p => p.text || '').join(' ');
  return '';
}

const QUESTION_RE = /\?\s*$|^(how|what|why|when|which|can|should|is|are|do|does|tell me)\b/i;

function parseFoods(text) {
  const lower = text.toLowerCase();
  if (QUESTION_RE.test(text.trim())) return { intent: 'chat', meal: null, items: [] };
  const meal = MEALS.find(m => lower.includes(m)) || null;
  const slot = meal ? (meal === 'snack' ? 'Snacks' : meal[0].toUpperCase() + meal.slice(1)) : null;
  const cleaned = lower
    .replace(/\b(log|i had|i ate|had|ate|for|to|in|my|a|an|the|some)\b/g, ' ')
    .replace(new RegExp(`\\b(${MEALS.join('|')})\\b`, 'g'), ' ');
  const parts = cleaned.split(/,|\band\b|\bplus\b|\bwith\b/).map(s => s.trim()).filter(Boolean);
  const items = parts.map((p, i) => {
    const m = p.match(/^(\d+(?:\.\d+)?)\s+(.*)$/);
    const quantity = m ? Number(m[1]) : 1;
    let name = (m ? m[2] : p).trim();
    let brand = null;
    const b = name.match(/^(costco|mcdonald'?s|chobani|fairlife)\s+(.*)$/);
    if (b) { brand = b[1][0].toUpperCase() + b[1].slice(1); name = b[2]; }
    const kcal = 100 + (name.length * 13 + i * 7) % 400;
    return {
      name, quantity, unit: null, kind: 'food', brand,
      estimate: { grams: 150 * quantity, calories: kcal * quantity, proteins: 10 * quantity,
                  carbohydrates: 20 * quantity, fat: (kcal - 120) / 9 * quantity, fiber: 2, sugars: 3, sodium: 300 },
    };
  });
  return { intent: 'log', meal: slot, items };
}

// Test scenarios: POST /__mock/photo {"scenario":"pizza"|"salad"|"default"} picks the next photo answer.
let photoScenario = 'default';
const LASAGNA = {
  name: 'Lasagna', serving: { amount: 2700, unit: 'g', label: '1 full pan' },
  nutrition: { calories: 3600, proteins: 216, carbohydrates: 306, fat: 162 },
  divisible: { count: 9, unit: 'piece', typical: 1 }, shared: true, source: 'estimate', confidence: 'medium',
};
const TURKEY = {
  name: 'Roast turkey', serving: { amount: 3600, unit: 'g', label: '1 whole turkey' },
  nutrition: { calories: 6120, proteins: 1044, carbohydrates: 0, fat: 216 },
  divisible: { count: 24, unit: 'serving', typical: 1 }, shared: true, source: 'estimate', confidence: 'medium',
};
const PIZZA = {
  name: 'Pepperoni pizza', brand: null,
  serving: { amount: 800, unit: 'g', label: '1 large pizza' },
  nutrition: { calories: 2400, proteins: 100, carbohydrates: 260, fat: 100 },
  divisible: { count: 8, unit: 'slice' }, source: 'estimate', confidence: 'medium',
};
function salad(asked, answered) {
  const base = { name: 'Garden salad', serving: { amount: 250, unit: 'g', label: '1 bowl' },
    source: 'estimate', confidence: 'medium' };
  if (answered && /vinaigrette/i.test(answered)) return { ...base, nutrition: { calories: 180, proteins: 4, carbohydrates: 12, fat: 13 } };
  if (answered) return { ...base, nutrition: { calories: 320, proteins: 5, carbohydrates: 14, fat: 27 } };
  return { ...base, nutrition: { calories: 320, proteins: 5, carbohydrates: 14, fat: 27 },
    question: asked ? { text: 'Which dressing is on it?', choices: ['Ranch', 'Vinaigrette', 'None'] } : null };
}
const PHOTO = {
  name: 'Fairlife Core Power Vanilla', brand: 'Fairlife',
  serving: { amount: 414, unit: 'ml', label: '1 bottle (14 fl oz)' },
  nutrition: { calories: 170, proteins: 26, carbohydrates: 6, fat: 4.5, sugars: 5, calcium: 600 },
  source: 'label', confidence: 'high', note: 'Read from the bottle label.',
};

function answer(body) {
  const sys = (body.messages || []).filter(m => m.role === 'system').map(m => textOf(m.content)).join('\n');
  const user = textOf([...(body.messages || [])].reverse().find(m => m.role === 'user')?.content);
  if (/BADJSON/.test(user)) return 'Sure! Here are your foods: eggs and toast.';
  if (/food and water parser/i.test(sys)) return JSON.stringify(parseFoods(user));
  if (/estimate nutrition from a single food photo/i.test(sys)) {
    const asked = /Questions ARE allowed/.test(sys);
    const answered = (user.match(/The user answered: (.*)$/m) || [])[1] || '';
    if (photoScenario === 'pizza') return JSON.stringify(PIZZA);
    if (photoScenario === 'lasagna') return JSON.stringify(LASAGNA);
    if (photoScenario === 'turkey') return JSON.stringify(TURKEY);
    if (photoScenario === 'salad') return JSON.stringify(salad(asked, answered));
    return JSON.stringify(PHOTO);
  }
  if (/nutrition label parser/i.test(sys)) {
    if (photoScenario === 'label100') return JSON.stringify({ unit: 'ml', per_serving: false, calories: 28, carbohydrates: 6.5, sugars: 6, sodium: 4, proteins: 0, fat: 0 });
    return JSON.stringify({ portion: 248, unit: 'ml', per_serving: true, calories: 70, carbohydrates: 16, sugars: 15, sodium: 10, proteins: 0, fat: 0 });
  }
  if (/protein do i have left/i.test(user)) return 'You have 82 grams of protein left today.';
  return 'Mock Trace reply.';
}

http.createServer((req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', async () => {
    if (req.url.startsWith('/__mock/photo')) {
      try { photoScenario = JSON.parse(raw || '{}').scenario || 'default'; } catch { photoScenario = 'default'; }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ photoScenario })); return;
    }
    if (!req.url.endsWith('/chat/completions')) { res.writeHead(404).end('{}'); return; }
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch {}
    const userText = JSON.stringify(body.messages || []);
    if (userText.includes('SLOWAI')) await new Promise(r => setTimeout(r, 4000));
    const content = answer(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'mock', object: 'chat.completion', model: 'mock',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
    }));
  });
}).listen(PORT, '127.0.0.1', () => console.log(`[mock-ai] listening on ${PORT}`));
