"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Handshake,
  FolderKanban,
  Users,
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  Save,
  Mail,
  Phone,
  CircleAlert,
  LinkIcon,
} from "lucide-react";
import {
  Card,
  CardHeader,
  Badge,
  Avatar,
  Progress,
  StatTile,
  TableWrap,
  Th,
  Td,
  Tr,
  ExpandRow,
  Toolbar,
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
  formatDate,
  initialsOf,
  money,
  moneyShort,
  planProgress,
  projectsForClient,
} from "@/lib/store/selectors";
import {
  CLIENT_STATUS_TONE,
  CLIENT_STATUSES,
  PROJECT_STATUS_TONE,
  type Client,
  type ClientStatus,
} from "@/lib/store/types";
import type { Tone } from "@/lib/ui/tone";

/*
 * Clients — the accounts we deliver for, with full CRUD.
 *
 * Every project carries a `clientId`, so an account's engagements are a lookup
 * rather than a name match. The row flags any account with no project attached,
 * because an account nobody is delivering for is either a mistake or a lapsed
 * relationship, and both are worth seeing.
 */

const AVATAR_TONES: Tone[] = ["blue", "sky", "orange", "slate", "red"];

export function Clients() {
  const { hydrated, state, clients, projects, deleteClient } = useStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ClientStatus | "All">("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Client | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Client | null>(null);

  const rows = useMemo(
    () => clients.map((c) => ({ client: c, linked: projectsForClient(state, c.id) })),
    [clients, state],
  );

  const counts = useMemo(
    () => ({
      total: clients.length,
      linked: rows.filter((r) => r.linked.length > 0).length,
      unlinked: rows.filter((r) => r.linked.length === 0).length,
      value: clients.reduce((n, c) => n + c.value, 0),
      byStatus: Object.fromEntries(
        CLIENT_STATUSES.map((s) => [s, clients.filter((c) => c.status === s).length]),
      ) as Record<ClientStatus, number>,
    }),
    [clients, rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter(({ client }) => {
        if (status !== "All" && client.status !== status) return false;
        if (!q) return true;
        return `${client.name} ${client.contact} ${client.industry} ${client.code ?? client.id}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => b.client.value - a.client.value);
  }, [rows, query, status]);

  if (!hydrated) return <ModuleSkeleton />;

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label="Accounts"
          value={String(counts.total)}
          hint={`${counts.byStatus.Active} active`}
          t="blue"
          icon={Handshake}
        />
        <StatTile
          label="Lifetime Value"
          value={moneyShort(counts.value)}
          hint="Across every account"
          t="sky"
          icon={Briefcase}
        />
        <StatTile
          label="With Projects"
          value={`${counts.linked} / ${counts.total}`}
          hint={`${projects.length} projects linked`}
          t="orange"
          icon={FolderKanban}
        />
        <StatTile
          label="No Project"
          value={String(counts.unlinked)}
          hint={counts.unlinked === 0 ? "Every account is delivering" : "Nothing being delivered"}
          t={counts.unlinked === 0 ? "slate" : "red"}
          icon={CircleAlert}
        />
      </Grid>

      <Card>
        <CardHeader
          title="Client Accounts"
          desc="Select a row to see the engagements attached to that account."
          action={
            <Toolbar>
              <SearchBox
                placeholder="Search accounts…"
                value={query}
                onChange={setQuery}
                className="sm:w-52"
              />
              <Button icon={Plus} onClick={openCreate}>
                New Client
              </Button>
            </Toolbar>
          }
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <Chip active={status === "All"} onClick={() => setStatus("All")} count={counts.total}>
            All
          </Chip>
          {CLIENT_STATUSES.map((s) => (
            <Chip
              key={s}
              active={status === s}
              onClick={() => setStatus(s)}
              count={counts.byStatus[s]}
            >
              {s}
            </Chip>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title={clients.length === 0 ? "No accounts yet" : "Nothing matches"}
            desc={
              clients.length === 0
                ? "Add a client, then link projects to it from Project Management."
                : "Try a different search term or status."
            }
            action={
              clients.length === 0 ? (
                <Button icon={Plus} onClick={openCreate}>
                  New Client
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableWrap>
            <thead>
              <tr className="border-b border-line">
                <Th>Account</Th>
                <Th>Contact</Th>
                <Th>Industry</Th>
                <Th>Projects</Th>
                <Th>Value</Th>
                <Th>Since</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ client, linked }) => {
                const expanded = openId === client.id;
                return (
                  <Fragment key={client.id}>
                    <Tr expanded={expanded} onClick={() => setOpenId(expanded ? null : client.id)}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={expanded ? `Collapse ${client.name}` : `Expand ${client.name}`}
                            aria-expanded={expanded}
                            className="shrink-0 text-muted transition-transform hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            style={{ transform: expanded ? "rotate(90deg)" : undefined }}
                          >
                            <ChevronRight size={16} />
                          </button>
                          <Avatar initials={initialsOf(client.name)} t={client.tone} size={34} />
                          <span className="min-w-0">
                            <span className="block whitespace-nowrap font-semibold text-heading">
                              {client.name}
                            </span>
                            <span className="font-mono text-[0.6875rem] text-muted">
                              {client.code ?? client.id}
                            </span>
                          </span>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap">{client.contact}</Td>
                      <Td className="whitespace-nowrap text-muted">{client.industry}</Td>
                      <Td className="whitespace-nowrap">
                        {linked.length === 0 ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[0.6875rem] font-semibold"
                            style={{ background: tone.red.soft, color: tone.red.text }}
                          >
                            <CircleAlert size={11} />
                            None
                          </span>
                        ) : (
                          <span className="font-semibold text-heading">{linked.length}</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap font-semibold text-heading">
                        {money(client.value)}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{client.since}</Td>
                      <Td>
                        <Badge t={CLIENT_STATUS_TONE[client.status]}>{client.status}</Badge>
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <IconButton
                            icon={Pencil}
                            label={`Edit ${client.name}`}
                            onClick={() => {
                              setEditing(client);
                              setFormOpen(true);
                            }}
                          />
                          <IconButton
                            icon={Trash2}
                            label={`Delete ${client.name}`}
                            tone="red"
                            onClick={() => setPendingDelete(client)}
                          />
                        </div>
                      </Td>
                    </Tr>

                    {expanded && (
                      <ExpandRow colSpan={8}>
                        <ClientDetail client={client} />
                      </ExpandRow>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {formOpen && (
        <ClientForm
          key={editing?.id ?? "new"}
          open={formOpen}
          client={editing}
          onClose={() => setFormOpen(false)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteClient(pendingDelete.id)}
        title="Delete client"
        message={`${pendingDelete?.name ?? "This account"} will be removed. Its projects are kept but will no longer belong to an account — reassign them from Project Management.`}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- detail -- */

function ClientDetail({ client }: { client: Client }) {
  const { state } = useStore();
  const linked = projectsForClient(state, client.id);

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-5">
        <div className="flex items-center gap-3 rounded-sm border border-line bg-card p-3">
          <Avatar initials={initialsOf(client.name)} t={client.tone} size={44} />
          <div className="min-w-0">
            <p className="truncate text-[0.9375rem] font-semibold text-heading">{client.name}</p>
            <p className="truncate text-[0.75rem] text-muted">
              {client.industry} · client since {client.since}
            </p>
          </div>
        </div>

        {client.notes && (
          <div>
            <SectionLabel>Notes</SectionLabel>
            <p className="text-[0.8125rem] leading-relaxed text-text">{client.notes}</p>
          </div>
        )}

        <dl className="divide-y divide-line rounded-sm border border-line bg-card px-3 py-1">
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="flex shrink-0 items-center gap-1.5 text-[0.75rem] text-muted">
              <Users size={13} />
              Contact
            </dt>
            <dd className="min-w-0 truncate text-[0.8125rem] font-medium text-heading">
              {client.contact}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="flex shrink-0 items-center gap-1.5 text-[0.75rem] text-muted">
              <Mail size={13} />
              Email
            </dt>
            <dd className="min-w-0 truncate text-[0.8125rem] font-medium text-heading">
              {client.email}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="flex shrink-0 items-center gap-1.5 text-[0.75rem] text-muted">
              <Phone size={13} />
              Phone
            </dt>
            <dd className="min-w-0 truncate text-[0.8125rem] font-medium text-heading">
              {client.phone}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="shrink-0 text-[0.75rem] text-muted">Lifetime value</dt>
            <dd className="text-[0.8125rem] font-medium text-heading">{money(client.value)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="shrink-0 text-[0.75rem] text-muted">Portal login</dt>
            <dd className="text-[0.8125rem] font-medium text-heading">
              {client.portal ?? "None"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="xl:col-span-7">
        <div className="mb-2 flex items-center gap-1.5 text-muted">
          <FolderKanban size={14} />
          <SectionLabel>Projects on this account ({linked.length})</SectionLabel>
        </div>

        {linked.length === 0 ? (
          <div
            className="rounded-sm p-4 text-[0.8125rem] leading-relaxed"
            style={{ background: tone.red.soft, color: tone.red.text }}
          >
            <p className="flex items-center gap-1.5 font-semibold">
              <CircleAlert size={14} />
              No project attached
            </p>
            <p className="mt-1">
              Open a project in Project Management and pick <strong>{client.name}</strong> as its
              client — that link is what puts the delivery plan in front of them on Monitor.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {linked.map((p) => (
              <li key={p.id} className="rounded-sm border border-line bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[0.875rem] font-semibold text-heading">
                      {p.name}
                    </span>
                    <span className="font-mono text-[0.6875rem] text-muted">
                      {p.code} · {p.plan.length} milestones
                    </span>
                  </span>
                  <Badge t={PROJECT_STATUS_TONE[p.status]}>{p.status}</Badge>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <Progress value={planProgress(p)} t={PROJECT_STATUS_TONE[p.status]} />
                  <span className="w-9 shrink-0 text-right text-[0.75rem] font-semibold text-heading">
                    {planProgress(p)}%
                  </span>
                </div>

                <p className="mt-2 flex items-center gap-1.5 text-[0.6875rem] text-muted">
                  <LinkIcon size={11} />
                  {formatDate(p.startDate)} → {formatDate(p.endDate)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ form -- */

function ClientForm({
  open,
  client,
  onClose,
}: {
  open: boolean;
  client?: Client;
  onClose: () => void;
}) {
  const { clients, createClient, updateClient } = useStore();

  const [name, setName] = useState(client?.name ?? "");
  const [contact, setContact] = useState(client?.contact ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [industry, setIndustry] = useState(client?.industry ?? "");
  const [value, setValue] = useState(client?.value ?? 0);
  const [since, setSince] = useState(client?.since ?? new Date().getFullYear().toString());
  const [status, setStatus] = useState<ClientStatus>(client?.status ?? "Onboarding");
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function save() {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Name the account.";
    else if (
      clients.some(
        (c) => c.name.toLowerCase() === name.trim().toLowerCase() && c.id !== client?.id,
      )
    )
      next.name = "An account with that name already exists.";
    if (!contact.trim()) next.contact = "Who is the primary contact?";
    if (!email.trim()) next.email = "Enter an email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      next.email = "That doesn't look like an email address.";
    if (!industry.trim()) next.industry = "What sector are they in?";
    if (!Number.isFinite(value) || value < 0) next.value = "Enter a value of zero or more.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload = {
      name: name.trim(),
      contact: contact.trim(),
      email: email.trim(),
      phone: phone.trim(),
      industry: industry.trim(),
      value,
      since: since.trim(),
      status,
      notes: notes.trim() || undefined,
    };

    if (client) {
      updateClient(client.id, payload);
    } else {
      createClient({
        ...payload,
        // Rotated rather than asked for — one less decision in the form.
        tone: AVATAR_TONES[clients.length % AVATAR_TONES.length],
      });
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client ? `Edit ${client.name}` : "New client"}
      desc={
        client
          ? "Renaming an account updates it on every project it owns."
          : "Once saved, link projects to this account from Project Management."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Save} onClick={save}>
            {client ? "Save changes" : "Create client"}
          </Button>
        </>
      }
    >
      <FormGrid>
        <TextInput
          label="Account name"
          required
          value={name}
          onChange={setName}
          placeholder="Northwind Ltd"
          error={errors.name}
        />
        <TextInput
          label="Industry"
          required
          value={industry}
          onChange={setIndustry}
          placeholder="Retail"
          error={errors.industry}
        />

        <TextInput
          label="Primary contact"
          required
          value={contact}
          onChange={setContact}
          placeholder="Daniel Fernandes"
          error={errors.contact}
        />
        <TextInput
          label="Email"
          required
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="daniel.f@northwind.co.uk"
          error={errors.email}
        />

        <TextInput label="Phone" type="tel" value={phone} onChange={setPhone} />
        <TextInput
          label="Client since"
          value={since}
          onChange={setSince}
          placeholder="2026"
          hint="Year the relationship started."
        />

        <NumberInput
          label="Lifetime value"
          required
          value={value}
          onChange={setValue}
          min={0}
          step={1000}
          suffix="USD"
          error={errors.value}
        />
        <SelectInput<ClientStatus>
          label="Status"
          value={status}
          onChange={setStatus}
          options={CLIENT_STATUSES.map((s) => ({ value: s, label: s }))}
        />

        <Span>
          <TextArea
            label="Notes"
            rows={3}
            value={notes}
            onChange={setNotes}
            placeholder="Anything the delivery team should know before talking to them."
          />
        </Span>
      </FormGrid>
    </Modal>
  );
}
