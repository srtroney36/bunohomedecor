import {
  Badge,
  Button,
  Checkbox,
  Container,
  Drawer,
  FocusModal,
  Heading,
  Input,
  Label,
  Prompt,
  Table,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { rbacFetch, usePermissions } from "../../lib/permissions"

type CatalogResource = { key: string; label: string; actions: string[] }
type CatalogGroup = { key: string; label: string; resources: CatalogResource[] }

type Role = {
  id: string
  name: string
  slug: string
  description: string | null
  is_system: boolean
  permissions: string[]
  user_count: number
}

type TeamUser = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  roles: { id: string; name: string; slug: string }[]
}

// ---- Role create/edit form (with permission matrix) -----------------------

type RoleFormData = {
  name: string
  description: string | null
  permissions: string[]
}

function RoleForm({
  initial,
  catalog,
  onSave,
  onClose,
  saving,
  locked,
  lockName,
}: {
  initial?: Role
  catalog: CatalogGroup[]
  onSave: (data: RoleFormData) => Promise<void>
  onClose: () => void
  saving: boolean
  locked?: boolean
  lockName?: boolean
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initial?.permissions ?? [])
  )
  const isWildcard = selected.has("*")

  const toggle = (key: string) => {
    if (locked) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const preset = (mode: "read" | "clear") => {
    if (locked) return
    if (mode === "clear") {
      setSelected(new Set())
      return
    }
    const next = new Set<string>()
    for (const g of catalog) {
      for (const r of g.resources) {
        if (r.actions.includes("read")) next.add(`${r.key}:read`)
      }
    }
    setSelected(next)
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Role name is required")
      return
    }
    await onSave({
      name: name.trim(),
      description: description.trim() || null,
      permissions: [...selected],
    })
  }

  return (
    <div className="flex flex-col gap-y-4 p-4">
      <div className="flex flex-col gap-y-1">
        <Label>Name *</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={locked || lockName}
          placeholder="e.g. Warehouse Lead"
        />
        {lockName && !locked && (
          <Text size="xsmall" className="text-ui-fg-muted">
            System role names cannot be changed, but their permissions can.
          </Text>
        )}
      </div>
      <div className="flex flex-col gap-y-1">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={locked}
          rows={2}
          placeholder="What this role is for"
        />
      </div>

      {locked ? (
        <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3">
          <Text size="small" className="text-ui-fg-subtle">
            The Owner role always has full access and cannot be edited.
          </Text>
        </div>
      ) : isWildcard ? (
        <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3">
          <Text size="small" className="text-ui-fg-subtle">
            This role has full access to everything (wildcard permission).
          </Text>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <Label>Permissions</Label>
            <div className="flex gap-x-2">
              <Button
                size="small"
                variant="secondary"
                type="button"
                onClick={() => preset("read")}
              >
                All read
              </Button>
              <Button
                size="small"
                variant="secondary"
                type="button"
                onClick={() => preset("clear")}
              >
                Clear
              </Button>
            </div>
          </div>
          <Text size="xsmall" className="text-ui-fg-muted">
            "Manage" grants read, write and delete. High-risk actions (refund,
            store reset) must be granted explicitly.
          </Text>
          <div className="flex flex-col gap-y-4">
            {catalog.map((group) => (
              <div
                key={group.key}
                className="rounded-lg border border-ui-border-base overflow-hidden"
              >
                <div className="bg-ui-bg-subtle px-4 py-2 border-b border-ui-border-base">
                  <Text size="small" weight="plus">
                    {group.label}
                  </Text>
                </div>
                <div className="divide-y divide-ui-border-base">
                  {group.resources.map((r) => (
                    <div
                      key={r.key}
                      className="flex items-center justify-between gap-x-4 px-4 py-2"
                    >
                      <Text size="small">{r.label}</Text>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-end">
                        {r.actions.map((a) => {
                          const key = `${r.key}:${a}`
                          return (
                            <label
                              key={a}
                              className="flex items-center gap-x-1.5 cursor-pointer"
                            >
                              <Checkbox
                                checked={selected.has(key)}
                                onCheckedChange={() => toggle(key)}
                              />
                              <Text
                                size="xsmall"
                                className="text-ui-fg-subtle capitalize"
                              >
                                {a.replace("-", " ")}
                              </Text>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex justify-end gap-x-2 pt-2 border-t border-ui-border-base mt-2">
        <Button size="small" variant="secondary" onClick={onClose} disabled={saving}>
          {locked ? "Close" : "Cancel"}
        </Button>
        {!locked && (
          <Button size="small" onClick={handleSubmit} isLoading={saving} disabled={saving}>
            Save
          </Button>
        )}
      </div>
    </div>
  )
}

// ---- Roles section --------------------------------------------------------

function RolesSection({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient()
  const { data: catalogData } = useQuery({
    queryKey: ["rbac-catalog"],
    queryFn: () => rbacFetch<{ groups: CatalogGroup[] }>("/rbac/permissions"),
  })
  const { data: rolesData, isLoading } = useQuery({
    queryKey: ["rbac-roles"],
    queryFn: () => rbacFetch<{ roles: Role[] }>("/rbac/roles"),
  })

  const catalog = catalogData?.groups ?? []
  const roles = rolesData?.roles ?? []

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Role | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Role | null>(null)
  const [deleting, setDeleting] = useState(false)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["rbac-roles"] })
    qc.invalidateQueries({ queryKey: ["rbac-users"] })
    qc.invalidateQueries({ queryKey: ["rbac-me"] })
  }

  const handleCreate = async (data: RoleFormData) => {
    setSaving(true)
    try {
      await rbacFetch("/rbac/roles", { method: "POST", body: JSON.stringify(data) })
      toast.success("Role created")
      setShowCreate(false)
      refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (data: RoleFormData) => {
    if (!editing) return
    setSaving(true)
    try {
      await rbacFetch(`/rbac/roles/${editing.id}`, {
        method: "POST",
        body: JSON.stringify(data),
      })
      toast.success("Role updated")
      setEditing(null)
      refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await rbacFetch(`/rbac/roles/${confirmDelete.id}`, { method: "DELETE" })
      toast.success("Role deleted")
      setConfirmDelete(null)
      refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Container className="px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Heading level="h2">Roles</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Define what each role can access. Assign roles to team members below.
          </Text>
        </div>
        {canManage && (
          <FocusModal open={showCreate} onOpenChange={setShowCreate}>
            <FocusModal.Trigger asChild>
              <Button size="small">Add Role</Button>
            </FocusModal.Trigger>
            <FocusModal.Content>
              <FocusModal.Header>
                <Heading>Create Role</Heading>
              </FocusModal.Header>
              <FocusModal.Body className="overflow-y-auto">
                {showCreate && (
                  <RoleForm
                    catalog={catalog}
                    onSave={handleCreate}
                    onClose={() => setShowCreate(false)}
                    saving={saving}
                  />
                )}
              </FocusModal.Body>
            </FocusModal.Content>
          </FocusModal>
        )}
      </div>

      {isLoading ? (
        <Text size="small" className="text-ui-fg-muted">
          Loading…
        </Text>
      ) : (
        <div className="overflow-x-auto">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Role</Table.HeaderCell>
              <Table.HeaderCell>Permissions</Table.HeaderCell>
              <Table.HeaderCell>Members</Table.HeaderCell>
              <Table.HeaderCell></Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {roles.map((role) => (
              <Table.Row key={role.id}>
                <Table.Cell>
                  <div className="flex items-center gap-x-2">
                    <Text size="small" weight="plus">
                      {role.name}
                    </Text>
                    {role.slug === "owner" ? (
                      <Badge size="2xsmall" color="purple">
                        Owner
                      </Badge>
                    ) : role.is_system ? (
                      <Badge size="2xsmall" color="grey">
                        System
                      </Badge>
                    ) : null}
                  </div>
                  {role.description && (
                    <Text size="xsmall" className="text-ui-fg-muted line-clamp-1">
                      {role.description}
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Text size="small" className="text-ui-fg-subtle">
                    {role.permissions.includes("*")
                      ? "Full access"
                      : `${role.permissions.length} permission${
                          role.permissions.length === 1 ? "" : "s"
                        }`}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{role.user_count}</Text>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-x-2 justify-end">
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => setEditing(role)}
                    >
                      {canManage && role.slug !== "owner" ? "Edit" : "View"}
                    </Button>
                    {canManage && !role.is_system && (
                      <Button
                        size="small"
                        variant="danger"
                        onClick={() => setConfirmDelete(role)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        </div>
      )}

      {/* Edit / view drawer */}
      <Drawer open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <Drawer.Content>
          <Drawer.Header>
            <Heading>
              {canManage && editing?.slug !== "owner" ? "Edit Role" : "Role"}
            </Heading>
          </Drawer.Header>
          <Drawer.Body className="overflow-y-auto">
            {editing && (
              <RoleForm
                key={editing.id}
                initial={editing}
                catalog={catalog}
                onSave={handleEdit}
                onClose={() => setEditing(null)}
                saving={saving}
                locked={editing.slug === "owner" || !canManage}
                lockName={editing.is_system}
              />
            )}
          </Drawer.Body>
        </Drawer.Content>
      </Drawer>

      {/* Delete confirmation */}
      <Prompt open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Delete role?</Prompt.Title>
            <Prompt.Description>
              {confirmDelete?.user_count
                ? `${confirmDelete.user_count} member(s) will lose this role's access. `
                : ""}
              This cannot be undone.
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel disabled={deleting}>Cancel</Prompt.Cancel>
            <Prompt.Action onClick={handleDelete}>Delete</Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </Container>
  )
}

// ---- Team members section -------------------------------------------------

function TeamSection({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient()
  const { data: rolesData } = useQuery({
    queryKey: ["rbac-roles"],
    queryFn: () => rbacFetch<{ roles: Role[] }>("/rbac/roles"),
  })
  const { data: usersData, isLoading } = useQuery({
    queryKey: ["rbac-users"],
    queryFn: () => rbacFetch<{ users: TeamUser[] }>("/rbac/users"),
  })

  const roles = rolesData?.roles ?? []
  const users = usersData?.users ?? []

  const [managing, setManaging] = useState<TeamUser | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (managing) setSelected(new Set(managing.roles.map((r) => r.id)))
  }, [managing])

  const save = async () => {
    if (!managing) return
    setSaving(true)
    try {
      await rbacFetch(`/rbac/users/${managing.id}/roles`, {
        method: "POST",
        body: JSON.stringify({ role_ids: [...selected] }),
      })
      toast.success("Roles updated")
      setManaging(null)
      qc.invalidateQueries({ queryKey: ["rbac-users"] })
      qc.invalidateQueries({ queryKey: ["rbac-roles"] })
      qc.invalidateQueries({ queryKey: ["rbac-me"] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const displayName = (u: TeamUser) =>
    [u.first_name, u.last_name].filter(Boolean).join(" ") || "—"

  return (
    <Container className="px-6 py-6">
      <div className="mb-6">
        <Heading level="h2">Team Members</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Assign one or more roles to each admin user.
        </Text>
      </div>

      {isLoading ? (
        <Text size="small" className="text-ui-fg-muted">
          Loading…
        </Text>
      ) : (
        <div className="overflow-x-auto">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Email</Table.HeaderCell>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>Roles</Table.HeaderCell>
              <Table.HeaderCell></Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {users.map((u) => (
              <Table.Row key={u.id}>
                <Table.Cell>
                  <Text size="small" weight="plus">
                    {u.email}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{displayName(u)}</Text>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 ? (
                      <Text size="xsmall" className="text-ui-fg-muted">
                        No roles
                      </Text>
                    ) : (
                      u.roles.map((r) => (
                        <Badge
                          key={r.id}
                          size="2xsmall"
                          color={r.slug === "owner" ? "purple" : "grey"}
                        >
                          {r.name}
                        </Badge>
                      ))
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex justify-end">
                    {canManage && (
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => setManaging(u)}
                      >
                        Manage Roles
                      </Button>
                    )}
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        </div>
      )}

      <Drawer open={!!managing} onOpenChange={(open) => !open && setManaging(null)}>
        <Drawer.Content>
          <Drawer.Header>
            <Heading>Manage Roles</Heading>
          </Drawer.Header>
          <Drawer.Body className="overflow-y-auto">
            {managing && (
              <div className="flex flex-col gap-y-4">
                <Text size="small" className="text-ui-fg-subtle">
                  {managing.email}
                </Text>
                <div className="flex flex-col gap-y-1">
                  {roles.map((r) => (
                    <label
                      key={r.id}
                      className="flex items-center gap-x-2 py-1.5 cursor-pointer"
                    >
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggle(r.id)}
                      />
                      <div className="flex items-center gap-x-2">
                        <Text size="small">{r.name}</Text>
                        {r.slug === "owner" && (
                          <Badge size="2xsmall" color="purple">
                            Owner
                          </Badge>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-x-2 pt-2 border-t border-ui-border-base">
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => setManaging(null)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button size="small" onClick={save} isLoading={saving} disabled={saving}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </Drawer.Body>
        </Drawer.Content>
      </Drawer>
    </Container>
  )
}

// ---- Page -----------------------------------------------------------------

const AccessControlPage = () => {
  const { can, isSuperAdmin, isLoading } = usePermissions()
  const canRead = isSuperAdmin || can("rbac", "read")
  const canManage = isSuperAdmin || can("rbac", "manage")

  if (isLoading) {
    return (
      <div className="p-4">
        <Text size="small" className="text-ui-fg-muted">
          Loading…
        </Text>
      </div>
    )
  }

  if (!canRead) {
    return (
      <Container className="px-6 py-10 m-4">
        <div className="text-center">
          <Heading level="h2">No access</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-2">
            You don't have permission to manage roles and access control.
          </Text>
        </div>
      </Container>
    )
  }

  return (
    <div className="flex flex-col gap-y-4 p-4">
      <div>
        <Heading level="h1">Access Control</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Manage roles, permissions and team-member access.
        </Text>
      </div>
      <RolesSection canManage={canManage} />
      <TeamSection canManage={canManage} />
    </div>
  )
}

// No route config on purpose: this is now a tab inside Store Settings rather than its own
// sidebar entry. The page still renders at /app/access-control if you link to it directly.
export default AccessControlPage
