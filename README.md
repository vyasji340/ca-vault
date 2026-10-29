# CA Vault V14 — Hybrid Study Edition

Personal current-affairs and vocabulary revision app for banking exams.

## Deploy
1. Keep your existing `config.js` Supabase URL and publishable/anon key intact.
2. Upload the folder to the GitHub repository connected to Vercel, or deploy this folder to Vercel.
3. Core CA, progress, vocabulary and revision features work without AI API billing.
4. Optional AI Study Assistant: in Vercel → Project → Settings → Environment Variables, add `OPENAI_API_KEY` (secret) and optionally `OPENAI_MODEL` (defaults to `gpt-4.1-mini`). Redeploy. Never put the secret in `config.js`, browser code, or GitHub.
5. AI calls are usage-billed by the API provider separately from ChatGPT subscription. If no key is configured, the app reports AI unavailable and all non-AI features remain usable.

## Hybrid AI
The browser selects a small set of relevant CA and vocabulary records and sends that context with the question to `/api/study`. The Vercel serverless endpoint calls the OpenAI Responses API using the server-side environment variable. AI responses can make mistakes; verify important facts against source notes.

## Supabase
Existing SQL and tables are preserved. No database migration is required for this version. Use the same Supabase account to sync between devices.
