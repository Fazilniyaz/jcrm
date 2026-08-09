"use client";

import { useState } from "react";
import {
  Building2,
  Check,
  Globe2,
  MapPin,
  Pencil,
  Plus,
  Star,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  Grid,
  ModuleSkeleton,
  Progress,
  StatTile,
  tone,
} from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { TextInput } from "@/components/ui/form";
import {
  useCreateBranchMutation,
  useDeleteBranchMutation,
  useListBranchesQuery,
  useSetDefaultBranchMutation,
  useUpdateBranchMutation,
} from "@/lib/api/api";
import BranchLocationFields from "./BranchLocationFields";
import { apiErrorMessage } from "@/lib/api/baseQuery";
import { initialsOf } from "@/lib/store/selectors";
import type { Branch } from "@/lib/api/types";

/*
 * Branches, against the API.
 *
 * A company starts with exactly one branch — the `headBranch` typed into the
 * Create Company form — and that one is the standing default. Until a second
 * office exists the scope is a no-op, which is why it costs nothing to have it
 * always in force.
 *
 * Pinning a branch narrows EVERY module, not just this one: the store's
 * `settings.defaultBranch` is what `scopedEmployees` / `scopedProjects` /
 * `scopedTasks` in lib/store/selectors.ts already filter on, and the banner in
 * the shell states it wherever it applies.
 */

export default function LiveBranches({ canManage }: { canManage: boolean }) {
  const { data, isLoading, isError, error } = useListBranchesQuery();

  const [createBranch, createState] = useCreateBranchMutation();
  const [updateBranch] = useUpdateBranchMutation();
  const [deleteBranch] = useDeleteBranchMutation();
  const [setDefault] = useSetDefaultBranchMutation();

  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<Branch | null>(null);
  const [deleting, setDeleting] = useState<Branch | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (isLoading) return <ModuleSkeleton rows={4} />;

  if (isError || !data) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={Building2}
            title="Can't load branches"
            desc={apiErrorMessage(error, "The API didn't answer.")}
          />
        </CardBody>
      </Card>
    );
  }

  const { branches, scope, groupHeadcount, unassigned } = data;
  const max = Math.max(1, ...branches.map((b) => b.headcount));
  const largest = branches.reduce<Branch | null>(
    (a, b) => (a === null || b.headcount > a.headcount ? b : a),
    null,
  );

  async function run(action: Promise<unknown>, success: string) {
    setFormError(null);
    try {
      await action;
      setNotice(success);
      setAdding(false);
      setRenaming(null);
      setDeleting(null);
      setName("");
      setCity("");
      setCountry("");
    } catch (err) {
      const message = apiErrorMessage(err);
      // A modal is open, so the message belongs next to the field being edited.
      if (adding || renaming) setFormError(message);
      else setNotice(message);
    }
  }

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label="Branches"
          value={String(branches.length)}
          hint={branches.length === 1 ? "Head office only" : "Offices in this company"}
          t="blue"
          icon={Building2}
        />
        <StatTile
          label="Company headcount"
          value={String(groupHeadcount)}
          hint="Everyone on the roster"
          t="sky"
          icon={Users}
        />
        <StatTile
          label="Largest branch"
          value={largest?.name ?? "—"}
          hint="By headcount"
          t="orange"
          icon={MapPin}
        />
        <StatTile
          label="Default branch"
          value={scope.allBranches ? "All" : (scope.defaultBranch ?? "—")}
          hint={
            scope.allBranches
              ? "Nothing is scoped"
              : scope.explicit
                ? "Pinned — every module is scoped"
                : "Head office, by default"
          }
          t={scope.allBranches ? "slate" : "orange"}
          icon={Star}
        />
      </Grid>

      {notice && (
        <Card>
          <CardBody className="flex flex-wrap items-center gap-3 py-3">
            <p className="min-w-0 flex-1 text-[0.8125rem] text-heading">{notice}</p>
            <Button variant="ghost" onClick={() => setNotice(null)}>
              Dismiss
            </Button>
          </CardBody>
        </Card>
      )}

      {unassigned > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-sm p-3"
          style={{ background: tone.orange.soft, color: tone.orange.text }}
        >
          <TriangleAlert size={15} className="shrink-0" />
          <p className="min-w-0 flex-1 text-[0.75rem] leading-relaxed">
            {unassigned} {unassigned === 1 ? "person has" : "people have"} no branch set. While a
            branch is pinned they won&rsquo;t appear in any module — assign them from Employees.
          </p>
        </div>
      )}

      {canManage && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm bg-subtle p-3">
          <Star size={15} className="shrink-0 text-muted" />
          <p className="min-w-0 flex-1 text-[0.75rem] leading-relaxed text-muted">
            The default branch scopes <strong>every module</strong> to that office — employee
            counts, projects, tasks, leave and attendance. It applies to the whole workspace, not
            just to you. The head office is the default until you pin another.
          </p>
          <Button
            variant={scope.allBranches ? "primary" : "ghost"}
            icon={Globe2}
            onClick={() =>
              void run(
                setDefault({ all: !scope.allBranches }).unwrap(),
                scope.allBranches
                  ? "Scoped back to the head office."
                  : "Showing every branch — nothing is scoped.",
              )
            }
          >
            {scope.allBranches ? "Scoped to all branches" : "Show all branches"}
          </Button>
          <Button
            icon={Plus}
            onClick={() => {
              setName("");
              setFormError(null);
              setAdding(true);
            }}
          >
            Add branch
          </Button>
        </div>
      )}

      <Grid cols={3}>
        {branches.map((branch) => {
          const isDefault = branch.isDefault && !scope.allBranches;
          return (
            <Card
              key={branch.id}
              // Outlined rather than tinted, so the accent stays available for
              // status inside the card.
              className={`flex flex-col p-4 ${isDefault ? "ring-2 ring-primary" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[0.9375rem] font-semibold text-heading">
                    {branch.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[0.75rem] text-muted">
                    <MapPin size={12} className="shrink-0" />
                    {[branch.city, branch.countryName].filter(Boolean).join(", ") ||
                      (branch.isHead ? "Head office" : "Location not set")}
                  </p>
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {isDefault && <Badge t="blue">Default</Badge>}
                  {branch.isHead && <Badge t="slate">Head</Badge>}
                  {branch.currency && <Badge t="sky">{branch.currency}</Badge>}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
                <div>
                  <p className="text-[0.6875rem] text-muted">Headcount</p>
                  <p className="text-[1rem] font-bold text-heading">{branch.headcount}</p>
                </div>
                <div>
                  <p className="text-[0.6875rem] text-muted">Projects</p>
                  <p className="text-[1rem] font-bold text-heading">{branch.projectCount}</p>
                </div>
              </div>

              <div className="mt-3">
                <Progress value={(branch.headcount / max) * 100} t={isDefault ? "blue" : "sky"} />
              </div>

              <div className="mt-4 flex items-center gap-2.5">
                <Avatar
                  initials={branch.lead ? initialsOf(branch.lead.name) : "—"}
                  t={(branch.lead?.tone as "blue") ?? "slate"}
                  size={30}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.75rem] font-medium text-heading">
                    {branch.lead?.name ?? "No lead yet"}
                  </p>
                  <p className="text-[0.6875rem] text-muted">
                    {branch.lead ? "Branch lead" : "Assign a manager here"}
                  </p>
                </div>
              </div>

              {canManage && (
                <div className="mt-4 flex flex-wrap gap-1 border-t border-line pt-3">
                  {!isDefault && (
                    <Button
                      icon={Check}
                      onClick={() =>
                        void run(
                          setDefault({ branchId: branch.id }).unwrap(),
                          `Every module is now scoped to ${branch.name}.`,
                        )
                      }
                    >
                      Set as default
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    icon={Pencil}
                    onClick={() => {
                      setName(branch.name);
                      setCity(branch.city ?? "");
                      setCountry(branch.country ?? "");
                      setFormError(null);
                      setRenaming(branch);
                    }}
                  >
                    Edit
                  </Button>
                  {!branch.isHead && (
                    <Button variant="danger" icon={Trash2} onClick={() => setDeleting(branch)}>
                      Delete
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </Grid>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a branch"
        desc="A new office for this company. Employees are assigned to one from their record."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || !city.trim() || !country || createState.isLoading}
              onClick={() =>
                void run(
                  createBranch({ name: name.trim(), city: city.trim(), country }).unwrap(),
                  `${name.trim()} added.`,
                )
              }
            >
              {createState.isLoading ? "Adding…" : "Add branch"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextInput
            label="Branch name"
            value={name}
            onChange={setName}
            placeholder="Bengaluru office"
            error={formError ?? undefined}
            required
          />
          <BranchLocationFields
            country={country}
            city={city}
            onCountryChange={setCountry}
            onCityChange={setCity}
          />
        </div>
      </Modal>

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={`Edit ${renaming?.name ?? "branch"}`}
        desc={
          renaming?.isHead
            ? "This is the head office — renaming it also updates the company record."
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || !city.trim() || !country}
              onClick={() =>
                renaming &&
                void run(
                  updateBranch({
                    id: renaming.id,
                    patch: { name: name.trim(), city: city.trim(), country },
                  }).unwrap(),
                  `${name.trim()} saved.`,
                )
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextInput
            label="Branch name"
            value={name}
            onChange={setName}
            error={formError ?? undefined}
            required
          />
          <BranchLocationFields
            country={country}
            city={city}
            onCountryChange={setCountry}
            onCityChange={setCity}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          void run(deleteBranch(deleting.id).unwrap(), `${deleting.name} removed.`)
        }
        title={`Delete ${deleting?.name ?? "branch"}?`}
        message={
          deleting && deleting.headcount > 0
            ? `${deleting.headcount} ${deleting.headcount === 1 ? "person is" : "people are"} still assigned here. Move them to another branch first — this will be refused otherwise.`
            : "The branch will be removed. Nobody is assigned to it."
        }
        confirmLabel="Delete branch"
      />
    </div>
  );
}
