import { Trash } from "@medusajs/icons"
import { Button, Container, IconButton, Input, Label, Table, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { opApi, type CourierRate } from "../../../lib/order-processing-api"

/**
 * What each courier zone costs US.
 *
 * This is what turns "delivery" from a guess into a number. Charge the customer ৳100, pay the
 * courier ৳60, and you made ৳40 carrying the parcel. Charge ৳60 and pay ৳120 and every single
 * order quietly bleeds ৳60 — which is invisible until the fee is written down somewhere.
 *
 * The fee auto-fills when the courier is booked and can be corrected per order.
 */
export function CourierRatesSection() {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Record<string, { fee: string; cod: string }>>({})

  const { data, isLoading } = useQuery({
    queryKey: ["courier-rates"],
    queryFn: () => opApi.rates(),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["courier-rates"] })

  const save = useMutation({
    mutationFn: (body: unknown) => opApi.saveRate(body),
    onSuccess: () => {
      toast.success("Courier rate saved")
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => opApi.deleteRate(id),
    onSuccess: () => {
      toast.success("Zone removed")
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const rates = data?.courier_rates ?? []
  const val = (r: CourierRate, k: "fee" | "cod") =>
    draft[r.id]?.[k] ?? String(k === "fee" ? r.fee : r.cod_fee_pct)

  const edit = (r: CourierRate, k: "fee" | "cod", v: string) =>
    setDraft((d) => ({
      ...d,
      [r.id]: {
        fee: k === "fee" ? v : (d[r.id]?.fee ?? String(r.fee)),
        cod: k === "cod" ? v : (d[r.id]?.cod ?? String(r.cod_fee_pct)),
      },
    }))

  return (
    <Container className="flex flex-col gap-y-4 px-6 py-6">
      <Text size="small" className="text-ui-fg-subtle">
        What the courier charges <b>you</b> per zone, plus their cut for collecting cash on
        delivery. This auto-fills the fee when you book a courier, and is what makes delivery
        margin visible on every order.
      </Text>

      {isLoading ? (
        <Text size="small" className="text-ui-fg-muted">
          Loading…
        </Text>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ui-border-base">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Zone</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Fee (BDT)</Table.HeaderCell>
                <Table.HeaderCell className="text-right">COD fee (%)</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rates.map((r) => (
                <Table.Row key={r.id}>
                  <Table.Cell>{r.name}</Table.Cell>
                  <Table.Cell className="text-right">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      className="w-24"
                      value={val(r, "fee")}
                      onChange={(e) => edit(r, "fee", e.target.value)}
                    />
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      className="w-20"
                      value={val(r, "cod")}
                      onChange={(e) => edit(r, "cod", e.target.value)}
                    />
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <div className="flex items-center justify-end gap-x-1">
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() =>
                          save.mutate({
                            id: r.id,
                            fee: Number(val(r, "fee")) || 0,
                            cod_fee_pct: Number(val(r, "cod")) || 0,
                          })
                        }
                      >
                        Save
                      </Button>
                      <IconButton
                        size="small"
                        variant="transparent"
                        onClick={() => remove.mutate(r.id)}
                      >
                        <Trash />
                      </IconButton>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          size="small"
          variant="secondary"
          onClick={() => save.mutate({ name: "New zone", fee: 0, cod_fee_pct: 0 })}
        >
          Add zone
        </Button>
      </div>
    </Container>
  )
}
