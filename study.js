// Server-side hybrid study endpoint. Set OPENAI_API_KEY in Vercel Environment Variables.
// The key is never sent to the browser.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'AI is not configured yet. Add OPENAI_API_KEY in Vercel project settings and redeploy.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const question = String(body.question || '').slice(0, 5000);
    const context = body.context && typeof body.context === 'object' ? body.context : {};
    if (!question.trim()) return res.status(400).json({ error: 'Please enter a question.' });
    const serialized = JSON.stringify(context).slice(0, 24000);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        instructions: `You are CA Vault's banking exam study assistant. Explain in simple Hinglish unless the user requests otherwise. Prioritize the supplied CA Vault and vocabulary context. Do not invent facts or pretend the context contains information it does not. Clearly label general knowledge or uncertainty, and tell the learner to verify exam-critical facts against their source. Be useful: explain, make concise notes, create MCQs with answer and explanation when asked.`,
        input: `User question:\n${question}\n\nRelevant CA Vault context (may be incomplete):\n${serialized}`,
        max_output_tokens: 1400
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'AI provider request failed.' });
    const answer = (data.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n').trim();
    if (!answer) return res.status(502).json({ error: 'AI returned an empty response.' });
    const contextCount = (context.current_affairs || []).length + (context.vocabulary || []).length;
    return res.status(200).json({ answer, contextCount });
  } catch (error) {
    return res.status(500).json({ error: 'Unexpected server error while generating study response.' });
  }
}
