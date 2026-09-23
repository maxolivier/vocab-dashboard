const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { prompt, data } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1024,
      messages: [{ role: 'user', content: prompt + '\n\n' + JSON.stringify(data || []) }],
    });
    res.json({ content: [{ text: message.content[0]?.text || '' }] });
  } catch (err) { console.error('[classify]', err.message); res.status(500).json({ error: err.message }); }
};