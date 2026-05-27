# Lead Recovery

Lead Recovery lets a client keep their current business phone number and configure conditional call forwarding so missed, busy, or unanswered calls forward to a Twilio recovery number owned by the app.

## Twilio Configuration

Required environment variables:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`

Optional environment variables:

- `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_DEFAULT_FROM_NUMBER`
- `TWILIO_FROM_NUMBER`
- `ALLOW_UNSIGNED_TWILIO_WEBHOOKS` for local tests only; keep `false` outside local development.
- `LEAD_RECOVERY_ENABLED`

Set the Twilio phone number webhooks to:

- Voice webhook: `POST https://<api-host>/api/webhooks/twilio/voice`
- Inbound SMS webhook: `POST https://<api-host>/api/webhooks/twilio/sms/inbound`
- SMS status callback: `POST https://<api-host>/api/webhooks/twilio/sms/status`

The webhook handlers require Twilio signature validation by default. If `TWILIO_AUTH_TOKEN` is missing, webhook requests are rejected unless `ALLOW_UNSIGNED_TWILIO_WEBHOOKS=true` is explicitly set for local tests. They do not accept a tenant ID from Twilio. Tenant lookup is done by matching the called Twilio phone number to `lead_recovery_settings.twilio_phone_number`.

## Client Call Forwarding Setup

In the client dashboard, open **Lead Recovery** and enter:

- Business phone number
- Owner notification phone
- Owner notification email
- Twilio recovery number

The client then sets up conditional call forwarding with their carrier so unanswered or busy calls forward to the Twilio recovery number. Carrier-specific commands are intentionally not hardcoded in the first version.

## Local Testing With ngrok

1. Start the backend API locally.
2. Run `ngrok http 8000`.
3. Set the Twilio webhooks to the ngrok URL plus the paths above.
4. In the Lead Recovery dashboard, set the Twilio recovery number and mark forwarding active.
5. Call the business number and let it go unanswered, or send a test SMS directly to the Twilio number.

## Runtime Flow

1. Twilio sends a forwarded call to `/api/webhooks/twilio/voice`.
2. The app finds the tenant by recovery number.
3. The app creates or updates an open lead for that caller.
4. The app texts the caller with a general missed-call template.
5. SMS replies are processed by a simple state machine for service, location, urgency, preferred time, and name.
6. Once enough details are present, the app sends the owner a rule-based lead summary.
7. The dashboard inbox shows the lead and lets the owner mark it contacted, booked, lost, or completed.
8. Completed leads queue a review request when that setting is enabled.
