# Supabase Edge Functions

## Golf Coach

The `golf-coach` function keeps the OpenAI API key out of the Expo application.

Set the key as a Supabase Edge Function secret:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
```

Deploy the function:

```bash
supabase functions deploy golf-coach
```

The default JWT verification must remain enabled. The mobile app invokes the
function through the authenticated Supabase client.
