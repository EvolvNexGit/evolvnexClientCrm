# Quick Task Context — 260826-5fh

**Locked decisions:**
- Sub-tab label: **WhatsApp Settings**
- UI: **Single settings page** (header + form always visible)
- Features: **Save + Disconnect + webhook URL**
- Fields: **Minimal** — phone number ID, access token, app secret, verify token only
- Reuse existing `communication_provider_accounts` + `communication_whatsapp_credentials`
- Secrets never shown after save (password fields + saved/missing badges)
