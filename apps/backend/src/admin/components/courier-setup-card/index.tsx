import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Container,
  Text,
  Badge,
  Button,
  Input,
  Switch,
  toast,
} from "@medusajs/ui"
import { ChevronDownMini, ChevronUpMini } from "@medusajs/icons"
import { adminFetch } from "../../lib/api"

export type CourierRow = {
  id: string
  courier_id: "steadfast" | "redx" | "pathao"
  enabled: boolean
  is_active: boolean
  configured: boolean
  settings: Record<string, unknown> | null
  credential_hints: Record<string, string> | null
}

type CredentialField = {
  key: string
  label: string
  placeholder?: string
}

type CourierMeta = {
  name: string
  description: string
  credentials: CredentialField[]
  hasSandbox: boolean
  docsUrl: string
  steps: string[]
}

const COURIER_META: Record<string, CourierMeta> = {
  steadfast: {
    name: "Steadfast Courier",
    description: "Popular BD courier with API-based parcel booking",
    docsUrl: "https://portal.packzy.com",
    hasSandbox: false,
    credentials: [
      { key: "api_key", label: "API Key", placeholder: "Your Steadfast API key" },
      { key: "secret_key", label: "Secret Key", placeholder: "Your Steadfast secret key" },
    ],
    steps: [
      "Create a merchant account at portal.packzy.com",
      "Go to Account → API Settings to find your API Key and Secret Key",
      "Enter the keys below and click Save",
      "Click Test Connection to verify the credentials",
      "Click Set as Active to use Steadfast for new fulfillments",
    ],
  },
  redx: {
    name: "RedX",
    description: "Fast delivery across Bangladesh with real-time tracking",
    docsUrl: "https://docs.redx.com.bd",
    hasSandbox: true,
    credentials: [
      { key: "api_token", label: "API Token", placeholder: "Your RedX API token" },
    ],
    steps: [
      "Sign up for a RedX merchant account at redx.com.bd",
      "Request API access from your RedX account manager",
      "Obtain your API Token from the merchant portal",
      "Enter the token below, toggle Sandbox for testing, then Save",
      "Click Test Connection and then Set as Active",
    ],
  },
  pathao: {
    name: "Pathao",
    description: "Tech-first courier with city-zone-area routing for BD",
    docsUrl: "https://api-hermes.pathao.com/aladdin/api/v1",
    hasSandbox: true,
    credentials: [
      { key: "client_id", label: "Client ID", placeholder: "Pathao client_id" },
      { key: "client_secret", label: "Client Secret", placeholder: "Pathao client_secret" },
      { key: "username", label: "Username / Email", placeholder: "Pathao merchant email" },
      { key: "password", label: "Password", placeholder: "Pathao merchant password" },
      { key: "store_id", label: "Store ID (optional)", placeholder: "Pathao store_id" },
    ],
    steps: [
      "Apply for Pathao Courier API access at pathao.com",
      "Receive client_id, client_secret, username, password from Pathao",
      "Enter all credentials below and enable Sandbox for testing",
      "Click Save, then Test Connection",
      "Disable Sandbox, Save again, then Set as Active for live orders",
    ],
  },
}

type Props = {
  courier: CourierRow
  onRefresh: () => void
}

export function CourierSetupCard({ courier, onRefresh }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [sandbox, setSandbox] = useState<boolean>(
    courier.settings?.sandbox === true || courier.settings?.sandbox === "true"
  )
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const queryClient = useQueryClient()

  const meta = COURIER_META[courier.courier_id]
  if (!meta) return null

  const saveMutation = useMutation({
    mutationFn: async () => {
      const credentials: Record<string, string> = {}
      for (const field of meta.credentials) {
        if (fieldValues[field.key]) credentials[field.key] = fieldValues[field.key]
      }
      return adminFetch(`/couriers/${courier.id}`, {
        method: "POST",
        body: JSON.stringify({
          credentials,
          settings: meta.hasSandbox ? { sandbox } : undefined,
        }),
      })
    },
    onSuccess: () => {
      toast.success("Credentials saved")
      setFieldValues({})
      queryClient.invalidateQueries({ queryKey: ["admin-couriers"] })
      onRefresh()
    },
    onError: (err: Error) => toast.error(err.message || "Save failed"),
  })

  const activateMutation = useMutation({
    mutationFn: () =>
      adminFetch(`/couriers/${courier.id}/activate`, { method: "POST" }),
    onSuccess: () => {
      toast.success(`${meta.name} is now the active courier`)
      queryClient.invalidateQueries({ queryKey: ["admin-couriers"] })
      onRefresh()
    },
    onError: (err: Error) => toast.error(err.message || "Activation failed"),
  })

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await adminFetch<{ success: boolean; message: string }>(
        `/couriers/${courier.id}/test`,
        { method: "POST" }
      )
      setTestResult(result)
      if (result.success) toast.success(result.message)
      else toast.error(result.message)
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Test failed" })
      toast.error(err.message || "Test failed")
    } finally {
      setTesting(false)
    }
  }

  return (
    <Container className="overflow-hidden p-0">
      {/* Compact header — always visible */}
      <div className="flex items-center justify-between px-6 py-4 gap-x-4">
        <div className="flex flex-col gap-y-0.5 min-w-0">
          <Text size="base" weight="plus" className="text-ui-fg-base">
            {meta.name}
          </Text>
          <Text size="small" className="text-ui-fg-subtle truncate">
            {meta.description}
          </Text>
        </div>

        <div className="flex items-center gap-x-2 flex-shrink-0">
          {courier.is_active && (
            <Badge color="green" size="2xsmall">Active</Badge>
          )}
          {courier.configured ? (
            <Badge color="green" size="2xsmall">Configured</Badge>
          ) : (
            <Badge color="orange" size="2xsmall">Not configured</Badge>
          )}
          {!courier.configured && !expanded && (
            <Button
              size="small"
              variant="primary"
              onClick={() => setExpanded(true)}
            >
              Set Up
            </Button>
          )}
          <button
            className="text-ui-fg-subtle hover:text-ui-fg-base transition-colors p-1"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUpMini /> : <ChevronDownMini />}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          <div className="h-px bg-ui-border-base" />

          {/* Status row */}
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex flex-col gap-y-0.5">
              <Text size="small" weight="plus">Set as Active Courier</Text>
              <Text size="small" className="text-ui-fg-subtle">
                Only one courier can be active at a time. New fulfillments will use the active courier.
              </Text>
            </div>
            <Button
              size="small"
              variant={courier.is_active ? "secondary" : "primary"}
              disabled={!courier.configured || courier.is_active || activateMutation.isPending}
              isLoading={activateMutation.isPending}
              onClick={() => activateMutation.mutate()}
            >
              {courier.is_active ? "Currently Active" : "Set as Active"}
            </Button>
          </div>

          <div className="h-px bg-ui-border-base" />

          {/* Setup steps */}
          <div className="px-6 py-4 flex flex-col gap-y-3">
            <Text size="small" weight="plus">Setup Steps</Text>
            <ol className="flex flex-col gap-y-1.5 pl-4 list-decimal">
              {meta.steps.map((step, i) => (
                <li key={i}>
                  <Text size="small" className="text-ui-fg-subtle">{step}</Text>
                </li>
              ))}
            </ol>
          </div>

          <div className="h-px bg-ui-border-base" />

          {/* Credential form */}
          <div className="px-6 py-4 flex flex-col gap-y-4">
            <Text size="small" weight="plus">Credentials</Text>
            <Text size="small" className="text-ui-fg-subtle -mt-2">
              Leave a field blank to keep the existing saved value.
            </Text>

            <div className="flex flex-col gap-y-3">
              {meta.credentials.map((field) => {
                const hint = courier.credential_hints?.[field.key]
                return (
                  <div key={field.key} className="flex flex-col gap-y-1">
                    <Text size="small" weight="plus">{field.label}</Text>
                    <Input
                      type="password"
                      placeholder={hint ? `Current: ${hint}` : (field.placeholder ?? "")}
                      value={fieldValues[field.key] ?? ""}
                      onChange={(e) =>
                        setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      autoComplete="off"
                    />
                  </div>
                )
              })}

              {meta.hasSandbox && (
                <div className="flex items-center justify-between">
                  <div>
                    <Text size="small" weight="plus">Sandbox / Test mode</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      Use the courier's sandbox environment for testing
                    </Text>
                  </div>
                  <Switch
                    checked={sandbox}
                    onCheckedChange={setSandbox}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-x-2">
              <Button
                size="small"
                variant="primary"
                isLoading={saveMutation.isPending}
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                Save
              </Button>
              <Button
                size="small"
                variant="secondary"
                disabled={!courier.configured || testing}
                isLoading={testing}
                onClick={handleTest}
              >
                Test Connection
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

          {/* Troubleshooting */}
          <div className="h-px bg-ui-border-base" />
          <div className="px-6 py-4 flex flex-col gap-y-2">
            <Text size="small" weight="plus">Troubleshooting</Text>
            <Text size="small" className="text-ui-fg-subtle">
              If the Test Connection fails, check that your credentials are correct and that your
              account has API access enabled. For sandbox errors, ensure you are using sandbox-only
              credentials. Contact {meta.name} support if issues persist.
            </Text>
            {meta.hasSandbox && (
              <Text size="small" className="text-ui-fg-subtle">
                Remember to disable Sandbox and re-save credentials before going live.
              </Text>
            )}
          </div>
        </>
      )}
    </Container>
  )
}
