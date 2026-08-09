import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "./baseQuery";
import { setAccessToken } from "./token";
import type {
  Branch,
  BranchList,
  BranchScope,
  Client,
  Company,
  CompanyDetail,
  Country,
  Employee,
  EmployeeDetail,
  InviteResult,
  LoginResponse,
  MasterDashboard,
  MasterLoginResponse,
  MeResponse,
  ModuleAccessMatrix,
  Notification,
  Profile,
  Project,
  ProjectInvitation,
  SecretEntry,
  Task,
  Workspace,
} from "./types";

/*
 * One API slice for the whole app.
 *
 * Tags are the cache contract. The rule followed throughout: a mutation
 * invalidates every list its result could have moved a row in or out of, plus
 * the specific row it touched. That is why, say, a QC review invalidates
 * Employee as well as Task — the verdict changes someone's KRA, and the roster
 * would otherwise keep showing the old number.
 */

type Envelope<T> = { data: T; meta?: Record<string, unknown> };
const unwrap = <T,>(response: Envelope<T>): T => response.data;

/*
 * Put a freshly created row into its list cache straight away.
 *
 * `invalidatesTags` alone is correct but not immediate: it marks the list stale
 * and the row only appears once the refetch lands, so every create was followed
 * by a visible wait for a second round trip. The server already returned the
 * created row — this shows it now, and the refetch that follows reconciles
 * anything derived (codes, counts, scoping) a moment later.
 *
 * Insert at the head because every list endpoint orders newest first.
 */
function insertOnCreate<Result, Row extends { id: string }>(
  endpoint: "listEmployees" | "listClients" | "listProjects" | "listTasks",
  pick: (result: Result) => Row | undefined,
) {
  return async (
    _arg: unknown,
    {
      dispatch,
      queryFulfilled,
    }: {
      // Loosely typed on purpose: RTK Query's MutationLifecycleApi is generic
      // over four parameters this helper does not need, and naming them all
      // would be more machinery than the two fields it actually reads.
      dispatch: (action: unknown) => unknown;
      queryFulfilled: PromiseLike<{ data: Result }>;
    },
  ) => {
    try {
      const { data } = await queryFulfilled;
      const row = pick(data);
      if (!row) return;
      dispatch(
        api.util.updateQueryData(endpoint, undefined, (draft: { id: string }[]) => {
          // The refetch can land first on a fast connection; don't double-add.
          if (draft.some((existing) => existing.id === row.id)) return;
          draft.unshift(row);
        }),
      );
    } catch {
      // A failed create has nothing to insert. The error surfaces through the
      // caller's own rejection handling.
    }
  };
}

export const api = createApi({
  reducerPath: "jadvixApi",
  baseQuery: baseQueryWithReauth,
  /*
   * `setupListeners` in redux.ts only has an effect if these are on — without
   * them it subscribes to focus and reconnect and then refetches nothing. This
   * is also what makes state that changes OUTSIDE this tab appear: an employee
   * accepting their invite flips them from Invited to Active on the server, and
   * no mutation in the admin's own session will ever invalidate that.
   */
  refetchOnFocus: true,
  refetchOnReconnect: true,
  tagTypes: [
    "Session",
    "Company",
    "CompanyList",
    "MasterDashboard",
    "Branch",
    "Client",
    "ClientList",
    "Employee",
    "EmployeeList",
    "Project",
    "ProjectList",
    "ProjectInvitations",
    "Task",
    "TaskList",
    "Secrets",
    "Profile",
    "ModuleAccess",
    "Workspace",
    "Notification",
  ],
  endpoints: (build) => ({
    /* ---------------------------------------------------------- auth -- */

    login: build.mutation<LoginResponse, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      transformResponse: unwrap,
      async onQueryStarted(_arg, { queryFulfilled }) {
        const { data } = await queryFulfilled;
        setAccessToken(data.accessToken);
      },
      invalidatesTags: ["Session"],
    }),

    masterLogin: build.mutation<MasterLoginResponse, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/master/login", method: "POST", body }),
      transformResponse: unwrap,
      async onQueryStarted(_arg, { queryFulfilled }) {
        const { data } = await queryFulfilled;
        setAccessToken(data.accessToken);
      },
      invalidatesTags: ["Session"],
    }),

    me: build.query<MeResponse, void>({
      query: () => "/auth/me",
      transformResponse: unwrap,
      providesTags: ["Session"],
    }),

    logout: build.mutation<void, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
      async onQueryStarted(_arg, { queryFulfilled, dispatch }) {
        // Clear the token whether or not the server answered — a failed logout
        // must still end the session in this tab.
        try {
          await queryFulfilled;
        } finally {
          setAccessToken(null);
          dispatch(api.util.resetApiState());
        }
      },
    }),

    /* ------------------------------------------------------- invite -- */

    validateInvite: build.query<
      { valid: true; name: string; email: string; companyName: string; isOwner: boolean },
      string
    >({
      query: (token) => ({ url: "/invite/validate", params: { token } }),
      transformResponse: unwrap,
    }),

    acceptInvite: build.mutation<
      { email: string; companyName: string; message: string },
      { token: string; password: string; confirmPassword: string }
    >({
      query: (body) => ({ url: "/invite/accept", method: "POST", body }),
      transformResponse: unwrap,
    }),

    /* ---------------------------------------------------- companies -- */

    listCompanies: build.query<Company[], { q?: string; state?: string } | void>({
      query: (params) => ({ url: "/companies", params: params ?? undefined }),
      transformResponse: unwrap,
      providesTags: (result) => [
        "CompanyList",
        ...(result ?? []).map((c) => ({ type: "Company" as const, id: c.id })),
      ],
    }),

    getCompany: build.query<CompanyDetail, string>({
      query: (id) => `/companies/${id}`,
      transformResponse: unwrap,
      providesTags: (_r, _e, id) => [{ type: "Company", id }],
    }),

    createCompany: build.mutation<
      { company: Company; invite: InviteResult },
      Record<string, unknown>
    >({
      query: (body) => ({ url: "/companies", method: "POST", body }),
      transformResponse: unwrap,
      invalidatesTags: ["CompanyList", "MasterDashboard"],
    }),

    updateCompany: build.mutation<Company, { id: string; patch: Record<string, unknown> }>({
      query: ({ id, patch }) => ({ url: `/companies/${id}`, method: "PATCH", body: patch }),
      transformResponse: unwrap,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Company", id },
        "CompanyList",
        "MasterDashboard",
      ],
    }),

    deleteCompany: build.mutation<void, { id: string; confirmName: string }>({
      query: ({ id, confirmName }) => ({
        url: `/companies/${id}`,
        method: "DELETE",
        body: { confirmName },
      }),
      invalidatesTags: ["CompanyList", "MasterDashboard"],
    }),

    resendCompanyInvite: build.mutation<InviteResult, string>({
      query: (id) => ({ url: `/companies/${id}/invite/resend`, method: "POST" }),
      transformResponse: unwrap,
      invalidatesTags: (_r, _e, id) => [{ type: "Company", id }, "MasterDashboard"],
    }),

    masterDashboard: build.query<MasterDashboard, void>({
      query: () => "/master/dashboard",
      transformResponse: unwrap,
      providesTags: ["MasterDashboard"],
    }),

    /* ---------------------------------------------------- reference -- */

    /**
     * The country → currency table, served by the API so there is one copy in
     * the system. Static for the life of a deploy, so it is kept for an hour
     * after the last component stops using it rather than refetched per form.
     */
    listCountries: build.query<Country[], void>({
      query: () => "/reference/countries",
      transformResponse: unwrap,
      keepUnusedDataFor: 3600,
    }),

    /* ----------------------------------------------------- branches -- */

    listBranches: build.query<BranchList, void>({
      query: () => "/branches",
      transformResponse: unwrap,
      providesTags: ["Branch"],
    }),

    createBranch: build.mutation<
      Branch,
      { name: string; city: string; country: string; setDefault?: boolean }
    >({
      query: (body) => ({ url: "/branches", method: "POST", body }),
      transformResponse: unwrap,
      invalidatesTags: ["Branch", "Workspace"],
    }),

    updateBranch: build.mutation<
      Branch,
      { id: string; patch: { name?: string; city?: string; country?: string } }
    >({
      query: ({ id, patch }) => ({ url: `/branches/${id}`, method: "PATCH", body: patch }),
      transformResponse: unwrap,
      // A rename can move the scope, and the roster carries branch NAMES.
      invalidatesTags: ["Branch", "Workspace", "EmployeeList"],
    }),

    deleteBranch: build.mutation<void, string>({
      query: (id) => ({ url: `/branches/${id}`, method: "DELETE" }),
      invalidatesTags: ["Branch", "Workspace", "EmployeeList"],
    }),

    /**
     * Pin the workspace to one office.
     *
     * `branchId: null` goes back to the head branch; `all: true` lifts the
     * scope. Invalidates everything the scope narrows, because after this call
     * every list in the app is showing the wrong set of rows.
     */
    setDefaultBranch: build.mutation<BranchScope, { branchId?: string | null; all?: boolean }>({
      query: (body) => ({ url: "/branches/default", method: "PUT", body }),
      transformResponse: unwrap,
      invalidatesTags: ["Branch", "Workspace", "EmployeeList", "ProjectList", "TaskList"],
    }),

    /* ---------------------------------------------------- employees -- */

    listEmployees: build.query<Employee[], void>({
      query: () => ({ url: "/employees", params: { perPage: 200 } }),
      transformResponse: unwrap,
      providesTags: (result) => [
        "EmployeeList",
        ...(result ?? []).map((e) => ({ type: "Employee" as const, id: e.id })),
      ],
    }),

    getEmployee: build.query<EmployeeDetail, string>({
      query: (id) => `/employees/${id}`,
      transformResponse: unwrap,
      providesTags: (_r, _e, id) => [{ type: "Employee", id }],
    }),

    createEmployee: build.mutation<
      { employee: Employee; invite: InviteResult | null },
      Record<string, unknown>
    >({
      query: (body) => ({ url: "/employees", method: "POST", body }),
      transformResponse: unwrap,
      onQueryStarted: insertOnCreate<{ employee: Employee }, Employee>(
        "listEmployees",
        (result) => result.employee,
      ),
      invalidatesTags: ["EmployeeList"],
    }),

    updateEmployee: build.mutation<Employee, { id: string; patch: Record<string, unknown> }>({
      query: ({ id, patch }) => ({ url: `/employees/${id}`, method: "PATCH", body: patch }),
      transformResponse: unwrap,
      invalidatesTags: (_r, _e, { id }) => [{ type: "Employee", id }, "EmployeeList", "ModuleAccess"],
    }),

    deleteEmployee: build.mutation<void, string>({
      query: (id) => ({ url: `/employees/${id}`, method: "DELETE" }),
      // Removing someone pulls them off projects and tasks too, so both lists
      // are stale the moment this returns.
      invalidatesTags: ["EmployeeList", "ProjectList", "TaskList", "ModuleAccess"],
    }),

    resendEmployeeInvite: build.mutation<InviteResult, string>({
      query: (id) => ({ url: `/employees/${id}/invite/resend`, method: "POST" }),
      transformResponse: unwrap,
      invalidatesTags: (_r, _e, id) => [{ type: "Employee", id }, "EmployeeList"],
    }),

    /** The header availability control. Optimistic — it must feel instant. */
    setMyStatus: build.mutation<Employee, { currentStatus: string; userId: string }>({
      query: ({ currentStatus }) => ({
        url: "/employees/me/status",
        method: "PATCH",
        body: { currentStatus },
      }),
      transformResponse: unwrap,
      async onQueryStarted({ currentStatus, userId }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          api.util.updateQueryData("listEmployees", undefined, (draft) => {
            const row = draft.find((e) => e.id === userId);
            if (row) row.currentStatus = currentStatus as Employee["currentStatus"];
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ["Profile"],
    }),

    /* ------------------------------------------------------ clients -- */

    listClients: build.query<Client[], void>({
      query: () => ({ url: "/clients", params: { perPage: 200 } }),
      transformResponse: unwrap,
      providesTags: (result) => [
        "ClientList",
        ...(result ?? []).map((c) => ({ type: "Client" as const, id: c.id })),
      ],
    }),

    createClient: build.mutation<Client, Record<string, unknown>>({
      query: (body) => ({ url: "/clients", method: "POST", body }),
      transformResponse: unwrap,
      onQueryStarted: insertOnCreate<Client, Client>("listClients", (result) => result),
      invalidatesTags: ["ClientList"],
    }),

    updateClient: build.mutation<Client, { id: string; patch: Record<string, unknown> }>({
      query: ({ id, patch }) => ({ url: `/clients/${id}`, method: "PATCH", body: patch }),
      transformResponse: unwrap,
      // A rename carries into the projects that name the account.
      invalidatesTags: (_r, _e, { id }) => [{ type: "Client", id }, "ClientList", "ProjectList"],
    }),

    deleteClient: build.mutation<void, string>({
      query: (id) => ({ url: `/clients/${id}`, method: "DELETE" }),
      // Projects survive but lose the link.
      invalidatesTags: ["ClientList", "ProjectList"],
    }),

    /* ----------------------------------------------------- projects -- */

    listProjects: build.query<Project[], void>({
      query: () => ({ url: "/projects", params: { perPage: 200 } }),
      transformResponse: unwrap,
      providesTags: (result) => [
        "ProjectList",
        ...(result ?? []).map((p) => ({ type: "Project" as const, id: p.id })),
      ],
    }),

    getProject: build.query<Project, string>({
      query: (id) => `/projects/${id}`,
      transformResponse: unwrap,
      providesTags: (_r, _e, id) => [{ type: "Project", id }],
    }),

    createProject: build.mutation<Project, Record<string, unknown>>({
      query: (body) => ({ url: "/projects", method: "POST", body }),
      transformResponse: unwrap,
      onQueryStarted: insertOnCreate<Project, Project>("listProjects", (result) => result),
      invalidatesTags: ["ProjectList", "ProjectInvitations"],
    }),

    updateProject: build.mutation<Project, { id: string; patch: Record<string, unknown> }>({
      query: ({ id, patch }) => ({ url: `/projects/${id}`, method: "PATCH", body: patch }),
      transformResponse: unwrap,
      invalidatesTags: (_r, _e, { id }) => [{ type: "Project", id }, "ProjectList"],
    }),

    deleteProject: build.mutation<void, string>({
      query: (id) => ({ url: `/projects/${id}`, method: "DELETE" }),
      invalidatesTags: ["ProjectList", "TaskList"],
    }),

    inviteProjectManagers: build.mutation<unknown, { id: string; userIds: string[] }>({
      query: ({ id, userIds }) => ({ url: `/projects/${id}/managers`, method: "POST", body: { userIds } }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Project", id },
        "ProjectList",
        "ProjectInvitations",
      ],
    }),

    inviteProjectMembers: build.mutation<unknown, { id: string; userIds: string[] }>({
      query: ({ id, userIds }) => ({ url: `/projects/${id}/members`, method: "POST", body: { userIds } }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Project", id },
        "ProjectList",
        "ProjectInvitations",
      ],
    }),

    respondToProject: build.mutation<unknown, { id: string; response: "accept" | "decline" }>({
      query: ({ id, response }) => ({ url: `/projects/${id}/membership`, method: "POST", body: { response } }),
      // Accepting changes what this person can SEE, so the whole world moves.
      invalidatesTags: ["ProjectList", "ProjectInvitations", "TaskList", "Session"],
    }),

    removeProjectMember: build.mutation<void, { id: string; userId: string }>({
      query: ({ id, userId }) => ({ url: `/projects/${id}/members/${userId}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Project", id }, "ProjectList", "TaskList"],
    }),

    projectInvitations: build.query<ProjectInvitation[], void>({
      query: () => "/projects/invitations",
      transformResponse: unwrap,
      providesTags: ["ProjectInvitations"],
    }),

    setProjectPlan: build.mutation<unknown, { id: string; plan: Record<string, unknown>[] }>({
      query: ({ id, plan }) => ({ url: `/projects/${id}/plan`, method: "PUT", body: { plan } }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Project", id }, "ProjectList"],
    }),

    getProjectSecrets: build.query<SecretEntry[], string>({
      query: (id) => `/projects/${id}/secrets`,
      transformResponse: unwrap,
      providesTags: (_r, _e, id) => [{ type: "Secrets", id }],
    }),

    setProjectSecrets: build.mutation<SecretEntry[], { id: string; secrets: Record<string, unknown>[] }>({
      query: ({ id, secrets }) => ({ url: `/projects/${id}/secrets`, method: "PUT", body: { secrets } }),
      transformResponse: unwrap,
      invalidatesTags: (_r, _e, { id }) => [{ type: "Secrets", id }, { type: "Project", id }],
    }),

    /* -------------------------------------------------------- tasks -- */

    listTasks: build.query<Task[], void>({
      query: () => ({ url: "/tasks", params: { perPage: 200 } }),
      transformResponse: unwrap,
      providesTags: (result) => [
        "TaskList",
        ...(result ?? []).map((t) => ({ type: "Task" as const, id: t.id })),
      ],
    }),

    getTask: build.query<Task, string>({
      query: (id) => `/tasks/${id}`,
      transformResponse: unwrap,
      providesTags: (_r, _e, id) => [{ type: "Task", id }],
    }),

    createTask: build.mutation<Task, Record<string, unknown>>({
      query: (body) => ({ url: "/tasks", method: "POST", body }),
      transformResponse: unwrap,
      onQueryStarted: insertOnCreate<Task, Task>("listTasks", (result) => result),
      // A new task changes project progress and the assignees' open-work count.
      invalidatesTags: ["TaskList", "ProjectList", "EmployeeList", "Notification"],
    }),

    updateTask: build.mutation<Task, { id: string; patch: Record<string, unknown> }>({
      query: ({ id, patch }) => ({ url: `/tasks/${id}`, method: "PATCH", body: patch }),
      transformResponse: unwrap,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Task", id },
        "TaskList",
        "ProjectList",
        "EmployeeList",
      ],
    }),

    deleteTask: build.mutation<void, string>({
      query: (id) => ({ url: `/tasks/${id}`, method: "DELETE" }),
      invalidatesTags: ["TaskList", "ProjectList", "EmployeeList"],
    }),

    /**
     * Scoring a checklist line. Optimistic, because this is the interaction the
     * whole Tasks module is built around — a round-trip per tick would make the
     * checklist feel broken.
     */
    scoreChecklistItem: build.mutation<Task, { id: string; itemId: string; score: number }>({
      query: ({ id, itemId, score }) => ({
        url: `/tasks/${id}/checklist/${itemId}`,
        method: "PATCH",
        body: { score },
      }),
      transformResponse: unwrap,
      async onQueryStarted({ id, itemId, score }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          api.util.updateQueryData("listTasks", undefined, (draft) => {
            const task = draft.find((t) => t.id === id);
            const line = task?.checklist.find((c) => c.id === itemId);
            if (!task || !line) return;
            line.score = score;
            line.done = score >= 1;
            const sum = task.checklist.reduce((n, c) => n + Math.min(Math.max(c.score, 0), 1), 0);
            task.score = Math.round((sum / task.checklist.length) * 100);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (_r, _e, { id }) => [{ type: "Task", id }, "ProjectList"],
    }),

    /**
     * The QC verdict. Not optimistic on purpose: an Error verdict moves several
     * people's KRA, and guessing those numbers wrong on screen would be worse
     * than waiting for the real ones.
     */
    submitQcReview: build.mutation<
      Task,
      { id: string; verdict: string; failedItemIds: string[]; note?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/tasks/${id}/qc-review`, method: "POST", body }),
      transformResponse: unwrap,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Task", id },
        "TaskList",
        "EmployeeList",
        "ProjectList",
        "Notification",
      ],
    }),

    /* ----------------------------------------------------- settings -- */

    getProfile: build.query<Profile, void>({
      query: () => "/settings/profile",
      transformResponse: unwrap,
      providesTags: ["Profile"],
    }),

    updateProfile: build.mutation<Profile, Record<string, unknown>>({
      query: (body) => ({ url: "/settings/profile", method: "PATCH", body }),
      transformResponse: unwrap,
      invalidatesTags: ["Profile", "EmployeeList", "Session"],
    }),

    changePassword: build.mutation<
      { message: string },
      { currentPassword: string; newPassword: string; confirmPassword: string }
    >({
      query: (body) => ({ url: "/settings/password", method: "POST", body }),
      transformResponse: unwrap,
    }),

    moduleAccessMatrix: build.query<ModuleAccessMatrix, void>({
      query: () => "/settings/module-access",
      transformResponse: unwrap,
      providesTags: ["ModuleAccess"],
    }),

    setModuleAccess: build.mutation<unknown, { userId: string; modules: string[] }>({
      query: ({ userId, modules }) => ({
        url: `/settings/module-access/${userId}`,
        method: "PUT",
        body: { modules },
      }),
      /*
       * Not "Session": the endpoint refuses to touch a super admin's own row,
       * so the person saving can never be changing their own access, and
       * refetching /auth/me was a round trip that could not alter anything.
       * The roster does carry moduleAccess, so that list is genuinely stale.
       */
      invalidatesTags: ["ModuleAccess", "EmployeeList"],
    }),

    getWorkspace: build.query<Workspace, void>({
      query: () => "/settings/workspace",
      transformResponse: unwrap,
      providesTags: ["Workspace"],
    }),

    updateWorkspace: build.mutation<Workspace, Record<string, unknown>>({
      query: (body) => ({ url: "/settings/workspace", method: "PATCH", body }),
      transformResponse: unwrap,
      // This can carry a defaultBranch change, which re-scopes every module —
      // so the lists it narrows are stale the moment it returns.
      invalidatesTags: ["Workspace", "Branch", "EmployeeList", "ProjectList", "TaskList"],
    }),

    /* ------------------------------------------------ notifications -- */

    listNotifications: build.query<Notification[], void>({
      query: () => ({ url: "/notifications", params: { limit: 100 } }),
      transformResponse: unwrap,
      providesTags: ["Notification"],
    }),

    markNotificationRead: build.mutation<void, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: "PATCH" }),
      invalidatesTags: ["Notification"],
    }),

    markAllNotificationsRead: build.mutation<unknown, void>({
      query: () => ({ url: "/notifications/read-all", method: "PATCH" }),
      invalidatesTags: ["Notification"],
    }),

    clearNotifications: build.mutation<unknown, void>({
      query: () => ({ url: "/notifications", method: "DELETE" }),
      invalidatesTags: ["Notification"],
    }),
  }),
});

export const {
  useLoginMutation,
  useMasterLoginMutation,
  useMeQuery,
  useLogoutMutation,
  useValidateInviteQuery,
  useAcceptInviteMutation,
  useListCompaniesQuery,
  useGetCompanyQuery,
  useCreateCompanyMutation,
  useUpdateCompanyMutation,
  useDeleteCompanyMutation,
  useResendCompanyInviteMutation,
  useMasterDashboardQuery,
  useListCountriesQuery,
  useListBranchesQuery,
  useCreateBranchMutation,
  useUpdateBranchMutation,
  useDeleteBranchMutation,
  useSetDefaultBranchMutation,
  useListClientsQuery,
  useCreateClientMutation,
  useUpdateClientMutation,
  useDeleteClientMutation,
  useListEmployeesQuery,
  useGetEmployeeQuery,
  useCreateEmployeeMutation,
  useUpdateEmployeeMutation,
  useDeleteEmployeeMutation,
  useResendEmployeeInviteMutation,
  useSetMyStatusMutation,
  useListProjectsQuery,
  useGetProjectQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  useInviteProjectManagersMutation,
  useInviteProjectMembersMutation,
  useRespondToProjectMutation,
  useRemoveProjectMemberMutation,
  useProjectInvitationsQuery,
  useSetProjectPlanMutation,
  useGetProjectSecretsQuery,
  useSetProjectSecretsMutation,
  useListTasksQuery,
  useGetTaskQuery,
  useCreateTaskMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useScoreChecklistItemMutation,
  useSubmitQcReviewMutation,
  useGetProfileQuery,
  useUpdateProfileMutation,
  useChangePasswordMutation,
  useModuleAccessMatrixQuery,
  useSetModuleAccessMutation,
  useGetWorkspaceQuery,
  useUpdateWorkspaceMutation,
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useClearNotificationsMutation,
} = api;
