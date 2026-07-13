import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  AdjustmentsDone,
  CreditCardSolid,
  TruckFast,
  ChartBar,
  Key,
  EnvelopeSolid,
  ChatBubbleLeftRight,
  Photo,
  ExclamationCircle,
  Trash,
  ChevronDownMini,
  ChevronUpMini,
} from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Tabs,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react"
import { adminFetch } from "../../lib/api"
import { usePermissions } from "../../lib/permissions"
import AccessControlPage from "../access-control/page"
import BrandsPage from "../brands/page"
import HomepagePage from "../homepage/page"
import ProductCardsPage from "../product-cards/page"
import { PaymentsSection } from "./sections/payments-section"
import { CouriersSection } from "./sections/couriers-section"
import { CourierRatesSection } from "./sections/courier-rates-section"
import { TrackingSection } from "./sections/tracking-section"
import { AuthSection } from "./sections/auth-section"
import { NotificationsSection } from "./sections/notifications-section"
import { StorageSection } from "./sections/storage-section"
import { ErrorLogSection } from "./sections/error-log-section"
import { DangerZoneSection } from "./sections/danger-zone-section"

// ── Collapsible category wrapper ───────────────────────────────────────────────

function CategorySection({
  title,
  description,
  icon: Icon,
  defaultOpen,
  children,
}: {
  title: string
  description: string
  icon: ComponentType<any>
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  return (
    <Container className="p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-ui-bg-base-hover transition-colors"
      >
        <div className="flex items-center gap-x-3">
          <Icon className="text-ui-fg-subtle" />
          <div>
            <Text size="base" weight="plus">{title}</Text>
            <Text size="small" className="text-ui-fg-subtle">{description}</Text>
          </div>
        </div>
        {open ? <ChevronUpMini className="text-ui-fg-muted" /> : <ChevronDownMini className="text-ui-fg-muted" />}
      </button>
      {open && (
        <div className="border-t border-ui-border-base bg-ui-bg-subtle px-4 py-4">
          {children}
        </div>
      )}
    </Container>
  )
}

// ── Contact buttons (storefront) ───────────────────────────────────────────────

function ContactSettings() {
  const [whatsapp, setWhatsapp] = useState("")
  const [phone, setPhone] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminFetch<{ setting: { whatsapp_number: string | null; order_phone: string | null } }>("/store-settings")
      .then(({ setting }) => {
        setWhatsapp(setting?.whatsapp_number ?? "")
        setPhone(setting?.order_phone ?? "")
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
          whatsapp_number: whatsapp.trim() || null,
          order_phone: phone.trim() || null,
        }),
      })
      toast.success("Settings saved")
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Container className="px-6 py-6 flex flex-col gap-y-6">
      <div className="flex flex-col gap-y-4">
        <div className="flex flex-col gap-y-1">
          <Label>WhatsApp Number</Label>
          <Text size="xsmall" className="text-ui-fg-muted">
            Include country code, e.g. +8801712345678. Leave blank to hide the WhatsApp button.
          </Text>
          <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+8801712345678" disabled={loading} />
        </div>
        <div className="flex flex-col gap-y-1">
          <Label>Order Phone Number</Label>
          <Text size="xsmall" className="text-ui-fg-muted">
            Phone number for the "Call For Order" button. Leave blank to hide.
          </Text>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8801712345678" disabled={loading} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} isLoading={saving} disabled={loading || saving}>
          Save Contact Buttons
        </Button>
      </div>
    </Container>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

// ── Integrations tab (the original Store Settings content) ────────────────────

function IntegrationSettings() {
  return (
    <div className="flex flex-col gap-y-4 max-w-3xl">
      <Text size="small" className="text-ui-fg-subtle">
        Integration secrets (API keys, tokens) are set as environment variables on your server.
        Each card shows whether it is configured and lets you turn it on or off.
      </Text>

      <CategorySection title="Storefront Contact Buttons" description="WhatsApp & call buttons on product pages" icon={ChatBubbleLeftRight} defaultOpen>
        <ContactSettings />
      </CategorySection>

      <CategorySection title="Payments" description="Stripe, SSLCommerz, bKash" icon={CreditCardSolid}>
        <PaymentsSection />
      </CategorySection>

      <CategorySection title="Couriers" description="Steadfast, RedX, Pathao" icon={TruckFast}>
        <CouriersSection />
      </CategorySection>

      <CategorySection
        title="Courier Rates"
        description="What each zone costs you — makes delivery margin visible"
        icon={TruckFast}
      >
        <CourierRatesSection />
      </CategorySection>

      <CategorySection title="Tracking & Analytics" description="Meta Pixel, GA4, Conversions API" icon={ChartBar}>
        <TrackingSection />
      </CategorySection>

      <CategorySection title="Authentication" description="Google Sign-In, Phone OTP" icon={Key}>
        <AuthSection />
      </CategorySection>

      <CategorySection title="Notifications" description="Email (Resend), SMS" icon={EnvelopeSolid}>
        <NotificationsSection />
      </CategorySection>

      <CategorySection title="Storage Cleanup" description="Remove unused files from your storage bucket" icon={Photo}>
        <StorageSection />
      </CategorySection>

      <CategorySection title="Error Log" description="Errors customers hit on the storefront" icon={ExclamationCircle}>
        <ErrorLogSection />
      </CategorySection>

      <CategorySection title="Danger Zone" description="Hard reset inventory, orders, and customer data" icon={Trash}>
        <DangerZoneSection />
      </CategorySection>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

/**
 * One home for everything that configures the store: integrations, the storefront's
 * Homepage and Product Cards, Brands, and Access Control. These used to be five separate
 * sidebar entries; they are tabs here so the sidebar stays about running the business.
 *
 * Tabs are permission-gated the same way the Accounting page does it — the API is still the
 * real boundary (it 403s), but there is no reason to show someone a tab they can't use.
 */
const StoreSettingsPage = () => {
  const { can, isLoading } = usePermissions()
  const [tab, setTab] = useState<string | null>(null)

  const tabs = useMemo(
    () =>
      [
        can("store_settings", "read") && { value: "integrations", label: "Integrations" },
        can("homepage", "read") && { value: "homepage", label: "Homepage" },
        can("store_settings", "read") && { value: "product-cards", label: "Product Cards" },
        can("brands", "read") && { value: "brands", label: "Brands" },
        can("rbac", "read") && { value: "access-control", label: "Access Control" },
      ].filter(Boolean) as { value: string; label: string }[],
    [can]
  )

  if (isLoading) return null

  if (!tabs.length) {
    return (
      <Container className="p-8">
        <Text className="text-ui-fg-subtle">
          You don't have access to the Store Settings section.
        </Text>
      </Container>
    )
  }

  // Fall back to the first tab the user can actually see.
  const active = tab && tabs.some((t) => t.value === tab) ? tab : tabs[0].value

  return (
    <div className="flex flex-col gap-y-4 p-4">
      <div>
        <Heading level="h1">Store Settings</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Everything that configures the store and its storefront.
        </Text>
      </div>

      <Tabs value={active} onValueChange={setTab}>
        <div className="overflow-x-auto">
          <Tabs.List className="w-max">
            {tabs.map((t) => (
              <Tabs.Trigger key={t.value} value={t.value}>
                {t.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </div>

        <div className="mt-4">
          <Tabs.Content value="integrations">
            <IntegrationSettings />
          </Tabs.Content>
          <Tabs.Content value="homepage">
            <HomepagePage />
          </Tabs.Content>
          <Tabs.Content value="product-cards">
            <ProductCardsPage />
          </Tabs.Content>
          <Tabs.Content value="brands">
            <BrandsPage />
          </Tabs.Content>
          <Tabs.Content value="access-control">
            <AccessControlPage />
          </Tabs.Content>
        </div>
      </Tabs>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Store Settings",
  icon: AdjustmentsDone,
  rank: 100, // last in the sidebar
})

export default StoreSettingsPage
