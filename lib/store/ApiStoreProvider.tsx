"use client";

import { useMemo } from "react";
import { StoreContext, useStore, type StoreValue } from "./StoreProvider";
import type {
  Client,
  Employee,
  EmployeeStatus,
  Milestone,
  Notification,
  Project,
  SecretEntry,
  Task,
} from "./types";
import { nextCodeFrom } from "./codes";
import {
  useClearNotificationsMutation,
  useCreateClientMutation,
  useCreateEmployeeMutation,
  useDeleteClientMutation,
  useListClientsQuery,
  useUpdateClientMutation,
  useCreateProjectMutation,
  useCreateTaskMutation,
  useDeleteEmployeeMutation,
  useDeleteProjectMutation,
  useDeleteTaskMutation,
  useListEmployeesQuery,
  useListNotificationsQuery,
  useListProjectsQuery,
  useListTasksQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useSetMyStatusMutation,
  useSetProjectPlanMutation,
  useSetProjectSecretsMutation,
  useScoreChecklistItemMutation,
  useSubmitQcReviewMutation,
  useUpdateEmployeeMutation,
  useUpdateProjectMutation,
  useUpdateTaskMutation,
  useUpdateWorkspaceMutation,
  useGetWorkspaceQuery,
} from "@/lib/api/api";
import {
  toApiClientBody,
  toApiEmployeeBody,
  toApiPlan,
  toApiProjectBody,
  toApiSecrets,
  toApiStatus,
  toApiTaskBody,
  toUiClient,
  toUiEmployee,
  toUiProject,
  toUiTask,
} from "@/lib/api/adapters";
import { useSession } from "@/lib/api/session";
import { reportMutationError } from "@/lib/api/mutationErrors";
import MutationErrorBanner from "@/components/layout/MutationErrorBanner";

/*
 * The API overlay.
 *
 * The module components were not rewritten. They still call `useStore()` and
 * still render lib/store/types.ts — the brief was the exact existing
 * functionality, and the surest way to keep it is to change what the store
 * returns rather than the twenty components that read it.
 *
 * So this provider re-provides the SAME context with four slices swapped for
 * live API data:
 *
 *     employees   projects   tasks   settings (workspace)
 *
 * Everything else — leads, clients, leave, clock, calendar — still comes from
 * the local demo store underneath, untouched, exactly as the brief asked.
 * Notifications are merged: task and project events now come from the server
 * (they are raised there), leave events still come from the local store.
 *
 * When nobody is signed into the API this component is a pass-through, so every
 * demo portal keeps behaving precisely as it did before the backend existed.
 */

/**
 * Mutations are fire-and-forget: StoreValue's signatures return void.
 *
 * "Fire and forget" must not mean "fail and say nothing". A rejected write used
 * to be console.error'd with the raw RTK Query error — which is a plain
 * `{ status, data }` object, not an Error, and printed as `{}` in the Next
 * overlay. So a create that the API refused looked to the user like a create
 * that silently did nothing. Failures now go to a channel the shell renders.
 */
function run(promise: { unwrap: () => Promise<unknown> }, what: string) {
  promise.unwrap().catch((error: unknown) => {
    reportMutationError(what, error);
  });
}

export default function ApiStoreProvider({ children }: { children: React.ReactNode }) {
  const local = useStore();
  const session = useSession();
  const signedIn = session.status === "user";

  // `skip` keeps a signed-out demo portal from firing eight 401s on every load.
  const employeesQuery = useListEmployeesQuery(undefined, { skip: !signedIn });
  const projectsQuery = useListProjectsQuery(undefined, { skip: !signedIn });
  const tasksQuery = useListTasksQuery(undefined, { skip: !signedIn });
  const notificationsQuery = useListNotificationsQuery(undefined, { skip: !signedIn });
  const workspaceQuery = useGetWorkspaceQuery(undefined, { skip: !signedIn });

  const clientsQuery = useListClientsQuery(undefined, { skip: !signedIn });

  const [createClientMutation] = useCreateClientMutation();
  const [updateClientMutation] = useUpdateClientMutation();
  const [deleteClientMutation] = useDeleteClientMutation();

  const [createEmployeeMutation] = useCreateEmployeeMutation();
  const [updateEmployeeMutation] = useUpdateEmployeeMutation();
  const [deleteEmployeeMutation] = useDeleteEmployeeMutation();
  const [setMyStatusMutation] = useSetMyStatusMutation();

  const [createProjectMutation] = useCreateProjectMutation();
  const [updateProjectMutation] = useUpdateProjectMutation();
  const [deleteProjectMutation] = useDeleteProjectMutation();
  const [setPlanMutation] = useSetProjectPlanMutation();
  const [setSecretsMutation] = useSetProjectSecretsMutation();

  const [createTaskMutation] = useCreateTaskMutation();
  const [updateTaskMutation] = useUpdateTaskMutation();
  const [deleteTaskMutation] = useDeleteTaskMutation();
  const [submitQcReviewMutation] = useSubmitQcReviewMutation();
  const [scoreChecklistItemMutation] = useScoreChecklistItemMutation();

  const [markReadMutation] = useMarkNotificationReadMutation();
  const [markAllReadMutation] = useMarkAllNotificationsReadMutation();
  const [clearNotificationsMutation] = useClearNotificationsMutation();
  const [updateWorkspaceMutation] = useUpdateWorkspaceMutation();

  const value = useMemo<StoreValue>(() => {
    /*
     * While the session is still resolving, report NOT hydrated.
     *
     * Falling through to `local` here is what made a reload flash the seeded
     * demo workspace — fourteen invented employees and their projects — before
     * the real data arrived. Every module already renders a skeleton when
     * `hydrated` is false, which is the honest answer to "we don't know yet".
     */
    if (session.status === "loading") return { ...local, hydrated: false };

    if (session.status !== "user") return local;

    const me = session.user;
    const isAdmin = me.roles.includes("superAdmin") || me.isOwner;

    const employees: Employee[] = (employeesQuery.data ?? []).map(toUiEmployee);
    const projects: Project[] = (projectsQuery.data ?? []).map(toUiProject);
    const clients: Client[] = (clientsQuery.data ?? []).map(toUiClient);

    // Tasks carry `createdBy` as a display name, so the lookup is built from
    // the roster we already have rather than asking the API to denormalise it.
    const nameById = new Map(employees.map((e) => [e.id, e.name]));
    const nameOf = (id: string) => nameById.get(id) ?? "—";
    const tasks: Task[] = (tasksQuery.data ?? []).map((task) => toUiTask(task, nameOf));

    // Server-raised notifications (tasks, projects, QC) plus whatever the local
    // store still raises (leave, calendar), newest first.
    const serverNotifications: Notification[] = (notificationsQuery.data ?? []).map((n) => ({
      id: n.id,
      to: n.toUserId,
      kind: n.kind as Notification["kind"],
      title: n.title,
      detail: n.detail,
      at: n.createdAt,
      read: n.read,
      ...(n.taskId ? { taskId: n.taskId } : {}),
    }));
    const serverIds = new Set(serverNotifications.map((n) => n.id));
    const notifications = [...serverNotifications, ...local.notifications].sort((a, b) =>
      b.at.localeCompare(a.at),
    );

    const currentEmployee = employees.find((e) => e.id === me.id);

    const settings = {
      autoEmployeeId: workspaceQuery.data?.settings.autoEmployeeId ?? local.settings.autoEmployeeId,
      /*
       * The branch scope is an ADMIN view filter, and only an admin gets it.
       *
       * The client-side scoping in selectors.ts resolves a project's branch
       * through the employee roster — and an employee has no Employees module,
       * so that roster comes back empty for them and `scopedProjects` filtered
       * away every project they had just accepted. The server has already
       * scoped their data by membership; a second, half-blind filter on top
       * could only ever subtract things they were entitled to see.
       */
      defaultBranch: isAdmin ? (workspaceQuery.data?.settings.defaultBranch ?? null) : null,
      // The currency of the branch in force, so money() formats in it.
      currency: workspaceQuery.data?.settings.currency ?? null,
    };

    const state = {
      ...local.state,
      employees,
      projects,
      tasks,
      clients,
      notifications,
      settings,
    };

    return {
      ...local,
      // The skeleton stays up until the three core lists have arrived, so no
      // module ever renders "0 employees" on the way to rendering fourteen.
      hydrated:
        local.hydrated &&
        !employeesQuery.isLoading &&
        !projectsQuery.isLoading &&
        !tasksQuery.isLoading,
      state,
      employees,
      projects,
      tasks,
      clients,
      notifications,
      settings,
      currentUser: me.name,
      currentEmployee,

      /* -------------------------------------------------------- clients -- */

      createClient: (input) => {
        run(createClientMutation(toApiClientBody(input)), "create client");
      },
      updateClient: (id, patch) => {
        run(updateClientMutation({ id, patch: toApiClientBody(patch) }), "update client");
      },
      deleteClient: (id) => {
        run(deleteClientMutation(id), "delete client");
      },

      /* ------------------------------------------------------ employees -- */

      createEmployee: (input) => {
        run(
          createEmployeeMutation({
            ...toApiEmployeeBody(input),
            name: input.name,
            email: input.email,
            roles: toApiEmployeeBody({ role: input.role }).roles,
            sendInvite: true,
          }),
          "create employee",
        );
      },
      updateEmployee: (id, patch) => {
        run(updateEmployeeMutation({ id, patch: toApiEmployeeBody(patch) }), "update employee");
      },
      deleteEmployee: (id) => {
        run(deleteEmployeeMutation(id), "delete employee");
      },
      setEmployeeStatus: (employeeId: string, status: EmployeeStatus) => {
        // The API only ever lets someone set their OWN availability, which is
        // what the header control does. A row-level status edit by an admin
        // goes through updateEmployee instead.
        if (employeeId === me.id) {
          run(
            setMyStatusMutation({ currentStatus: toApiStatus(status), userId: me.id }),
            "set status",
          );
          return;
        }
        run(
          updateEmployeeMutation({ id: employeeId, patch: { currentStatus: toApiStatus(status) } }),
          "set status",
        );
      },

      /* ------------------------------------------------------- projects -- */

      createProject: (input) => {
        run(
          createProjectMutation({
            ...toApiProjectBody(input),
            name: input.name,
            managerIds: input.reportTo ?? [],
            memberIds: input.assignedEmployees ?? [],
          }),
          "create project",
        );
      },
      updateProject: (id, patch) => {
        run(updateProjectMutation({ id, patch: toApiProjectBody(patch) }), "update project");
      },
      deleteProject: (id) => {
        run(deleteProjectMutation(id), "delete project");
      },
      setProjectPlan: (projectId: string, plan: Milestone[]) => {
        run(setPlanMutation({ id: projectId, plan: toApiPlan(plan) }), "save plan");
      },
      setProjectSecrets: (projectId: string, secrets: SecretEntry[]) => {
        run(setSecretsMutation({ id: projectId, secrets: toApiSecrets(secrets) }), "save vault");
      },

      /* ---------------------------------------------------------- tasks -- */

      createTask: (input) => {
        run(
          createTaskMutation({
            ...toApiTaskBody(input),
            title: input.title,
            projectIds: input.projectIds,
            assigneeIds: input.assignedTo ?? [],
          }),
          "create task",
        );
      },
      updateTask: (id, patch, note) => {
        run(
          updateTaskMutation({
            id,
            patch: { ...toApiTaskBody(patch), ...(note ? { note } : {}) },
          }),
          "update task",
        );
      },
      deleteTask: (id) => {
        run(deleteTaskMutation(id), "delete task");
      },
      /*
       * One subtask's acceptance score.
       *
       * Goes to the dedicated endpoint rather than PATCHing the whole task:
       * that endpoint rewrites only the named line, so two people scoring
       * different subtasks on the same task cannot overwrite each other with a
       * stale copy of the array. It is optimistic in api.ts — a round trip per
       * tick would make the control feel broken.
       */
      scoreSubtask: (taskId: string, subtaskId: string, score: number) => {
        run(
          scoreChecklistItemMutation({ id: taskId, itemId: subtaskId, score }),
          "score subtask",
        );
      },
      submitQcReview: (taskId, input) => {
        run(
          submitQcReviewMutation({
            id: taskId,
            verdict: input.verdict,
            failedItemIds: input.failedItemIds,
            ...(input.note ? { note: input.note } : {}),
          }),
          "submit QC review",
        );
      },

      /* -------------------------------------------------- notifications -- */

      markNotificationRead: (id) => {
        if (serverIds.has(id)) run(markReadMutation(id), "mark notification read");
        else local.markNotificationRead(id);
      },
      markAllNotificationsRead: (employeeId) => {
        run(markAllReadMutation(), "mark all read");
        local.markAllNotificationsRead(employeeId);
      },
      clearNotifications: (employeeId) => {
        run(clearNotificationsMutation(), "clear notifications");
        local.clearNotifications(employeeId);
      },

      /* ------------------------------------------------------- settings -- */

      setSettings: (patch) => {
        run(updateWorkspaceMutation({ ...patch }), "save workspace settings");
      },
      setDefaultBranch: (branch) => {
        run(updateWorkspaceMutation({ defaultBranch: branch }), "set default branch");
      },

      /* ---------------------------------------------------------- codes -- */
      /* Computed from live data so a code is never handed out twice. */
      suggestEmployeeId: () => nextCodeFrom(employees.map((e) => e.empId), "JDX", 3),
      suggestProjectCode: () => nextCodeFrom(projects.map((p) => p.code), "PRJ", 3),
      suggestTaskCode: () => nextCodeFrom(tasks.map((t) => t.taskId), "TSK", 3),
    };
  }, [
    local,
    session,
    employeesQuery.data,
    employeesQuery.isLoading,
    projectsQuery.data,
    projectsQuery.isLoading,
    tasksQuery.data,
    tasksQuery.isLoading,
    clientsQuery.data,
    createClientMutation,
    updateClientMutation,
    deleteClientMutation,
    notificationsQuery.data,
    workspaceQuery.data,
    createEmployeeMutation,
    updateEmployeeMutation,
    deleteEmployeeMutation,
    setMyStatusMutation,
    createProjectMutation,
    updateProjectMutation,
    deleteProjectMutation,
    setPlanMutation,
    setSecretsMutation,
    createTaskMutation,
    updateTaskMutation,
    deleteTaskMutation,
    submitQcReviewMutation,
    scoreChecklistItemMutation,
    markReadMutation,
    markAllReadMutation,
    clearNotificationsMutation,
    updateWorkspaceMutation,
  ]);

  return (
    <StoreContext.Provider value={value}>
      {children}
      <MutationErrorBanner />
    </StoreContext.Provider>
  );
}
