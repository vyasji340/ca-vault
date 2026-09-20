# CA Vault V8 — Free Cloud Sync

This version keeps the existing CA data and revision features, and adds free Supabase cloud sync so the same progress can be used on laptop + phone.

## One-time setup
1. Create a free project at Supabase.
2. Open **SQL Editor** and run all of `supabase.sql`.
3. Open **Project Settings → API** and copy the **Project URL** and **anon/public key**.
4. Open `config.js` and replace the two placeholders:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
5. Upload/replace the V8 files in your GitHub repo and let Vercel redeploy.
6. Open the app and tap **☁️ Login / Sign up**. Use the same email/password on laptop and phone.

## What syncs
- Learned / Need to Remember / Review / Mastered
- Must Remember
- Weak CA + quiz mistakes
- Review dates and review counts
- Manually added September/future CA

## Free-only
No paid API is used. Vercel static hosting + Supabase Free are enough for a personal CA Vault at this scale.

## Existing progress
V8 keeps the existing browser localStorage keys and merges local progress with cloud progress on first login. After that, changes are saved to Supabase and available on other devices using the same account.
