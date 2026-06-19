import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Photo, Trash } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  IconButton,
  Prompt,
  Text,
  toast,
} from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

async function adminFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token =
    localStorage.getItem("_medusa_auth_token") ||
    localStorage.getItem("medusa_auth_token") ||
    ""

  const res = await fetch(`/admin${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return res.json() as Promise<T>
}

type MediaFile = {
  key: string
  url: string
  size: number
  last_modified: string | null
  referenced: boolean
}

type MediaResponse = {
  s3_configured: boolean
  files: MediaFile[]
  summary: {
    total: number
    referenced: number
    orphans: number
    total_bytes: number
    orphan_bytes: number
  }
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

type PromptState =
  | { open: false }
  | { open: true; mode: "cleanup"; orphans: number; bytes: number }
  | { open: true; mode: "single"; key: string }

const MediaPage = () => {
  const [data, setData] = useState<MediaResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [prompt, setPrompt] = useState<PromptState>({ open: false })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await adminFetch<MediaResponse>("/media"))
    } catch {
      toast.error("Failed to load media library")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const runCleanup = async () => {
    setBusy(true)
    try {
      const r = await adminFetch<{ deleted: number; freed_bytes: number }>("/media/cleanup", {
        method: "POST",
        body: JSON.stringify({}),
      })
      toast.success(`Deleted ${r.deleted} orphan file(s) — freed ${formatBytes(r.freed_bytes)}`)
      await load()
    } catch {
      toast.error("Cleanup failed")
    } finally {
      setBusy(false)
      setPrompt({ open: false })
    }
  }

  const deleteOne = async (key: string) => {
    setBusy(true)
    try {
      await adminFetch("/media", { method: "DELETE", body: JSON.stringify({ keys: [key] }) })
      toast.success("File deleted")
      await load()
    } catch {
      toast.error("Could not delete (the file may still be in use)")
    } finally {
      setBusy(false)
      setPrompt({ open: false })
    }
  }

  return (
    <div className="flex flex-col gap-y-4 p-4">
      <Container className="px-6 py-6 flex flex-col gap-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Heading level="h1">Media Library</Heading>
            <Text size="small" className="text-ui-fg-subtle mt-1">
              Every file in your storage bucket. "Orphan" files are no longer used by any product,
              category, brand, or homepage section and can be safely removed.
            </Text>
          </div>
          {data?.s3_configured && (
            <Button
              variant="danger"
              size="small"
              disabled={loading || busy || data.summary.orphans === 0}
              onClick={() =>
                setPrompt({
                  open: true,
                  mode: "cleanup",
                  orphans: data.summary.orphans,
                  bytes: data.summary.orphan_bytes,
                })
              }
            >
              Clean up {data.summary.orphans} orphan{data.summary.orphans === 1 ? "" : "s"}
            </Button>
          )}
        </div>

        {loading ? (
          <Text size="small" className="text-ui-fg-muted">
            Loading…
          </Text>
        ) : !data?.s3_configured ? (
          <Text size="small" className="text-ui-fg-muted">
            The Media Library requires S3 / R2 storage. Set the S3_* environment variables on the
            backend to enable it. (Local-disk dev storage is not browsable here.)
          </Text>
        ) : data.files.length === 0 ? (
          <Text size="small" className="text-ui-fg-muted">
            No files in the bucket yet.
          </Text>
        ) : (
          <>
            <div className="flex items-center gap-x-4 flex-wrap">
              <Text size="small" className="text-ui-fg-subtle">
                {data.summary.total} files · {formatBytes(data.summary.total_bytes)}
              </Text>
              <Badge size="xsmall" color="green">
                {data.summary.referenced} in use
              </Badge>
              <Badge size="xsmall" color={data.summary.orphans ? "red" : "grey"}>
                {data.summary.orphans} orphan · {formatBytes(data.summary.orphan_bytes)}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {data.files.map((f) => (
                <div
                  key={f.key}
                  className="relative group border border-ui-border-base rounded-lg overflow-hidden bg-ui-bg-subtle"
                >
                  <div className="aspect-square w-full bg-ui-bg-base flex items-center justify-center overflow-hidden">
                    <img
                      src={f.url}
                      alt={f.key}
                      loading="lazy"
                      className="object-cover w-full h-full"
                      onError={(e) => {
                        ;(e.currentTarget as HTMLImageElement).style.display = "none"
                      }}
                    />
                  </div>
                  <div className="p-2 flex flex-col gap-y-1">
                    <Text size="xsmall" className="truncate" title={f.key}>
                      {f.key}
                    </Text>
                    <div className="flex items-center justify-between gap-1">
                      <Text size="xsmall" className="text-ui-fg-muted">
                        {formatBytes(f.size)}
                      </Text>
                      {f.referenced ? (
                        <Badge size="2xsmall" color="green">
                          In use
                        </Badge>
                      ) : (
                        <Badge size="2xsmall" color="red">
                          Orphan
                        </Badge>
                      )}
                    </div>
                  </div>
                  <IconButton
                    size="small"
                    variant="transparent"
                    disabled={busy}
                    className="absolute top-1 right-1 bg-ui-bg-base/80 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setPrompt({ open: true, mode: "single", key: f.key })}
                  >
                    <Trash className="text-ui-fg-error" />
                  </IconButton>
                </div>
              ))}
            </div>
          </>
        )}
      </Container>

      <Prompt open={prompt.open} onOpenChange={(o) => !o && setPrompt({ open: false })}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>
              {prompt.open && prompt.mode === "cleanup" ? "Delete orphan files?" : "Delete file?"}
            </Prompt.Title>
            <Prompt.Description>
              {prompt.open && prompt.mode === "cleanup"
                ? `This permanently deletes ${prompt.orphans} unused file(s) (${formatBytes(
                    prompt.bytes
                  )}) from your storage bucket. Files in use are kept. This cannot be undone.`
                : "This permanently deletes the file from your storage bucket. This cannot be undone."}
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel disabled={busy}>Cancel</Prompt.Cancel>
            <Prompt.Action
              onClick={() => {
                if (!prompt.open) return
                if (prompt.mode === "cleanup") runCleanup()
                else deleteOne(prompt.key)
              }}
            >
              Delete
            </Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Media Library",
  icon: Photo,
})

export default MediaPage
