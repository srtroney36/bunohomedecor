import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Container, Text, Badge, Button, Input, Switch, toast } from "@medusajs/ui"
import { ChartBar, ChevronDownMini, ChevronUpMini } from "@medusajs/icons"
import { adminFetch } from "../../lib/api"

export const config = defineRouteConfig({
  label: "Tracking & Analytics",
  rank: 7,
  icon: ChartBar,
})

type TrackingSettings = {
  meta_pixel_id: string | null
  ga4_measurement_id: string | null
  capi_enabled: boolean
  capi_configured: boolean
  capi_test_event_code: string | null
  purchase_event_enabled: boolean
  capi_token_hint: string | null
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
              <Text size="small" weight="plus">Meta Pixel</Text>
              <ol className="flex flex-col gap-y-1.5 pl-4 list-decimal">
                {[
                  "Go to Meta Events Manager (business.facebook.com/events_manager)",
                  "Select or create a Pixel for your store",
                  "Copy the Pixel ID (a 15-16 digit number) into the Pixel ID field above",
                  "Save settings -- the Pixel will load on the next storefront page view (no rebuild)",
                ].map((s, i) => <li key={i}><Text size="small" className="text-ui-fg-subtle">{s}</Text></li>)}
              </ol>
            </div>

            <div className="flex flex-col gap-y-2">
              <Text size="small" weight="plus">GA4</Text>
              <ol className="flex flex-col gap-y-1.5 pl-4 list-decimal">
                {[
                  "Go to Google Analytics (analytics.google.com) and create a GA4 property",
                  "Under Data Streams -> Web, copy the Measurement ID (format: G-XXXXXXXX)",
                  "Paste it into the GA4 Measurement ID field above and save",
                ].map((s, i) => <li key={i}><Text size="small" className="text-ui-fg-subtle">{s}</Text></li>)}
              </ol>
            </div>

            <div className="flex flex-col gap-y-2">
              <Text size="small" weight="plus">Meta Conversions API (CAPI) -- for server-side Purchase events</Text>
              <ol className="flex flex-col gap-y-1.5 pl-4 list-decimal">
                {[
                  "In Events Manager, select your Pixel -> Settings -> Conversions API",
                  'Click "Generate access token" -- copy the token',
                  "Paste the token into the CAPI Access Token field above (it is encrypted before storage -- never stored in plaintext)",
                  "Enable CAPI and the Purchase event toggle, then Save",
                  "(Optional) In Events Manager -> Test Events, copy the Test Event Code and paste it above",
                  'Click "Send test event" -- verify the event appears in Test Events with deduplication confirmed',
                  "The server Purchase event uses order.id as event_id -- the browser Pixel also uses order.id -- Meta deduplicates them automatically",
                ].map((s, i) => <li key={i}><Text size="small" className="text-ui-fg-subtle">{s}</Text></li>)}
              </ol>
            </div>

            <div className="flex flex-col gap-y-2">
              <Text size="small" weight="plus">Environment requirement</Text>
              <Text size="small" className="text-ui-fg-subtle">
                The only env var needed is <code className="bg-ui-bg-subtle px-1 rounded text-xs">APP_SECRETS_ENCRYPTION_KEY</code> -- already set if you configured couriers or email. Used to encrypt the CAPI token at rest.
              </Text>
            </div>

            <div className="flex flex-col gap-y-2">
              <Text size="small" weight="plus">Troubleshooting</Text>
              <ul className="flex flex-col gap-y-1 pl-4 list-disc">
                {[
                  "Token invalid / expired: regenerate in Events Manager and re-save here",
                  "Events not deduplicating: verify event_id matches between browser Pixel and CAPI (both use order.id)",
                  "Pixel not firing: check browser console for fbq errors; ensure meta_pixel_id is saved",
                  "GA4 not initializing: check Network tab for gtag.js request with the correct measurement ID",
                  'CAPI test event fails: check APP_SECRETS_ENCRYPTION_KEY is set in .env and the server has restarted',
                  "API version outdated: update META_GRAPH_VERSION constant in src/lib/capi.ts",
                ].map((s, i) => <li key={i}><Text size="small" className="text-ui-fg-subtle">{s}</Text></li>)}
              </ul>
            </div>

          </div>
        </>
      )}
    </Container>
  )
}

export default function TrackingPage() {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery<TrackingSettings>({
    queryKey: ["admin-tracking"],
    queryFn: () => adminFetch<TrackingSettings>("/tracking"),
  })

  const [pixelId, setPixelId] = useState("")
  const [ga4Id, setGa4Id] = useState("")
  const [capiToken, setCapiToken] = useState("")
  const [testEventCode, setTestEventCode] = useState("")
  const [capiEnabled, setCapiEnabled] = useState(false)
  const [purchaseEnabled, setPurchaseEnabled] = useState(true)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Sync form state from loaded data (once)
  if (data && !initialized) {
    setPixelId(data.meta_pixel_id ?? "")
    setGa4Id(data.ga4_measurement_id ?? "")
    setTestEventCode(data.capi_test_event_code ?? "")
    setCapiEnabled(data.capi_enabled ?? false)
    setPurchaseEnabled(data.purchase_event_enabled ?? true)
    setInitialized(true)
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      adminFetch("/tracking", {
        method: "POST",
        body: JSON.stringify({
          meta_pixel_id: pixelId || null,
          ga4_measurement_id: ga4Id || null,
          capi_enabled: capiEnabled,
          purchase_event_enabled: purchaseEnabled,
          capi_token: capiToken || undefined,
          capi_test_event_code: testEventCode || null,
        }),
      }),
    onSuccess: () => {
      toast.success("Tracking settings saved")
      setCapiToken("")
      queryClient.invalidateQueries({ queryKey: ["admin-tracking"] })
      setInitialized(false)
    },
    onError: (err: Error) => toast.error(err.message || "Save failed"),
  })

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await adminFetch<{ success: boolean; message: string }>(
        "/tracking/test-capi",
        { method: "POST" }
      )
      setTestResult(result)
      if (result.success) toast.success(result.message)
      else toast.error(result.message)
    } catch (err: any) {
      const msg = err.message || "Test failed"
      setTestResult({ success: false, message: msg })
      toast.error(msg)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-y-4 p-4 max-w-2xl">
      <div className="flex flex-col gap-y-1">
        <Text size="xlarge" weight="plus">Tracking & Analytics</Text>
        <Text size="small" className="text-ui-fg-subtle">
          Configure Meta Pixel, GA4, and server-side Conversions API. IDs are loaded at runtime -- no rebuild needed when changed.
        </Text>
      </div>

      {error && (
        <div className="rounded-md bg-ui-tag-red-bg px-4 py-3">
          <Text size="small" className="text-ui-tag-red-text">
            {(error as Error).message || "Failed to load tracking settings"}
          </Text>
        </div>
      )}

      {isLoading ? (
        <Text size="small" className="text-ui-fg-subtle">Loading settings...</Text>
      ) : (
        <>
          {/* Meta Pixel */}
          <Container className="p-0 divide-y divide-ui-border-base">
            <div className="flex items-center justify-between px-6 py-4">
              <Text size="base" weight="plus">Meta Pixel</Text>
              <ConfiguredBadge configured={Boolean(data?.meta_pixel_id)} />
            </div>
            <div className="px-6 py-4 flex flex-col gap-y-2">
              <Text size="small" weight="plus">Pixel ID</Text>
              <Input
                placeholder={data?.meta_pixel_id ? `Current: ${data.meta_pixel_id}` : "e.g. 1234567890123456"}
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
              />
              <Text size="small" className="text-ui-fg-subtle">
                15-16 digit number from Meta Events Manager. Not a secret -- stored plainly.
              </Text>
            </div>
          </Container>

          {/* GA4 */}
          <Container className="p-0 divide-y divide-ui-border-base">
            <div className="flex items-center justify-between px-6 py-4">
              <Text size="base" weight="plus">Google Analytics 4</Text>
              <ConfiguredBadge configured={Boolean(data?.ga4_measurement_id)} />
            </div>
            <div className="px-6 py-4 flex flex-col gap-y-2">
              <Text size="small" weight="plus">Measurement ID</Text>
              <Input
                placeholder={data?.ga4_measurement_id ? `Current: ${data.ga4_measurement_id}` : "e.g. G-XXXXXXXXXX"}
                value={ga4Id}
                onChange={(e) => setGa4Id(e.target.value)}
              />
              <Text size="small" className="text-ui-fg-subtle">
                Format: G-XXXXXXXXXX. Found in Google Analytics → Data Streams → Web.
              </Text>
            </div>
          </Container>

          {/* Meta CAPI */}
          <Container className="p-0 divide-y divide-ui-border-base">
            <div className="flex items-center justify-between px-6 py-4">
              <Text size="base" weight="plus">Meta Conversions API</Text>
              <div className="flex items-center gap-x-2">
                {data?.capi_configured && <Badge color="green" size="2xsmall">Configured</Badge>}
                {capiEnabled && <Badge color="blue" size="2xsmall">Enabled</Badge>}
                {!data?.capi_configured && <Badge color="orange" size="2xsmall">Not configured</Badge>}
              </div>
            </div>

            <div className="px-6 py-4 flex items-center justify-between">
              <div>
                <Text size="small" weight="plus">Enable CAPI</Text>
                <Text size="small" className="text-ui-fg-subtle">
                  Send server-side events to Meta's Conversions API
                </Text>
              </div>
              <Switch checked={capiEnabled} onCheckedChange={setCapiEnabled} />
            </div>

            <div className="px-6 py-4 flex items-center justify-between">
              <div>
                <Text size="small" weight="plus">Send Purchase events</Text>
                <Text size="small" className="text-ui-fg-subtle">
                  Fire a CAPI Purchase event when an order is placed (deduplicated with browser Pixel)
                </Text>
              </div>
              <Switch checked={purchaseEnabled} onCheckedChange={setPurchaseEnabled} disabled={!capiEnabled} />
            </div>

            <div className="px-6 py-4 flex flex-col gap-y-4">
              <div className="flex flex-col gap-y-2">
                <Text size="small" weight="plus">CAPI Access Token</Text>
                <Input
                  type="password"
                  placeholder={data?.capi_token_hint ? `Current: ${data.capi_token_hint}` : "Paste token from Meta Events Manager"}
                  value={capiToken}
                  onChange={(e) => setCapiToken(e.target.value)}
                  autoComplete="off"
                />
                <Text size="small" className="text-ui-fg-subtle">
                  Leave blank to keep the existing saved token. Token is encrypted before storage -- never stored in plaintext.
                </Text>
              </div>

              <div className="flex flex-col gap-y-2">
                <Text size="small" weight="plus">Test Event Code (optional)</Text>
                <Input
                  placeholder="e.g. TEST12345"
                  value={testEventCode}
                  onChange={(e) => setTestEventCode(e.target.value)}
                />
                <Text size="small" className="text-ui-fg-subtle">
                  From Meta Events Manager → Test Events tab. Used to verify events without polluting real data.
                </Text>
              </div>

              <div className="flex items-center gap-x-2">
                <Button
                  size="small"
                  variant="secondary"
                  disabled={!data?.capi_configured || testing}
                  isLoading={testing}
                  onClick={handleTest}
                >
                  Send test event
                </Button>
              </div>

              {testResult && (
                <div
                  className={`flex items-center gap-x-2 rounded-md px-3 py-2 text-sm ${
                    testResult.success
                      ? "bg-ui-tag-green-bg text-ui-tag-green-text"
                      : "bg-ui-tag-red-bg text-ui-tag-red-text"
                  }`}
                >
                  <span>{testResult.success ? "✓" : "✗"}</span>
                  <span>{testResult.message}</span>
                </div>
              )}
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
