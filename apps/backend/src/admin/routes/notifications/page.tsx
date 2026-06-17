import { defineRouteConfig } from "@medusajs/admin-sdk"
import { EnvelopeSolid } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Switch,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useState } from "react"
import {
  IntegrationSetupGuide,
  type IntegrationGuideConfig,
} from "../../components/integration-setup-guide"
import { adminFetch } from "../../lib/api"

// â”€â”€ Email guide config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const EMAIL_GUIDE: IntegrationGuideConfig = {
  integrationId: "email",
  title: "Transactional Email Setup",
  intro: "Connect Resend to send order confirmations, shipping updates, and password resets to customers automatically.",
  steps: [
    {
      title: "Create a Resend account",
      body: "Sign up at Resend.com if you don't have an account yet. The free tier supports up to 3,000 emails/month.",
      link: { label: "Open Resend", url: "https://resend.com" },
    },
    {
      title: "Add and verify your sending domain",
      body: "In Resend â†’ Domains, add your domain. Copy the SPF and DKIM DNS records and add them at your registrar. Verification usually takes a few minutes.",
      link: { label: "Domain setup guide", url: "https://resend.com/docs/dashboard/domains/introduction" },
    },
    {
      title: "Create an API key",
      body: 'In Resend â†’ API Keys, click "Create API Key". Give it Sending access. Copy the key â€” you won\'t see it again.',
      link: { label: "Open API Keys", url: "https://resend.com/api-keys" },
    },
    {
      title: "Enter credentials in the form below",
      body: "Paste your API key, from-email, and from-name into the Credentials section below and click Save Credentials. The key is encrypted and stored in the database â€” no .env restart required. The status badge above turns green immediately.",
    },
  ],
  externalEnvStep: {
    varsToSet: [
      { name: "STORE_URL", description: "Your storefront URL â€” used for logo and account links in email templates", example: "https://yourdomain.com" },
    ],
    note: "All Resend credentials (API key, from email, from name) are managed in the Credentials form below. Only STORE_URL goes in .env â€” it is used to build links inside email templates.",
  },
  test: {
    enabled: true,
    inputLabel: "Send a test email to",
    inputPlaceholder: "you@example.com",
    buttonLabel: "Send test email",
  },
  troubleshooting: [
    { problem: "Status badge stays amber after saving credentials",  fix: "Click Refresh on the badge. Confirm both API key and From Email are saved in the Credentials form below." },
    { problem: "Test email fails: domain not verified",              fix: "The From Email address must use a domain you have verified in Resend â†’ Domains." },
    { problem: "Test email fails: API key invalid or 401",           fix: "Re-enter your Resend API key in the Credentials form. It must have Sending access, not View-only." },
    { problem: "Test email sent but nothing arrives",                fix: "Check spam. Confirm SPF and DKIM records show as verified in Resend â†’ Domains." },
  ],
}

// â”€â”€ SMS guide config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SMS_GUIDE: IntegrationGuideConfig = {
  integrationId: "sms",
  title: "Transactional SMS Setup",
  intro: "Send order confirmations, shipping updates, and cancellation notices via SMS. Works with Twilio or any HTTP-API SMS gateway.",
  steps: [
    {
      title: "Choose an SMS provider",
      body: 'Set the Provider field to "twilio" (default) for Twilio, or "generic_http" for a local/regional gateway (e.g., SSL Wireless, BulkSMS, or any gateway that accepts JSON POSTs).',
    },
    {
      title: "Get your API credentials",
      body: 'Twilio: Go to console.twilio.com â†’ grab your Account SID (API Key field) and Auth Token, then buy/verify a From number (Sender ID). Generic HTTP: Get the API key, sender ID, and gateway URL from your dashboard.',
      link: { label: "Open Twilio Console", url: "https://console.twilio.com" },
    },
    {
      title: "Enter credentials in the form below",
      body: "Fill in the SMS Credentials section below and click Save Credentials. Keys are encrypted and stored in the database â€” the status badge turns green immediately.",
    },
    {
      title: "Enable per-type SMS toggles below",
      body: "SMS toggles default to OFF â€” each message costs money. Enable only the types you want, then use the test sender to confirm delivery before going live.",
    },
  ],
  externalEnvStep: {
    varsToSet: [],
    note: "All SMS credentials are managed in the Credentials form below. No .env variables are needed for SMS.",
  },
  test: {
    enabled: true,
    inputLabel: "Send a test SMS to",
    inputPlaceholder: "+8801XXXXXXXXX",
    buttonLabel: "Send test SMS",
  },
  troubleshooting: [
    { problem: "Status badge stays amber after saving credentials",    fix: "Click Refresh. Confirm Provider, API Key, and Sender ID are all saved. Twilio also requires an Auth Token." },
    { problem: "Test fails: invalid phone number",                     fix: "Phone must be in E.164 format: + followed by country code and number, e.g. +8801711000000." },
    { problem: "Twilio: test fails with 401 or authentication error",  fix: "Re-enter the API Key (Account SID) and Auth Token â€” both must exactly match what is in Twilio Console." },
    { problem: "Twilio: test fails with unverified number error",      fix: "On a Twilio trial account the recipient must be verified first. Upgrade to a paid plan for unrestricted sending." },
    { problem: "generic_http: test fails with connection error",       fix: "Confirm the API URL is reachable from your server and the gateway API key has send permissions." },
    { problem: "SMS enabled but customers not receiving",              fix: "Confirm the customer's phone number is saved in E.164 format on their profile." },
  ],
}

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Settings = {
  email_enabled: boolean
  email_order_placed: boolean
  email_order_shipped: boolean
  email_order_canceled: boolean
  email_password_reset: boolean
  email_sender_name: string | null
  sms_order_placed: boolean
  sms_order_shipped: boolean
  sms_order_canceled: boolean
  // Credential hints (masked, never raw)
  resend_api_key_hint: string | null
  resend_from_email: string | null
  resend_from_name: string | null
  email_configured: boolean
  sms_api_key_hint: string | null
  sms_sender_id: string | null
  sms_provider: string | null
  twilio_auth_token_hint: string | null
  sms_api_url: string | null
  sms_configured: boolean
}

// â”€â”€ Page component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const NotificationsPage = () => {
  // Toggle state
  const [emailEnabled, setEmailEnabled]         = useState(true)
  const [orderPlaced, setOrderPlaced]           = useState(true)
  const [orderShipped, setOrderShipped]         = useState(true)
  const [orderCanceled, setOrderCanceled]       = useState(true)
  const [passwordReset, setPasswordReset]       = useState(true)
  const [senderName, setSenderName]             = useState("")
  const [smsOrderPlaced, setSmsOrderPlaced]     = useState(false)
  const [smsOrderShipped, setSmsOrderShipped]   = useState(false)
  const [smsOrderCanceled, setSmsOrderCanceled] = useState(false)

  // Email credential state
  const [resendApiKey, setResendApiKey]         = useState("")
  const [resendFromEmail, setResendFromEmail]   = useState("")
  const [resendFromName, setResendFromName]     = useState("")
  const [resendApiKeyHint, setResendApiKeyHint] = useState<string | null>(null)

  // SMS credential state
  const [smsApiKey, setSmsApiKey]               = useState("")
  const [smsSenderId, setSmsSenderId]           = useState("")
  const [smsProvider, setSmsProvider]           = useState("twilio")
  const [twilioAuthToken, setTwilioAuthToken]   = useState("")
  const [smsApiUrl, setSmsApiUrl]               = useState("")
  const [smsApiKeyHint, setSmsApiKeyHint]       = useState<string | null>(null)
  const [twilioTokenHint, setTwilioTokenHint]   = useState<string | null>(null)

  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [savingCreds, setSavingCreds] = useState(false)

  useEffect(() => {
    adminFetch<{ setting: Settings }>("/store-settings")
      .then(({ setting }) => {
        setEmailEnabled(setting?.email_enabled ?? true)
        setOrderPlaced(setting?.email_order_placed ?? true)
        setOrderShipped(setting?.email_order_shipped ?? true)
        setOrderCanceled(setting?.email_order_canceled ?? true)
        setPasswordReset(setting?.email_password_reset ?? true)
        setSenderName(setting?.email_sender_name ?? "")
        setSmsOrderPlaced(setting?.sms_order_placed ?? false)
        setSmsOrderShipped(setting?.sms_order_shipped ?? false)
        setSmsOrderCanceled(setting?.sms_order_canceled ?? false)
        // Credential hints
        setResendApiKeyHint(setting?.resend_api_key_hint ?? null)
        setResendFromEmail(setting?.resend_from_email ?? "")
        setResendFromName(setting?.resend_from_name ?? "")
        setSmsApiKeyHint(setting?.sms_api_key_hint ?? null)
        setSmsSenderId(setting?.sms_sender_id ?? "")
        setSmsProvider(setting?.sms_provider ?? "twilio")
        setTwilioTokenHint(setting?.twilio_auth_token_hint ?? null)
        setSmsApiUrl(setting?.sms_api_url ?? "")
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminFetch("/store-settings", {
        method: "POST",
        body: JSON.stringify({
          email_enabled: emailEnabled,
          email_order_placed: orderPlaced,
          email_order_shipped: orderShipped,
          email_order_canceled: orderCanceled,
          email_password_reset: passwordReset,
          email_sender_name: senderName.trim() || null,
          sms_order_placed: smsOrderPlaced,
          sms_order_shipped: smsOrderShipped,
          sms_order_canceled: smsOrderCanceled,
        }),
      })
      toast.success("Notification settings saved")
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  const handleSaveCreds = async () => {
    setSavingCreds(true)
    try {
      const body: Record<string, unknown> = {
        resend_from_email: resendFromEmail.trim() || null,
        resend_from_name: resendFromName.trim() || null,
        sms_sender_id: smsSenderId.trim() || null,
        sms_provider: smsProvider.trim() || null,
        sms_api_url: smsApiUrl.trim() || null,
      }
      // Only send secret fields if non-blank (blank = keep existing)
      if (resendApiKey.trim())    body.resend_api_key    = resendApiKey.trim()
      if (smsApiKey.trim())       body.sms_api_key       = smsApiKey.trim()
      if (twilioAuthToken.trim()) body.twilio_auth_token = twilioAuthToken.trim()

      const { setting } = await adminFetch<{ setting: Settings }>("/store-settings", {
        method: "POST",
        body: JSON.stringify(body),
      })
      // Refresh hints from response
      setResendApiKeyHint(setting?.resend_api_key_hint ?? null)
      setSmsApiKeyHint(setting?.sms_api_key_hint ?? null)
      setTwilioTokenHint(setting?.twilio_auth_token_hint ?? null)
      // Clear secret inputs
      setResendApiKey("")
      setSmsApiKey("")
      setTwilioAuthToken("")
      toast.success("Credentials encrypted and saved")
    } catch {
      toast.error("Failed to save credentials")
    } finally {
      setSavingCreds(false)
    }
  }

  return (
    <div className="flex flex-col gap-y-4 p-4">
      {/* Email + SMS setup guides â€” collapsible */}
      <div className="flex flex-col gap-y-2 max-w-2xl">
        <IntegrationSetupGuide config={EMAIL_GUIDE} collapsible />
        <IntegrationSetupGuide config={SMS_GUIDE} collapsible />
      </div>

      {/* Credential inputs */}
      <div className="max-w-2xl">
        <Container className="px-6 py-6 flex flex-col gap-y-6">
          <div>
            <Heading level="h1">Notification Credentials</Heading>
            <Text size="small" className="text-ui-fg-subtle mt-1">
              API keys are AES-256 encrypted and stored in the database. Leave a key field blank to keep the existing value.
            </Text>
          </div>

          {/* Resend (Email) credentials */}
          <div className="flex flex-col gap-y-4">
            <Heading level="h2">Resend (Email)</Heading>

            <div className="flex flex-col gap-y-1">
              <Label>API Key</Label>
              {resendApiKeyHint ? (
                <Text size="xsmall" className="text-ui-fg-muted">
                  Current: <span className="font-mono">{resendApiKeyHint}</span> â€” enter a new key to replace it
                </Text>
              ) : (
                <Text size="xsmall" className="text-ui-fg-muted">No key saved â€” enter one to enable email sending</Text>
              )}
              <Input
                type="password"
                value={resendApiKey}
                onChange={(e) => setResendApiKey(e.target.value)}
                placeholder="re_... (leave blank to keep existing)"
                disabled={loading}
                autoComplete="new-password"
              />
            </div>

            <div className="flex flex-col gap-y-1">
              <Label>From Email</Label>
              <Text size="xsmall" className="text-ui-fg-muted">Must be on a domain verified in Resend</Text>
              <Input
                value={resendFromEmail}
                onChange={(e) => setResendFromEmail(e.target.value)}
                placeholder="noreply@yourdomain.com"
                disabled={loading}
              />
            </div>

            <div className="flex flex-col gap-y-1">
              <Label>From Name</Label>
              <Input
                value={resendFromName}
                onChange={(e) => setResendFromName(e.target.value)}
                placeholder="My Store"
                disabled={loading}
              />
            </div>
          </div>

          {/* SMS credentials */}
          <div className="border-t border-ui-border-base pt-4 flex flex-col gap-y-4">
            <Heading level="h2">SMS</Heading>

            <div className="flex flex-col gap-y-1">
              <Label>Provider</Label>
              <Text size="xsmall" className="text-ui-fg-muted">"twilio" or "generic_http"</Text>
              <Input
                value={smsProvider}
                onChange={(e) => setSmsProvider(e.target.value)}
                placeholder="twilio"
                disabled={loading}
              />
            </div>

            <div className="flex flex-col gap-y-1">
              <Label>API Key {smsProvider === "twilio" ? "(Account SID)" : ""}</Label>
              {smsApiKeyHint ? (
                <Text size="xsmall" className="text-ui-fg-muted">
                  Current: <span className="font-mono">{smsApiKeyHint}</span> â€” enter a new key to replace it
                </Text>
              ) : (
                <Text size="xsmall" className="text-ui-fg-muted">No key saved</Text>
              )}
              <Input
                type="password"
                value={smsApiKey}
                onChange={(e) => setSmsApiKey(e.target.value)}
                placeholder={smsProvider === "twilio" ? "ACxxxxxxxxxxxxxxxx" : "your-gateway-api-key"}
                disabled={loading}
                autoComplete="new-password"
              />
            </div>

            <div className="flex flex-col gap-y-1">
              <Label>Sender ID {smsProvider === "twilio" ? "(From Number)" : ""}</Label>
              <Input
                value={smsSenderId}
                onChange={(e) => setSmsSenderId(e.target.value)}
                placeholder={smsProvider === "twilio" ? "+18005551234" : "MySender"}
                disabled={loading}
              />
            </div>

            {smsProvider === "twilio" && (
              <div className="flex flex-col gap-y-1">
                <Label>Auth Token</Label>
                {twilioTokenHint ? (
                  <Text size="xsmall" className="text-ui-fg-muted">
                    Current: <span className="font-mono">{twilioTokenHint}</span> â€” enter a new token to replace it
                  </Text>
                ) : (
                  <Text size="xsmall" className="text-ui-fg-muted">No auth token saved</Text>
                )}
                <Input
                  type="password"
                  value={twilioAuthToken}
                  onChange={(e) => setTwilioAuthToken(e.target.value)}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  disabled={loading}
                  autoComplete="new-password"
                />
              </div>
            )}

            {smsProvider === "generic_http" && (
              <div className="flex flex-col gap-y-1">
                <Label>API URL</Label>
                <Input
                  value={smsApiUrl}
                  onChange={(e) => setSmsApiUrl(e.target.value)}
                  placeholder="https://sms.yourgateway.com/api/send"
                  disabled={loading}
                />
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSaveCreds}
              isLoading={savingCreds}
              disabled={loading || savingCreds}
              size="small"
            >
              Save Credentials
            </Button>
          </div>
        </Container>
      </div>

      {/* Notification toggles */}
      <div className="max-w-2xl">
        <Container className="px-6 py-6 flex flex-col gap-y-6">
          <div>
            <Heading level="h1">Notification Toggles</Heading>
            <Text size="small" className="text-ui-fg-subtle mt-1">
              Control which transactional messages are sent to customers.
            </Text>
          </div>

          <div className="flex flex-col gap-y-5">
            {/* Sender name */}
            <div className="flex flex-col gap-y-1">
              <Label>Email Sender Name Override</Label>
              <Text size="xsmall" className="text-ui-fg-muted">
                Overrides the From Name set in Credentials above. Leave blank to use the Credentials value.
              </Text>
              <Input
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="My Store"
                disabled={loading}
              />
            </div>

            {/* Email toggles */}
            <div className="border-t border-ui-border-base pt-4 flex flex-col gap-y-4">
              <Heading level="h2">Email</Heading>
              <div className="flex items-center justify-between">
                <div>
                  <Label>All Email Notifications</Label>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    Master switch â€” disabling this overrides all per-type email settings.
                  </Text>
                </div>
                <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} disabled={loading} />
              </div>

              {(
                [
                  { label: "Order Placed",   value: orderPlaced,   setter: setOrderPlaced },
                  { label: "Order Shipped",  value: orderShipped,  setter: setOrderShipped },
                  { label: "Order Canceled", value: orderCanceled, setter: setOrderCanceled },
                  { label: "Password Reset", value: passwordReset, setter: setPasswordReset },
                ] as const
              ).map(({ label, value, setter }) => (
                <div key={label} className="flex items-center justify-between">
                  <Label className={!emailEnabled ? "text-ui-fg-muted" : ""}>{label}</Label>
                  <Switch
                    checked={value}
                    onCheckedChange={(v) => setter(v)}
                    disabled={loading || !emailEnabled}
                  />
                </div>
              ))}
            </div>

            {/* SMS toggles */}
            <div className="border-t border-ui-border-base pt-4 flex flex-col gap-y-4">
              <div>
                <Heading level="h2">SMS</Heading>
                <Text size="xsmall" className="text-ui-fg-muted mt-1">
                  All SMS types default to OFF â€” each message costs money. Enable after confirming your SMS credentials are configured above.
                </Text>
              </div>

              {(
                [
                  { label: "Order Placed",   value: smsOrderPlaced,   setter: setSmsOrderPlaced },
                  { label: "Order Shipped",  value: smsOrderShipped,  setter: setSmsOrderShipped },
                  { label: "Order Canceled", value: smsOrderCanceled, setter: setSmsOrderCanceled },
                ] as const
              ).map(({ label, value, setter }) => (
                <div key={label} className="flex items-center justify-between">
                  <Label>{label}</Label>
                  <Switch
                    checked={value}
                    onCheckedChange={(v) => setter(v)}
                    disabled={loading}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} isLoading={saving} disabled={loading || saving}>
              Save Settings
            </Button>
          </div>
        </Container>
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Notifications",
  rank: 9,
  icon: EnvelopeSolid,
})

export default NotificationsPage
