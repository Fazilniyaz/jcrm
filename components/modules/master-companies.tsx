"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  Copy,
  Link2,
  Mail,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  TableWrap,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { FormGrid, Span, TextArea, TextInput } from "@/components/ui/form";
import BranchLocationFields from "./BranchLocationFields";
import {
  useCreateCompanyMutation,
  useDeleteCompanyMutation,
  useListCompaniesQuery,
  useResendCompanyInviteMutation,
  useUpdateCompanyMutation,
} from "@/lib/api/api";
import { apiErrorMessage } from "@/lib/api/baseQuery";
import { formatDate } from "@/lib/store/selectors";
import type { Company } from "@/lib/api/types";

/*
 * Companies — the master portal's CRUD.
 *
 * Creating one does three things server-side in a single transaction: the
 * company, its head branch, and an owner user with the superAdmin role and no
 * password. The owner then gets an emailed invite, and setting a password there
 * is what flips both the user and the company from `invited` to `active`.
 */

const STATE_TONE = { active: "sky", invited: "orange", disabled: "red" } as const;

/** A labelled group inside the company form. */
function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 border-b border-line pb-2">
        <h3 className="text-[0.8125rem] font-semibold text-heading">{title}</h3>
        <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted">{desc}</p>
      </div>
      {children}
    </section>
  );
}

type FormState = {
  companyName: string;
  companyAddress: string;
  linkedinProfile: string;
  companyWebsite: string;
  about: string;
  ownerName: string;
  email: string;
  headBranch: string;
  headBranchCity: string;
  headBranchCountry: string;
};

const EMPTY: FormState = {
  companyName: "",
  companyAddress: "",
  linkedinProfile: "",
  companyWebsite: "",
  about: "",
  ownerName: "",
  email: "",
  headBranch: "",
  headBranchCity: "",
  headBranchCountry: "",
};

export default function MasterCompanies() {
  const { data: companies = [], isLoading, isError, error } = useListCompaniesQuery();

  const [createCompany, createState] = useCreateCompanyMutation();
  const [updateCompany] = useUpdateCompanyMutation();
  const [deleteCompany] = useDeleteCompanyMutation();
  const [resendInvite] = useResendCompanyInviteMutation();

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Company | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Company | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /* Shown only when SMTP isn't configured — the API returns the link so the
     flow is still completable in local development. */
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      [c.companyName, c.ownerName, c.email, c.headBranch].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    );
  }, [companies, query]);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function openCreate() {
    setForm(EMPTY);
    setFormError(null);
    setInviteLink(null);
    setCreating(true);
  }

  function openEdit(company: Company) {
    setForm({
      companyName: company.companyName,
      companyAddress: company.companyAddress,
      linkedinProfile: company.linkedinProfile ?? "",
      companyWebsite: company.companyWebsite,
      about: company.about,
      ownerName: company.ownerName,
      email: company.email,
      headBranch: company.headBranch,
      // The list response carries the company, not its branch rows, so these
      // are filled from the head branch once the detail query resolves below.
      headBranchCity: company.headBranchCity ?? "",
      headBranchCountry: company.headBranchCountry ?? "",
    });
    setFormError(null);
    setEditing(company);
  }

  async function submitCreate() {
    setFormError(null);
    try {
      const result = await createCompany({
        ...form,
        // Empty optional fields are omitted rather than sent as "" — the API
        // validates a LinkedIn URL when one is present.
        linkedinProfile: form.linkedinProfile.trim() || undefined,
      }).unwrap();

      setCreating(false);
      setNotice(
        result.invite.queued
          ? `Invitation sent to ${result.company.email}.`
          : `${result.company.companyName} created. Email isn't configured, so use the link below.`,
      );
      setInviteLink(result.invite.url ?? null);
    } catch (err) {
      setFormError(apiErrorMessage(err, "Couldn't create that company."));
    }
  }

  async function submitEdit() {
    if (!editing) return;
    setFormError(null);
    try {
      // The owner's email is the tenant's identity and is not editable here —
      // changing it would orphan the account that can sign in.
      const { email: _ignored, ...patch } = form;
      await updateCompany({
        id: editing.id,
        patch: { ...patch, linkedinProfile: form.linkedinProfile.trim() || undefined },
      }).unwrap();
      setEditing(null);
    } catch (err) {
      setFormError(apiErrorMessage(err, "Couldn't save those changes."));
    }
  }

  async function toggleState(company: Company) {
    const next = company.state === "disabled" ? "active" : "disabled";
    try {
      await updateCompany({ id: company.id, patch: { state: next } }).unwrap();
      setNotice(
        next === "disabled"
          ? `${company.companyName} disabled — everyone in it has been signed out.`
          : `${company.companyName} re-enabled.`,
      );
    } catch (err) {
      setNotice(apiErrorMessage(err));
    }
  }

  async function resend(company: Company) {
    try {
      const result = await resendInvite(company.id).unwrap();
      setNotice(
        result.queued
          ? `Invitation re-sent to ${company.email}.`
          : "Email isn't configured — use the link below.",
      );
      setInviteLink(result.url ?? null);
    } catch (err) {
      setNotice(apiErrorMessage(err));
    }
  }

  async function confirmDelete() {
    if (!confirming) return;
    try {
      await deleteCompany({ id: confirming.id, confirmName: confirming.companyName }).unwrap();
      setNotice(`${confirming.companyName} and everything in it was deleted.`);
    } catch (err) {
      setNotice(apiErrorMessage(err));
    } finally {
      setConfirming(null);
    }
  }

  /*
   * Three sections, because the form describes three different things and a
   * flat grid made the country look like a property of the company rather than
   * of its head office.
   */
  const fields = (mode: "create" | "edit") => (
    <div className="space-y-6">
      <Section title="Company" desc="The legal entity operating on the platform.">
        <FormGrid>
          <Span>
            <TextInput
              label="Company name"
              value={form.companyName}
              onChange={set("companyName")}
              required
            />
          </Span>
          <Span>
            <TextInput
              label="Company address"
              value={form.companyAddress}
              onChange={set("companyAddress")}
              required
            />
          </Span>
          <TextInput
            label="Website"
            value={form.companyWebsite}
            onChange={set("companyWebsite")}
            type="url"
            placeholder="https://example.com"
            required
          />
          <TextInput
            label="LinkedIn profile"
            value={form.linkedinProfile}
            onChange={set("linkedinProfile")}
            type="url"
            placeholder="https://linkedin.com/company/…"
            hint="Optional."
          />
          <Span>
            <TextArea label="About" value={form.about} onChange={set("about")} required />
          </Span>
        </FormGrid>
      </Section>

      <Section
        title="Head branch"
        desc="The company's main office. It becomes the workspace's default branch, and its country sets the currency."
      >
        <FormGrid>
          <Span>
            <TextInput
              label="Branch name"
              value={form.headBranch}
              onChange={set("headBranch")}
              placeholder="Kochi HQ"
              hint="What this office is called."
              required
            />
          </Span>
          {/* Country, city and currency. Currency is derived from the country
              by the API and is never sent from here. */}
          <BranchLocationFields
            country={form.headBranchCountry}
            city={form.headBranchCity}
            onCountryChange={set("headBranchCountry")}
            onCityChange={set("headBranchCity")}
          />
        </FormGrid>
      </Section>

      <Section
        title="Owner"
        desc={
          mode === "edit"
            ? "The company's super admin."
            : "Gets an emailed invitation to set a password. Setting it activates the company."
        }
      >
        <FormGrid>
          <TextInput label="Owner name" value={form.ownerName} onChange={set("ownerName")} required />
          <TextInput
            label="Owner email"
            value={form.email}
            onChange={set("email")}
            type="email"
            required
            disabled={mode === "edit"}
            hint={
              mode === "edit"
                ? "Fixed — it identifies the account that signs in."
                : "The invitation to set a password goes here."
            }
          />
        </FormGrid>
      </Section>

      {formError && (
        <p
          role="alert"
          className="rounded-sm px-3 py-2 text-[0.8125rem]"
          style={{
            background: "rgba(var(--brand-red-rgb),0.12)",
            color: "rgb(var(--danger-rgb))",
          }}
        >
          {formError}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {notice && (
        <Card>
          <CardBody className="space-y-2 py-3">
            <p className="text-[0.8125rem] text-heading">{notice}</p>
            {inviteLink && (
              <div className="flex items-center gap-2 rounded-sm bg-subtle p-2">
                <Link2 size={14} className="shrink-0 text-muted" />
                <code className="min-w-0 flex-1 truncate text-[0.6875rem]">{inviteLink}</code>
                <Button
                  variant="ghost"
                  icon={Copy}
                  onClick={() => void navigator.clipboard?.writeText(inviteLink)}
                >
                  Copy
                </Button>
              </div>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                setNotice(null);
                setInviteLink(null);
              }}
            >
              Dismiss
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Companies"
          desc="Every tenant operating on the platform."
          action={
            <div className="flex items-center gap-2">
              <span className="relative hidden sm:block">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  aria-label="Search companies"
                  className="h-9 w-48 rounded-sm border border-input-border bg-form-bg pl-8 pr-3 text-[0.8125rem] outline-none focus:border-primary"
                />
              </span>
              <Button icon={Plus} onClick={openCreate}>
                New company
              </Button>
            </div>
          }
        />

        {isLoading ? (
          <CardBody>
            <p className="py-10 text-center text-[0.875rem] text-muted">Loading companies…</p>
          </CardBody>
        ) : isError ? (
          <CardBody>
            <EmptyState
              icon={Building2}
              title="Can't load companies"
              desc={apiErrorMessage(error, "The API didn't answer.")}
            />
          </CardBody>
        ) : rows.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={Building2}
              title={query ? "Nothing matches that search" : "No companies yet"}
              desc={
                query
                  ? "Try a different name, owner or email."
                  : "Create one and its owner will be emailed an invitation to set a password."
              }
              action={query ? undefined : <Button icon={Plus} onClick={openCreate}>New company</Button>}
            />
          </CardBody>
        ) : (
          <TableWrap>
            <thead>
              <tr className="border-b border-line">
                <Th>Company</Th>
                <Th>Owner</Th>
                <Th>People</Th>
                <Th>Created</Th>
                <Th>State</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((company) => (
                <Tr key={company.id}>
                  <Td className="font-medium text-heading">
                    {company.companyName}
                    <span className="block text-[0.6875rem] font-normal text-muted">
                      {[company.headBranch, company.headBranchCity, company.headBranchCountryName]
                        .filter(Boolean)
                        .join(" · ")}
                      {company.headBranchCurrency ? ` · ${company.headBranchCurrency}` : ""}
                    </span>
                  </Td>
                  <Td>
                    {company.ownerName}
                    <span className="block text-[0.6875rem] text-muted">{company.email}</span>
                  </Td>
                  <Td className="font-mono text-[0.75rem]">{company.userCount ?? 0}</Td>
                  <Td className="whitespace-nowrap text-muted">
                    {formatDate(company.createdAt.slice(0, 10))}
                  </Td>
                  <Td>
                    <Badge t={STATE_TONE[company.state]}>{company.state}</Badge>
                  </Td>
                  <Td className="text-right">
                    <span className="flex justify-end gap-1">
                      {company.state === "invited" && (
                        <Button
                          variant="ghost"
                          icon={Mail}
                          title="Re-send the owner's invitation"
                          onClick={() => void resend(company)}
                        >
                          Invite
                        </Button>
                      )}
                      <Button variant="ghost" icon={Pencil} onClick={() => openEdit(company)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        icon={Power}
                        title={company.state === "disabled" ? "Re-enable" : "Disable"}
                        onClick={() => void toggleState(company)}
                      >
                        {company.state === "disabled" ? "Enable" : "Disable"}
                      </Button>
                      <Button variant="danger" icon={Trash2} onClick={() => setConfirming(company)}>
                        Delete
                      </Button>
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New company"
        desc="Creates the tenant, its head branch and an owner account, then emails the owner an invitation to set a password."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitCreate()} disabled={createState.isLoading}>
              {createState.isLoading ? "Creating…" : "Create and invite"}
            </Button>
          </>
        }
      >
        {fields("create")}
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.companyName}` : "Edit company"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitEdit()}>Save changes</Button>
          </>
        }
      >
        {fields("edit")}
      </Modal>

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => void confirmDelete()}
        title={`Delete ${confirming?.companyName ?? "company"}?`}
        message="This removes the company and every user, project and task inside it. It cannot be undone."
        confirmLabel="Delete company"
      />
    </div>
  );
}
