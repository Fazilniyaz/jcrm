"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Target,
  TrendingUp,
  Handshake,
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  Save,
  ArrowRightLeft,
  LayoutGrid,
  Rows3,
  Mail,
  Phone,
} from "lucide-react";
import {
  Card,
  CardHeader,
  Badge,
  Avatar,
  StatTile,
  TableWrap,
  Th,
  Td,
  Tr,
  ExpandRow,

  Button,
  IconButton,
  SearchBox,
  Chip,
  Grid,
  EmptyState,
  ModuleSkeleton,
  SectionLabel,
  tone,
} from "@/components/ui";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import {
  FormGrid,
  NumberInput,
  SelectInput,
  Span,
  TextArea,
  TextInput,
} from "@/components/ui/form";
import { useStore } from "@/lib/store/StoreProvider";
import {
  clientById,
  employeeById,
  formatDate,
  initialsOf,
  money,
  moneyShort,
  pipelineValue,
  winRate,
} from "@/lib/store/selectors";
import {
  LEAD_SOURCES,
  LEAD_STAGE_TONE,
  LEAD_STAGES,
  type Lead,
  type LeadSource,
  type LeadStage,
} from "@/lib/store/types";

/*
 * Leads — the sales pipeline, with full CRUD.
 *
 * A won deal is not deleted and retyped as a client: converting keeps the lead
 * row and points it at the account it became, so the pipeline history survives
 * the close.
 */

export function Leads() {
  const { hydrated, state, leads, deleteLead, convertLead } = useStore();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<LeadStage | "All">("All");
  const [view, setView] = useState<"board" | "list">("board");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Lead | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Lead | null>(null);

  const totals = useMemo(() => pipelineValue(leads), [leads]);
  const byStage = useMemo(
    () =>
      Object.fromEntries(LEAD_STAGES.map((s) => [s, leads.filter((l) => l.stage === s).length])) as
        Record<LeadStage, number>,
    [leads],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads
      .filter((l) => {
        if (stage !== "All" && l.stage !== stage) return false;
        if (!q) return true;
        return `${l.company} ${l.contact} ${l.code} ${l.email}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.value - a.value);
  }, [leads, query, stage]);

  if (!hydrated) return <ModuleSkeleton />;

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label="Open Leads"
          value={String(leads.filter((l) => l.stage !== "Won" && l.stage !== "Lost").length)}
          hint={`${leads.length} in total`}
          t="blue"
          icon={Target}
        />
        <StatTile
          label="Pipeline Value"
          value={moneyShort(totals.open)}
          hint={`Weighted: ${moneyShort(totals.weighted)}`}
          t="sky"
          icon={TrendingUp}
        />
        <StatTile
          label="Won"
          value={moneyShort(totals.won)}
          hint={`${byStage.Won} deal${byStage.Won === 1 ? "" : "s"} closed`}
          t="orange"
          icon={Handshake}
        />
        <StatTile
          label="Win Rate"
          value={`${winRate(leads)}%`}
          hint="Of everything decided"
          t="slate"
          icon={Briefcase}
        />
      </Grid>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          placeholder="Search leads…"
          value={query}
          onChange={setQuery}
          className="sm:w-56"
        />
        <Chip active={stage === "All"} onClick={() => setStage("All")} count={leads.length}>
          All
        </Chip>
        {LEAD_STAGES.map((s) => (
          <Chip key={s} active={stage === s} onClick={() => setStage(s)} count={byStage[s]}>
            {s}
          </Chip>
        ))}

        <div className="ms-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-sm border border-line">
            {(
              [
                { key: "board", icon: LayoutGrid, label: "Board view" },
                { key: "list", icon: Rows3, label: "List view" },
              ] as const
            ).map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                aria-label={v.label}
                aria-pressed={view === v.key}
                title={v.label}
                className={`flex h-9 w-9 items-center justify-center transition-colors ${
                  view === v.key ? "bg-primary text-white" : "bg-card text-muted hover:text-primary"
                }`}
              >
                <v.icon size={16} />
              </button>
            ))}
          </div>
          <Button icon={Plus} onClick={openCreate}>
            New Lead
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={Target}
            title={leads.length === 0 ? "No leads yet" : "Nothing matches"}
            desc={
              leads.length === 0
                ? "Add the first lead to start tracking the pipeline."
                : "Try a different search term or stage."
            }
            action={
              leads.length === 0 ? (
                <Button icon={Plus} onClick={openCreate}>
                  New Lead
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : view === "board" ? (
        <div className="-mx-1 overflow-x-auto px-1 pb-2">
          <div className="grid min-w-[1100px] grid-cols-5 gap-4">
            {LEAD_STAGES.map((s) => {
              const items = visible.filter((l) => l.stage === s);
              return (
                <section key={s} className="flex flex-col">
                  <header className="mb-3 flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: tone[LEAD_STAGE_TONE[s]].solid }}
                    />
                    <h3 className="text-[0.8125rem] font-semibold text-heading">{s}</h3>
                    <span className="rounded-sm bg-subtle px-1.5 py-0.5 text-[0.6875rem] font-semibold text-muted">
                      {items.length}
                    </span>
                  </header>
                  <div className="space-y-3">
                    {items.length === 0 && (
                      <p className="rounded-card border border-dashed border-line p-4 text-center text-[0.75rem] text-muted">
                        Nothing here
                      </p>
                    )}
                    {items.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => {
                          setEditing(l);
                          setFormOpen(true);
                        }}
                        className="w-full rounded-card border border-line bg-card p-3 text-left shadow-card transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <div className="flex items-start gap-2.5">
                          <Avatar
                            initials={initialsOf(l.contact)}
                            t={LEAD_STAGE_TONE[l.stage]}
                            size={32}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[0.8125rem] font-semibold text-heading">
                              {l.company}
                            </p>
                            <p className="truncate text-[0.6875rem] text-muted">{l.contact}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-[0.875rem] font-bold text-heading">
                            {money(l.value)}
                          </span>
                          <Badge t={LEAD_STAGE_TONE[l.stage]}>{l.source}</Badge>
                        </div>
                        <p className="mt-1.5 font-mono text-[0.625rem] text-muted">{l.code}</p>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader title="All Leads" desc="Select a row for the full record." />
          <TableWrap>
            <thead>
              <tr className="border-b border-line">
                <Th>Company</Th>
                <Th>Contact</Th>
                <Th>Value</Th>
                <Th>Stage</Th>
                <Th>Source</Th>
                <Th>Owner</Th>
                <Th>Updated</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => {
                const expanded = openId === l.id;
                const owner = employeeById(state, l.ownerId);
                return (
                  <Fragment key={l.id}>
                    <Tr expanded={expanded} onClick={() => setOpenId(expanded ? null : l.id)}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={expanded ? `Collapse ${l.company}` : `Expand ${l.company}`}
                            aria-expanded={expanded}
                            className="shrink-0 text-muted transition-transform hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            style={{ transform: expanded ? "rotate(90deg)" : undefined }}
                          >
                            <ChevronRight size={16} />
                          </button>
                          <span className="min-w-0">
                            <span className="block font-semibold text-heading">{l.company}</span>
                            <span className="font-mono text-[0.6875rem] text-muted">{l.code}</span>
                          </span>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap">{l.contact}</Td>
                      <Td className="whitespace-nowrap font-semibold text-heading">
                        {money(l.value)}
                      </Td>
                      <Td>
                        <Badge t={LEAD_STAGE_TONE[l.stage]}>{l.stage}</Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{l.source}</Td>
                      <Td className="whitespace-nowrap text-muted">{owner?.name ?? "—"}</Td>
                      <Td className="whitespace-nowrap text-muted">{formatDate(l.updatedAt)}</Td>
                      <Td>
                        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <IconButton
                            icon={Pencil}
                            label={`Edit ${l.company}`}
                            onClick={() => {
                              setEditing(l);
                              setFormOpen(true);
                            }}
                          />
                          <IconButton
                            icon={Trash2}
                            label={`Delete ${l.company}`}
                            tone="red"
                            onClick={() => setPendingDelete(l)}
                          />
                        </div>
                      </Td>
                    </Tr>

                    {expanded && (
                      <ExpandRow colSpan={8}>
                        <LeadDetail lead={l} onConvert={() => convertLead(l.id)} />
                      </ExpandRow>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {formOpen && (
        <LeadForm
          key={editing?.id ?? "new"}
          open={formOpen}
          lead={editing}
          onClose={() => setFormOpen(false)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteLead(pendingDelete.id)}
        title="Delete lead"
        message={`${pendingDelete?.company ?? "This lead"} (${pendingDelete?.code ?? ""}) will be removed from the pipeline.`}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- detail -- */

function LeadDetail({ lead, onConvert }: { lead: Lead; onConvert: () => void }) {
  const { state } = useStore();
  const owner = employeeById(state, lead.ownerId);
  const converted = clientById(state, lead.clientId);

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-7">
        {lead.notes && (
          <div>
            <SectionLabel>Notes</SectionLabel>
            <p className="text-[0.8125rem] leading-relaxed text-text">{lead.notes}</p>
          </div>
        )}

        <dl className="divide-y divide-line rounded-sm border border-line bg-card px-3 py-1">
          <Row label="Value" value={money(lead.value)} />
          <Row label="Stage" value={lead.stage} />
          <Row label="Source" value={lead.source} />
          <Row label="Owner" value={owner?.name ?? "Unassigned"} />
          <Row label="Created" value={formatDate(lead.createdAt)} />
          <Row label="Last updated" value={formatDate(lead.updatedAt)} />
        </dl>

        {/* Converting is the bridge between the pipeline and the account list. */}
        {converted ? (
          <p
            className="flex items-center gap-2 rounded-sm p-3 text-[0.75rem] leading-relaxed"
            style={{ background: tone.sky.soft, color: tone.sky.text }}
          >
            <ArrowRightLeft size={14} className="shrink-0" />
            Converted into <strong>{converted.name}</strong> ({converted.id}) — see Clients.
          </p>
        ) : (
          lead.stage === "Won" && (
            <div className="flex flex-wrap items-center gap-3 rounded-sm bg-subtle p-3">
              <p className="min-w-0 flex-1 text-[0.75rem] leading-relaxed text-muted">
                This deal is won but has no account yet. Converting creates a client record and
                links the two.
              </p>
              <Button icon={ArrowRightLeft} onClick={onConvert}>
                Convert to client
              </Button>
            </div>
          )
        )}
      </div>

      <div className="space-y-4 xl:col-span-5">
        <div className="flex items-center gap-3 rounded-sm border border-line bg-card p-3">
          <Avatar initials={initialsOf(lead.contact)} t={LEAD_STAGE_TONE[lead.stage]} size={40} />
          <div className="min-w-0">
            <p className="truncate text-[0.875rem] font-semibold text-heading">{lead.contact}</p>
            <p className="truncate text-[0.75rem] text-muted">{lead.company}</p>
          </div>
        </div>

        <dl className="divide-y divide-line rounded-sm border border-line bg-card px-3 py-1">
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="flex shrink-0 items-center gap-1.5 text-[0.75rem] text-muted">
              <Mail size={13} />
              Email
            </dt>
            <dd className="min-w-0 truncate text-[0.8125rem] font-medium text-heading">
              {lead.email}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="flex shrink-0 items-center gap-1.5 text-[0.75rem] text-muted">
              <Phone size={13} />
              Phone
            </dt>
            <dd className="min-w-0 truncate text-[0.8125rem] font-medium text-heading">
              {lead.phone}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[0.75rem] text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[0.8125rem] font-medium text-heading">
        {value}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ form -- */

function LeadForm({
  open,
  lead,
  onClose,
}: {
  open: boolean;
  lead?: Lead;
  onClose: () => void;
}) {
  const { employees, createLead, updateLead } = useStore();

  const [company, setCompany] = useState(lead?.company ?? "");
  const [contact, setContact] = useState(lead?.contact ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [value, setValue] = useState(lead?.value ?? 0);
  const [stage, setStage] = useState<LeadStage>(lead?.stage ?? "New");
  const [source, setSource] = useState<LeadSource>(lead?.source ?? "Website");
  const [ownerId, setOwnerId] = useState(lead?.ownerId ?? "");
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sales own the pipeline; managers can hold a lead too.
  const owners = useMemo(
    () => employees.filter((e) => e.role === "Sales" || e.role === "Manager"),
    [employees],
  );

  function save() {
    const next: Record<string, string> = {};
    if (!company.trim()) next.company = "Name the company.";
    if (!contact.trim()) next.contact = "Who is the contact?";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      next.email = "That doesn't look like an email address.";
    if (!Number.isFinite(value) || value < 0) next.value = "Enter a value of zero or more.";
    if (!ownerId) next.ownerId = "Assign an owner.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload = {
      company: company.trim(),
      contact: contact.trim(),
      email: email.trim(),
      phone: phone.trim(),
      value,
      stage,
      source,
      ownerId,
      notes: notes.trim() || undefined,
    };

    if (lead) updateLead(lead.id, payload);
    else createLead(payload);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lead ? `Edit ${lead.code}` : "New lead"}
      desc={lead ? "Changes update the pipeline immediately." : "A new lead starts in the New stage."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Save} onClick={save}>
            {lead ? "Save changes" : "Create lead"}
          </Button>
        </>
      }
    >
      <FormGrid>
        <TextInput
          label="Company"
          required
          value={company}
          onChange={setCompany}
          placeholder="Brightwave Media"
          error={errors.company}
        />
        <TextInput
          label="Contact"
          required
          value={contact}
          onChange={setContact}
          placeholder="Elena Voss"
          error={errors.contact}
        />

        <TextInput
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="elena@brightwave.media"
          error={errors.email}
        />
        <TextInput label="Phone" type="tel" value={phone} onChange={setPhone} />

        <NumberInput
          label="Deal value"
          required
          value={value}
          onChange={setValue}
          min={0}
          step={500}
          suffix="USD"
          error={errors.value}
        />
        <SelectInput<string>
          label="Owner"
          required
          value={ownerId}
          onChange={setOwnerId}
          options={[
            { value: "", label: "Choose an owner…" },
            ...owners.map((e) => ({ value: e.id, label: `${e.name} · ${e.role}` })),
          ]}
          error={errors.ownerId}
        />

        <SelectInput<LeadStage>
          label="Stage"
          value={stage}
          onChange={setStage}
          options={LEAD_STAGES.map((s) => ({ value: s, label: s }))}
          hint={stage === "Won" ? "Convert it to a client from the lead's detail row." : undefined}
        />
        <SelectInput<LeadSource>
          label="Source"
          value={source}
          onChange={setSource}
          options={LEAD_SOURCES.map((s) => ({ value: s, label: s }))}
        />

        <Span>
          <TextArea
            label="Notes"
            rows={3}
            value={notes}
            onChange={setNotes}
            placeholder="Where it came from, what they need, what happens next."
          />
        </Span>
      </FormGrid>
    </Modal>
  );
}
