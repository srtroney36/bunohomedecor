import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Container, Text, Badge, Button, Input, Switch, toast } from "@medusajs/ui"
import { Key, ChevronDownMini, ChevronUpMini } from "@medusajs/icons"
import { adminFetch } from "../../lib/api"

export const config = defineRouteConfig({
  label: "Authentication",
  rank: 8,
  icon: Key,
})

type AuthSettings = {
  google_enabled: boolean
  google_client_id: string | null
  google_client_secret_hint: string | null
  google_redirect_uri: string | null
  google_configured: boolean
  phone_otp_enabled: boolean
  otp_length: number
  otp_expiry_seconds: number
  otp_max_attempts: number
  otp_resend_cooldown_seconds: number
  sms_configured: boolean
}

function ConfiguredBadge({ configured }: { configured: boolean }) {
  return configured
    ? <Badge color="green" size="2xsmall">Configured</Badge>
    : <Badge color="orange" size="2xsmall">Not configured</Badge>
}

function SetupGuide() {
  const [expanded, setExpanded] = useState(false)
  return (
    <Container className="overflow-hidden p-0">
      <div className="flex items-center justify-between px-6 py-4 gap-x-4">
        <Text size="base" weight="plus">Setup Guide</Text>
        <button
          className="text-ui-fg-subtle hover:text-ui-fg-base transition-colors p-1"
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? "Collapse guide" : "Expand guide"}
        >
          {expanded ? <ChevronUpMini /> : <ChevronDownMini />}
        </button>
      </div>

      {expanded && (
        <>
          <div className="h-px bg-ui-border-base" />
          <div className="px-6 py-4 flex flex-col gap-y-4">

            <div className="flex flex-col gap-y-2">
              <Text size="small" weight="plus">Google OAuth Setup</Text>
              <ol className="flex flex-col gap-y-1.5 pl-4 list-decimal">
                {[
                  "Go to Google Cloud Console (console.cloud.google.com) -> select or create a project",
                  "Navigate to APIs & Services -> Credentials -> Create Credentials -> OAuth client ID",
                  "Choose 'Web application' as the application type",
                  "Under 'Authorized redirect URIs', add your storefront callback URL (e.g. https://yourdomain.com/en/account/google-callback)",
                  "Copy the Client ID and Client Secret into the fields above",
                  "Set the Redirect URI field to match exactly what you added in Google Console (including the country-code prefix like /en/)",
                  "Enable Google OAuth and save -- the Sign in with Google button will appear on your storefront",
                ].map((s, i) => <li key={i}><Text size="small" className="text-ui-fg-subtle">{s}</Text></li>)}
              </ol>
            </div>

            <div className="flex flex-col gap-y-2">
              <Text size="small" weight="plus">Phone OTP Setup</Text>
              <ol className="flex flex-col gap-y-1.5 pl-4 list-decimal">
                {[
                  "PREREQUISITE: Configure SMS provider (Twilio or generic HTTP) in Admin -> Notifications first",
                  "Enable Phone OTP here and save",
                  "Customers can now sign in with their phone number -- a one-time code will be sent via SMS",
                  "Adjust OTP length, expiry, and rate limits to your preference",
                ].map((s, i) => <li key={i}><Text size="small" className="text-ui-fg-subtle">{s}</Text></li>)}
              </ol>
            </div>

            <div className="flex flex-col gap-y-2">
              <Text size="small" weight="plus">Environment requirement</Text>
              <Text size="small" className="text-ui-fg-subtle">
                Only <code className="bg-ui-bg-subtle px-1 rounded text-xs">APP_SECRETS_ENCRYPTION_KEY</code> is needed to encrypt the Google Client Secret at rest (already set if couriers or email are configured).
              </Text>
            </div>

            <div className="flex flex-col gap-y-2">
              <Text size="small" weight="plus">Troubleshooting</Text>
              <ul className="flex flex-col gap-y-1 pl-4 list-disc">
                {[
                  "Google 'redirect_uri_mismatch': The Redirect URI in the admin must exactly match what's registered in Google Cloud Console",
                  "Google sign-in not appearing on storefront: ensure google_enabled is on and google_configured badge shows green",
                  "OTP SMS not sending: ensure SMS provider is configured in Admin -> Notifications first",
                  "Invalid OTP code: verify your server clock is synchronized (NTP)",
                  "JWT errors: ensure JWT_SECRET is set in your .env file",
                ].map((s, i) => <li key={i}><Text size="small" className="text-ui-fg-subtle">{s}</Text></li>)}
              </ul>
            </div>

          </div>
        </>
      )}
    </Container>
  )
}

export default function AuthSettingsPage() {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery<AuthSettings>({
    queryKey: ["admin-auth-settings"],
    queryFn: () => adminFetch<AuthSettings>("/auth-settings"),
  })

  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [googleClientId, setGoogleClientId] = useState("")
  const [googleClientSecret, setGoogleClientSecret] = useState("")
  const [googleRedirectUri, setGoogleRedirectUri] = useState("")
  const [phoneOtpEnabled, setPhoneOtpEnabled] = useState(false)
  const [otpLength, setOtpLength] = useState("6")
  const [otpExpiry, setOtpExpiry] = useState("300")
  const [otpMaxAttempts, setOtpMaxAttempts] = useState("5")
  const [otpCooldown, setOtpCooldown] = useState("60")
  const [initialized, setInitialized] = useState(false)

  if (data && !initialized) {
    setGoogleEnabled(data.google_enabled ?? false)
    setGoogleClientId(data.google_client_id ?? "")
    setGoogleRedirectUri(data.google_redirect_uri ?? "")
    setPhoneOtpEnabled(data.phone_otp_enabled ?? false)
    setOtpLength(String(data.otp_length ?? 6))
    setOtpExpiry(String(data.otp_expiry_seconds ?? 300))
    setOtpMaxAttempts(String(data.otp_max_attempts ?? 5))
    setOtpCooldown(String(data.otp_resend_cooldown_seconds ?? 60))
    setInitialized(true)
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      adminFetch("/auth-settings", {
        method: "POST",
        body: JSON.stringify({
          google_enabled: googleEnabled,
          google_client_id: googleClientId || null,
          google_client_secret: googleClientSecret || undefined,
          google_redirect_uri: googleRedirectUri || null,
          phone_otp_enabled: phoneOtpEnabled,
          otp_length: Number(otpLength),
          otp_expiry_seconds: Number(otpExpiry),
          otp_max_attempts: Number(otpMaxAttempts),
          otp_resend_cooldown_seconds: Number(otpCooldown),
        }),
      }),
    onSuccess: () => {
      toast.success("Authentication settings saved")
      setGoogleClientSecret("")
      queryClient.invalidateQueries({ queryKey: ["admin-auth-settings"] })
      setInitialized(false)
    },
    onError: (err: Error) => toast.error(err.message || "Save failed"),
  })

  return (
    <div className="flex flex-col gap-y-4 p-4 max-w-2xl">
      <div className="flex flex-col gap-y-1">
        <Text size="xlarge" weight="plus">Authentication</Text>
        <Text size="small" className="text-ui-fg-subtle">
          Configure customer login methods. Disabled or unconfigured methods are hidden from the storefront automatically.
        </Text>
      </div>

      {error && (
        <div className="rounded-md bg-ui-tag-red-bg px-4 py-3">
          <Text size="small" className="text-ui-tag-red-text">
            {(error as Error).message || "Failed to load settings"}
          </Text>
        </div>
      )}

      {isLoading ? (
        <Text size="small" className="text-ui-fg-subtle">Loading settings...</Text>
      ) : (
        <>
          {/* Google OAuth */}
          <Container className="p-0 divide-y divide-ui-border-base">
            <div className="flex items-center justify-between px-6 py-4">
              <Text size="base" weight="plus">Google OAuth</Text>
              <div className="flex items-center gap-x-2">
                <ConfiguredBadge configured={Boolean(data?.google_configured)} />
                {googleEnabled && <Badge color="blue" size="2xsmall">Enabled</Badge>}
              </div>
            </div>

            <div className="px-6 py-4 flex items-center justify-between">
              <div>
                <Text size="small" weight="plus">Enable Google Sign-In</Text>
                <Text size="small" className="text-ui-fg-subtle">Show "Sign in with Google" on the storefront login page</Text>
              </div>
              <Switch checked={googleEnabled} onCheckedChange={setGoogleEnabled} />
            </div>

            <div className="px-6 py-4 flex flex-col gap-y-4">
              <div className="flex flex-col gap-y-2">
                <Text size="small" weight="plus">Client ID</Text>
                <Input
                  placeholder={data?.google_client_id || "Paste from Google Cloud Console"}
                  value={googleClientId}
                  onChange={(e) => setGoogleClientId(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-y-2">
                <Text size="small" weight="plus">Client Secret</Text>
                <Input
                  type="password"
                  placeholder={data?.google_client_secret_hint ? `Current: ${data.google_client_secret_hint}` : "Paste from Google Cloud Console"}
                  value={googleClientSecret}
                  onChange={(e) => setGoogleClientSecret(e.target.value)}
                  autoComplete="off"
                />
                <Text size="small" className="text-ui-fg-subtle">
                  Leave blank to keep the existing saved secret. Stored encrypted -- never in plaintext.
                </Text>
              </div>

              <div className="flex flex-col gap-y-2">
                <Text size="small" weight="plus">Redirect URI</Text>
                <Input
                  placeholder="e.g. https://yourdomain.com/en/account/google-callback"
                  value={googleRedirectUri}
                  onChange={(e) => setGoogleRedirectUri(e.target.value)}
                />
                <Text size="small" className="text-ui-fg-subtle">
                  Must exactly match an Authorized Redirect URI in your Google Cloud Console OAuth client.
                </Text>
              </div>
            </div>
          </Container>

          {/* Phone OTP */}
          <Container className="p-0 divide-y divide-ui-border-base">
            <div className="flex items-center justify-between px-6 py-4">
              <Text size="base" weight="plus">Phone Number + OTP</Text>
              {phoneOtpEnabled
                ? <Badge color="blue" size="2xsmall">Enabled</Badge>
                : <Badge color="orange" size="2xsmall">Disabled</Badge>}
            </div>

            <div className="px-6 py-4 flex items-center justify-between">
              <div>
                <Text size="small" weight="plus">Enable Phone OTP</Text>
                <Text size="small" className="text-ui-fg-subtle">Allow customers to sign in using phone number and a one-time SMS code</Text>
                {!data?.sms_configured && (
                  <Text size="small" className="text-ui-tag-orange-text mt-1">
                    Requires SMS provider configured in Admin â†' Notifications first
                  </Text>
                )}
              </div>
              <Switch checked={phoneOtpEnabled} onCheckedChange={setPhoneOtpEnabled} />
            </div>

            <div className="px-6 py-4 flex flex-col gap-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-y-2">
                  <Text size="small" weight="plus">OTP Length (digits)</Text>
                  <Input
                    type="number"
                    min={4}
                    max={8}
                    value={otpLength}
                    onChange={(e) => setOtpLength(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-y-2">
                  <Text size="small" weight="plus">OTP Expiry (seconds)</Text>
                  <Input
                    type="number"
                    min={60}
                    value={otpExpiry}
                    onChange={(e) => setOtpExpiry(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-y-2">
                  <Text size="small" weight="plus">Max Attempts</Text>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={otpMaxAttempts}
                    onChange={(e) => setOtpMaxAttempts(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-y-2">
                  <Text size="small" weight="plus">Resend Cooldown (seconds)</Text>
                  <Input
                    type="number"
                    min={30}
                    value={otpCooldown}
                    onChange={(e) => setOtpCooldown(e.target.value)}
                  />
                </div>
              </div>
              <Text size="small" className="text-ui-fg-subtle">
                Requires SMS provider (Twilio or generic HTTP) to be configured in your .env file.
              </Text>
            </div>
          </Container>

          <Button
            size="small"
            variant="primary"
            isLoading={saveMutation.isPending}
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Save settings
          </Button>
        </>
      )}

      <SetupGuide />
    </div>
  )
}
