# WF-001 Environment Setup

This document lists the n8n Variables required for WF-001 (Main WhatsApp Message Handler) and all dependent workflows.

Set these in n8n → Settings → Variables.

## Required n8n Variables

| Variable | Value | Notes |
|---|---|---|
| `SUPABASE_URL` | `https://xifklnqcnkweubbgohgy.supabase.co` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | `[service role key from Supabase Settings → API]` | Service role (not anon) key |
| `OPENAI_API_KEY` | `[OpenAI API key]` | Used for intent classification and response generation |
| `WF_002_WEBHOOK_URL` | `[URL of WF-002 webhook after WF-002 is activated]` | e.g. `https://your-n8n.com/webhook/wf-002-order-handler` |
| `WF_003_WEBHOOK_URL` | `[URL of WF-003 webhook after WF-003 is activated]` | e.g. `https://your-n8n.com/webhook/wf-003-receipt-handler` |
| `WF_005_WEBHOOK_URL` | `[URL of WF-005 webhook after WF-005 is activated]` | e.g. `https://your-n8n.com/webhook/wf-005-notification-handler` |

## Webhook URL

After activating WF-001 in n8n, the webhook URL will be:

- **POST (incoming messages):** `https://your-n8n.com/webhook/whatsapp`
- **GET (Meta verification):** `https://your-n8n.com/webhook/whatsapp` (same path, GET method)

Register the POST URL in Meta Developer Console → WhatsApp → Configuration → Webhook URL.

## Meta Webhook Verification

When Meta sends the GET verification request, it passes:
- `hub.mode` = `subscribe`
- `hub.challenge` = (random string)
- `hub.verify_token` = (your chosen token)

WF-001's GET webhook node responds with `hub.challenge` automatically. The verify token check is not enforced in the workflow — add an IF node if needed.

## n8n Credentials

The OpenAI API is called via HTTP Request nodes using `$vars.OPENAI_API_KEY` (not a credential). No n8n credential is needed for OpenAI in this workflow.

Supabase is also called via HTTP Request with `$vars.SUPABASE_SERVICE_KEY`. No n8n credential needed.

## Flow Order for Activation

1. Deploy Supabase schema (tables: firms, customers, conversations, messages, products, faqs)
2. Create and activate WF-002, WF-003, WF-005 — copy their webhook URLs into variables
3. Set all variables above in n8n Settings → Variables
4. Import and activate WF-001
5. Register the WF-001 POST webhook URL in Meta Developer Console
