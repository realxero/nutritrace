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

function parseFoods(text) {
  const lower = text.toLowerCase();
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
  return { meal: slot, items };
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
  if (/estimate nutrition from a single food photo/i.test(sys)) return JSON.stringify(PHOTO);
  return 'Mock Trace reply.';
}

http.createServer((req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', async () => {
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
