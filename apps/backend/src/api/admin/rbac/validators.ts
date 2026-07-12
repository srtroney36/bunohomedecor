import { z } from "zod"

export const CreateRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  permissions: z.array(z.string()).default([]),
})
export type CreateRoleSchema = z.infer<typeof CreateRoleSchema>

export const UpdateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullish(),
  permissions: z.array(z.string()).optional(),
})
export type UpdateRoleSchema = z.infer<typeof UpdateRoleSchema>

export const AssignRolesSchema = z.object({
  role_ids: z.array(z.string()).default([]),
})
export type AssignRolesSchema = z.infer<typeof AssignRolesSchema>
