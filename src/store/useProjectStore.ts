import { create } from 'zustand';
import { Repository, NodeData, ConnectionData, Flow, BatchLog, Workspace, WorkspaceMember, ActiveView } from '../types';
import { getAvailableProjects, getBuiltInDemoProject, DEFAULT_PROJECT_ID } from '../utils/projectHelpers';
import {
    clearProjectHistoryFromDB,
    getWorkspaceMemberHandleMap,
    upsertWorkspaceMemberHandle,
    removeWorkspaceMemberHandle,
    removeWorkspaceMemberHandlesByWorkspace
} from '../db';
import { parseMarkdownToProject } from '../utils/parser';

const ARC_BENCH_HOME_WORKSPACE_ID = 'workspace_arcbench_home';
const ARC_BENCH_HOME_WORKSPACE_NAME = 'ArcBench Home';
const ARCHBENCH_SCHEMA_VERSION_KEY = 'archbench_schema_version';
const ARCHBENCH_SCHEMA_VERSION = '2';
const ARCHBENCH_BACKUP_PREFIX = 'archbench_migration_backup_v2_';

type MemberActionCode =
    | 'ok'
    | 'permission_denied'
    | 'missing_arcbench'
    | 'missing_handle'
    | 'duplicate'
    | 'missing_architecture'
    | 'picker_unsupported';

type MemberActionResult = {
    ok: boolean;
    code: MemberActionCode;
    message: string;
};

interface SavedWorkspaceMember {
    id: string;
    name: string;
    folderName: string;
    relativeWorkspacePath: string;
    hasArchitecture: boolean;
    specId: string | null;
    createdAt: string;
    lastConnectedAt: string;
    syncState?: 'synced' | 'stale' | 'reconnect_required';
    lastSyncAt?: string | null;
    lastSyncError?: string | null;
}

interface SavedWorkspace {
    id?: string;
    name?: string;
    activeRepositoryId?: string | null;
    activeProjectId?: string | null;
    members?: SavedWorkspaceMember[];
    repositories?: Repository[];
    projects?: Repository[];
}

function hasMigrationBackup(): boolean {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(ARCHBENCH_BACKUP_PREFIX)) {
                return true;
            }
        }
    } catch {
        // Ignore storage access issues.
    }
    return false;
}

function backupLegacyStorageIfNeeded(): void {
    try {
        const existingVersion = localStorage.getItem(ARCHBENCH_SCHEMA_VERSION_KEY);
        if (existingVersion === ARCHBENCH_SCHEMA_VERSION) {
            return;
        }
        if (!hasMigrationBackup()) {
            const backupPayload = {
                createdAt: new Date().toISOString(),
                schemaFrom: existingVersion || 'legacy',
                keys: {
                    archbench_workspaces_list: localStorage.getItem('archbench_workspaces_list'),
                    archbench_workspace_meta: localStorage.getItem('archbench_workspace_meta'),
                    archbench_active_workspace_id: localStorage.getItem('archbench_active_workspace_id'),
                    archbench_projects: localStorage.getItem('archbench_projects'),
                    archbench_active_project_id: localStorage.getItem('archbench_active_project_id')
                }
            };
            localStorage.setItem(`${ARCHBENCH_BACKUP_PREFIX}${Date.now()}`, JSON.stringify(backupPayload));
        }
        localStorage.setItem(ARCHBENCH_SCHEMA_VERSION_KEY, ARCHBENCH_SCHEMA_VERSION);
    } catch (e) {
        console.error('Failed to backup legacy storage before migration', e);
    }
}

function normalizeRepository(rawRepo: any, index: number, workspaceId: string): Repository {
    const fallbackId = `repo_migrated_${workspaceId}_${index}`;
    const id = typeof rawRepo?.id === 'string' && rawRepo.id.trim() ? rawRepo.id.trim() : fallbackId;
    const title = typeof rawRepo?.title === 'string' && rawRepo.title.trim() ? rawRepo.title.trim() : `Repository ${index + 1}`;
    const version = typeof rawRepo?.version === 'string' && rawRepo.version.trim() ? rawRepo.version.trim() : '1.0';

    return {
        ...rawRepo,
        id,
        workspaceId,
        sourceKind: rawRepo?.sourceKind || (id === DEFAULT_PROJECT_ID ? 'builtin' : 'standalone'),
        title,
        version,
        description: typeof rawRepo?.description === 'string' ? rawRepo.description : '',
        nodes: Array.isArray(rawRepo?.nodes) ? rawRepo.nodes : [],
        connections: Array.isArray(rawRepo?.connections) ? rawRepo.connections : [],
        flows: Array.isArray(rawRepo?.flows) ? rawRepo.flows : [],
        layers: Array.isArray(rawRepo?.layers) ? rawRepo.layers : undefined,
        trustBoundary: rawRepo?.trustBoundary || undefined
    };
}

function normalizeWorkspace(rawWorkspace: any, index: number): Workspace {
    const id = typeof rawWorkspace?.id === 'string' && rawWorkspace.id.trim()
        ? rawWorkspace.id.trim()
        : `workspace_migrated_${index}`;
    const name = typeof rawWorkspace?.name === 'string' && rawWorkspace.name.trim()
        ? rawWorkspace.name.trim()
        : `Workspace ${index + 1}`;

    const rawRepos = Array.isArray(rawWorkspace?.repositories)
        ? rawWorkspace.repositories
        : (Array.isArray(rawWorkspace?.projects) ? rawWorkspace.projects : []);

    const repoById = new Map<string, Repository>();
    rawRepos.forEach((r: any, repoIdx: number) => {
        const normalized = normalizeRepository(r, repoIdx, id);
        if (!repoById.has(normalized.id)) {
            repoById.set(normalized.id, normalized);
        }
    });
    const repositories = Array.from(repoById.values());
    const repoIds = new Set(repositories.map(r => r.id));

    const members: WorkspaceMember[] = (Array.isArray(rawWorkspace?.members) ? rawWorkspace.members : []).map((m: any, memberIdx: number) => {
        const memberId = typeof m?.id === 'string' && m.id.trim() ? m.id.trim() : `member_migrated_${id}_${memberIdx}`;
        const folderName = typeof m?.folderName === 'string' && m.folderName.trim()
            ? m.folderName.trim()
            : (typeof m?.name === 'string' && m.name.trim() ? m.name.trim() : `repo-${memberIdx + 1}`);
        const candidateSpecId = typeof m?.specId === 'string' && m.specId.trim() ? m.specId.trim() : null;
        const specId = candidateSpecId && repoIds.has(candidateSpecId) ? candidateSpecId : null;

        return {
            id: memberId,
            name: typeof m?.name === 'string' && m.name.trim() ? m.name.trim() : folderName,
            folderName,
            relativeWorkspacePath: typeof m?.relativeWorkspacePath === 'string' && m.relativeWorkspacePath.trim()
                ? m.relativeWorkspacePath.trim()
                : folderName,
            handle: null,
            status: (m?.status === 'ready' || m?.status === 'needs_init') ? m.status : 'disconnected',
            hasArchitecture: Boolean(m?.hasArchitecture),
            specId,
            createdAt: typeof m?.createdAt === 'string' ? m.createdAt : new Date().toISOString(),
            lastConnectedAt: typeof m?.lastConnectedAt === 'string' ? m.lastConnectedAt : new Date().toISOString(),
            syncState: m?.syncState === 'synced' || m?.syncState === 'stale' || m?.syncState === 'reconnect_required'
                ? m.syncState
                : ((m?.status === 'disconnected') ? 'reconnect_required' : ((m?.status === 'ready') ? 'synced' : 'stale')),
            lastSyncAt: typeof m?.lastSyncAt === 'string' ? m.lastSyncAt : null,
            lastSyncError: typeof m?.lastSyncError === 'string' ? m.lastSyncError : null
        };
    });

    const memberBoundRepoIds = new Set(
        members.map(m => m.specId).filter((id): id is string => Boolean(id))
    );

    const repositoriesWithSourceKind: Repository[] = repositories
        .filter(repo => {
            // Built-in demo belongs only to ArcBench Home.
            if (repo.id === DEFAULT_PROJECT_ID) {
                return id === ARC_BENCH_HOME_WORKSPACE_ID;
            }

            // Strict workspace model: non-home workspaces only keep repositories linked by members.
            if (id !== ARC_BENCH_HOME_WORKSPACE_ID) {
                return memberBoundRepoIds.has(repo.id);
            }

            // In home workspace, keep member-linked repositories if present.
            return memberBoundRepoIds.has(repo.id);
        })
        .map(repo => ({
            ...repo,
            sourceKind: (repo.id === DEFAULT_PROJECT_ID
                ? 'builtin'
                : 'member-bound') as Repository['sourceKind'],
            workspaceId: id
        }));

    const repoIdsAfterCleanup = new Set(repositoriesWithSourceKind.map(r => r.id));

    const rawActiveId = rawWorkspace?.activeRepositoryId || rawWorkspace?.activeProjectId || null;
    const activeRepositoryId = rawActiveId && repoIdsAfterCleanup.has(rawActiveId)
        ? rawActiveId
        : (repositoriesWithSourceKind.length > 0 ? repositoriesWithSourceKind[0].id : null);

    return {
        id,
        name,
        repositories: repositoriesWithSourceKind,
        projects: repositoriesWithSourceKind, // Legacy fallback while migration is active
        activeRepositoryId,
        activeProjectId: activeRepositoryId, // Legacy fallback
        members
    };
}

function normalizeWorkspaces(rawList: any[]): Workspace[] {
    const workspaces = rawList.map((w, idx) => normalizeWorkspace(w, idx));

    const seenIds = new Set<string>();
    return workspaces.map((w, idx) => {
        if (!seenIds.has(w.id)) {
            seenIds.add(w.id);
            return w;
        }
        const dedupedId = `${w.id}_${idx + 1}`;
        seenIds.add(dedupedId);
        return { ...w, id: dedupedId };
    });
}

function ensureArcBenchHomeWorkspace(workspaces: Workspace[]): Workspace[] {
    const builtIn = getBuiltInDemoProject();
    if (!builtIn) return workspaces;

    // Enforce a single system home workspace that owns the built-in demo repository.
    let normalized = workspaces.map(w => {
        if (w.id === ARC_BENCH_HOME_WORKSPACE_ID) return w;
        const repos = (w.repositories || []).filter(r => r.id !== DEFAULT_PROJECT_ID);
        return {
            ...w,
            repositories: repos,
            projects: repos,
            activeRepositoryId: w.activeRepositoryId === DEFAULT_PROJECT_ID ? (repos[0]?.id || null) : w.activeRepositoryId,
            activeProjectId: w.activeRepositoryId === DEFAULT_PROJECT_ID ? (repos[0]?.id || null) : w.activeProjectId
        };
    });

    const homeIdx = normalized.findIndex(w => w.id === ARC_BENCH_HOME_WORKSPACE_ID);
    if (homeIdx !== -1) {
        const home = normalized[homeIdx];
        const homeReposWithoutBuiltIn = (home.repositories || []).filter(r => r.id !== DEFAULT_PROJECT_ID);
        const homeRepos = [
            {
                ...builtIn,
                title: 'ArcBench Home Demo',
                workspaceId: ARC_BENCH_HOME_WORKSPACE_ID,
                sourceKind: 'builtin' as const
            },
            ...homeReposWithoutBuiltIn
        ];

        normalized[homeIdx] = {
            ...home,
            name: ARC_BENCH_HOME_WORKSPACE_NAME,
            repositories: homeRepos,
            projects: homeRepos,
            activeRepositoryId: DEFAULT_PROJECT_ID,
            activeProjectId: DEFAULT_PROJECT_ID
        };

        return normalized;
    }

    const homeWorkspace: Workspace = {
        id: ARC_BENCH_HOME_WORKSPACE_ID,
        name: ARC_BENCH_HOME_WORKSPACE_NAME,
        repositories: [{ ...builtIn, title: 'ArcBench Home Demo', workspaceId: ARC_BENCH_HOME_WORKSPACE_ID, sourceKind: 'builtin' }],
        projects: [{ ...builtIn, title: 'ArcBench Home Demo', workspaceId: ARC_BENCH_HOME_WORKSPACE_ID, sourceKind: 'builtin' }], // Legacy fallback
        activeRepositoryId: builtIn.id,
        activeProjectId: builtIn.id, // Legacy fallback
        members: []
    };

    normalized = [homeWorkspace, ...normalized];
    return normalized;
}

function resolvePreferredWorkspaceRepo(workspace: Workspace): Repository | null {
    const repos = workspace.repositories || [];
    if (repos.length === 0) return null;

    // ArcBench Home should always prioritize the built-in demo spec.
    if (workspace.id === ARC_BENCH_HOME_WORKSPACE_ID) {
        const builtIn = repos.find(r => r.id === DEFAULT_PROJECT_ID);
        if (builtIn) return builtIn;
    }

    if (workspace.activeRepositoryId) {
        const active = repos.find(r => r.id === workspace.activeRepositoryId);
        if (active) return active;
    }

    return repos[0] || null;
}

// ─── HELPERS FOR WORKSPACE METADATA & FS SCANNING ───────────────────────────

const saveWorkspaceMeta = (workspace: Workspace) => {
    try {
        backupLegacyStorageIfNeeded();
        localStorage.setItem("archbench_active_workspace_id", workspace.id);
        
        const state = useProjectStore.getState();
        const workspaces = state?.workspaces || [workspace];
        const updatedWorkspaces = workspaces.map(w => w.id === workspace.id ? workspace : w);
        if (!updatedWorkspaces.some(w => w.id === workspace.id)) {
            updatedWorkspaces.push(workspace);
        }

        const normalizedWorkspaces = normalizeWorkspaces(updatedWorkspaces as any[]);

        // Keep in-memory workspace list aligned with persisted metadata
        // so the workspace switcher does not show stale repository counts/names.
        useProjectStore.setState({ workspaces: normalizedWorkspaces });
        
        const serializedWorkspaces = normalizedWorkspaces.map(w => ({
            id: w.id,
            name: w.name,
            activeRepositoryId: w.activeRepositoryId,
            activeProjectId: w.activeRepositoryId, // Legacy fallback
            repositories: w.repositories || [],
            projects: w.repositories || [], // Legacy fallback
            members: (w.members || []).map(m => ({
                id: m.id,
                name: m.name,
                folderName: m.folderName,
                relativeWorkspacePath: m.relativeWorkspacePath || m.folderName,
                hasArchitecture: m.hasArchitecture,
                specId: m.specId,
                createdAt: m.createdAt,
                lastConnectedAt: m.lastConnectedAt,
                syncState: m.syncState || (m.status === 'ready' ? 'synced' : (m.status === 'disconnected' ? 'reconnect_required' : 'stale')),
                lastSyncAt: m.lastSyncAt || null,
                lastSyncError: m.lastSyncError || null
            }))
        }));
        
        localStorage.setItem("archbench_workspaces_list", JSON.stringify(serializedWorkspaces));
                localStorage.setItem(ARCHBENCH_SCHEMA_VERSION_KEY, ARCHBENCH_SCHEMA_VERSION);
        
        const activeMeta = serializedWorkspaces.find(w => w.id === workspace.id);
        if (activeMeta) {
            localStorage.setItem("archbench_workspace_meta", JSON.stringify(activeMeta));
        }
    } catch (e) {
        console.error("Failed to save workspace metadata", e);
    }
};

async function checkFolderArchitecture(handle: FileSystemDirectoryHandle) {
    let hasArch = false;
    let parsedSpec: Repository | null = null;
    try {
        let fileHandle = null;
        try {
            const arcbenchDir = await handle.getDirectoryHandle(".arcbench");
            fileHandle = await arcbenchDir.getFileHandle("architecture.md");
        } catch {
            // Not found in .arcbench
        }
        if (fileHandle) {
            hasArch = true;
            const file = await fileHandle.getFile();
            const text = await file.text();
            try {
                parsedSpec = parseMarkdownToProject(text);
            } catch {
                // Failed to parse spec markdown
            }
        }
    } catch (e) {
        console.warn(`Error scanning directory architecture for ${handle.name}`, e);
    }
    return { hasArch, parsedSpec };
}

async function syncMemberArchitecture(memberId: string, handle: FileSystemDirectoryHandle, activeRepositoryId: string | null) {
    const { hasArch, parsedSpec } = await checkFolderArchitecture(handle);
    const store = useProjectStore.getState();
    const currentRepos = store.workspace.repositories || [];
    const member = store.workspace.members.find(m => m.id === memberId);
    if (!member) return;

    let boundSpecId = member.specId;

    if (hasArch && parsedSpec) {
        // 1. Try matching by existing bound specId
        let matchedRepo = currentRepos.find(p => p.id === member.specId);

        if (matchedRepo) {
            // Keep repository provenance aligned when a member binds to an existing spec.
            const updatedRepos = currentRepos.map(repo =>
                repo.id === matchedRepo!.id
                    ? { ...repo, sourceKind: 'member-bound' as const, workspaceId: store.workspace.id }
                    : repo
            );
            const updatedWorkspace = {
                ...store.workspace,
                repositories: updatedRepos,
                projects: updatedRepos
            };
            store.reloadRepositoriesList(updatedWorkspace);
            boundSpecId = matchedRepo.id;
        } else {
            // Create a dedicated repository spec for this member.
            // Do not auto-bind by title: duplicate titles across repos are valid.
            const newRepoId = "repo_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
            const newRepo: Repository = {
                ...parsedSpec,
                id: newRepoId,
                workspaceId: store.workspace.id,
                sourceKind: 'member-bound'
            };
            boundSpecId = newRepoId;

            const updatedWorkspace = {
                ...store.workspace,
                repositories: [...currentRepos, newRepo],
                projects: [...currentRepos, newRepo]
            };
            store.reloadRepositoriesList(updatedWorkspace);
        }
    } else if (!hasArch) {
        if (!boundSpecId && store.workspace.members.length === 1) {
            boundSpecId = activeRepositoryId;
        }
    }

    const updatedMembers = useProjectStore.getState().workspace.members.map(m => {
        if (m.id === memberId) {
            return {
                ...m,
                hasArchitecture: hasArch,
                status: hasArch ? 'ready' as const : 'needs_init' as const,
                specId: boundSpecId,
                syncState: hasArch ? 'synced' as const : 'stale' as const,
                lastSyncAt: new Date().toISOString(),
                lastSyncError: hasArch ? null : 'Missing .arcbench/architecture.md'
            };
        }
        return m;
    });

    const updatedWorkspace = {
        ...useProjectStore.getState().workspace,
        members: updatedMembers
    };
    
    // Also sync watchDirectoryHandle if this is the active repository
    let watchDirectoryHandle = useProjectStore.getState().watchDirectoryHandle;
    if (boundSpecId === updatedWorkspace.activeRepositoryId) {
        watchDirectoryHandle = handle;
    }

    useProjectStore.setState({
        workspace: updatedWorkspace,
        watchDirectoryHandle
    });
    saveWorkspaceMeta(updatedWorkspace);
}

// ─── IMPORTANT: WORKSPACE IS THE SOURCE OF TRUTH ────────────────────────────
//
// `workspace` is the authoritative state for all repository data.
//
// ⚠️  NO NEW FEATURE MAY READ currentProject OR availableProjects AS
//     AUTHORITATIVE STATE. All new code must read from workspace.
// ─────────────────────────────────────────────────────────────────────────────

// ─── SELECTORS ───────────────────────────────────────────────────────────────
// Use these in new code instead of reading legacy mirror fields.

export const selectCurrentRepository = (s: ProjectState): Repository | null =>
    s.workspace.repositories.find(p => p.id === s.workspace.activeRepositoryId) ?? null;

export const selectAvailableRepositories = (s: ProjectState): Repository[] =>
    s.workspace.repositories;

// Legacy selectors aliased to Repository equivalents
export const selectCurrentProject = selectCurrentRepository;
export const selectAvailableProjects = selectAvailableRepositories;

// ─────────────────────────────────────────────────────────────────────────────

interface ProjectState {
    // ── SOURCE OF TRUTH ──
    workspace: Workspace;
    workspaces: Workspace[];

    // ── LEGACY COMPATIBILITY MIRRORS (do not read in new code) ──
    availableProjects: Repository[];
    currentProject: Repository | null;
    availableRepositories: Repository[];
    currentRepository: Repository | null;

    // ── RENDERING PROJECTIONS (derived from active project) ──
    nodes: NodeData[];
    connections: ConnectionData[];
    flows: Flow[];

    // ── UI / SESSION STATE ──
    activeFlow: Flow | null;
    activeStepIndex: number;
    sidebarTab: string;
    liveWatchEnabled: boolean;
    unifiedBatchLog: BatchLog | null;
    projectHandles: FileSystemDirectoryHandle[];
    watchDirectoryHandle: FileSystemDirectoryHandle | null;
    hoveredNodeId: string | null;
    isTerminalVisible: boolean;
    terminalActiveTab: 'trace' | 'shell';
    isSidebarCollapsed: boolean;
    isSidebarDockedRight: boolean;
    activeView: ActiveView;
    isInitialized: boolean;

    // ── ACTIONS ──
    initializeStore: () => void;
    loadRepository: (repo: Repository) => void;
    loadProject: (project: Repository) => void; // Legacy
    reloadRepositoriesList: (updatedWorkspace?: Workspace) => void;
    reloadProjectsList: () => void; // Legacy
    setActiveView: (view: ActiveView) => void;
    setSidebarTab: (tabId: string) => void;
    startFlow: (flowId: string) => void;
    exitFlow: () => void;
    stepFlow: (direction: 'next' | 'prev') => void;
    setUnifiedBatchLog: (log: BatchLog | null) => void;
    setLiveWatchEnabled: (enabled: boolean) => void;
    setProjectHandles: (handles: FileSystemDirectoryHandle[], wsName?: string) => void;
    setWatchDirectoryHandle: (handle: FileSystemDirectoryHandle | null) => void;
    updateNodePosition: (nodeId: string, x: number, y: number) => void;
    createRepository: (repo: Repository) => void;
    createProject: (project: Repository) => void; // Legacy
    deleteRepository: (repoId: string) => Promise<void>;
    deleteProject: (projectId: string) => Promise<void>; // Legacy
    updateRepository: (repoId: string, title: string, version: string, spec: Repository) => void;
    updateProject: (projectId: string, title: string, version: string, spec: Repository) => void; // Legacy
    setHoveredNodeId: (id: string | null) => void;
    setTerminalVisible: (visible: boolean) => void;
    setTerminalActiveTab: (tab: 'trace' | 'shell') => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    setSidebarDockedRight: (dockRight: boolean) => void;
    addWorkspaceMember: (handle: FileSystemDirectoryHandle) => Promise<MemberActionResult>;
    removeWorkspaceMember: (memberId: string) => Promise<void>;
    reconnectWorkspaceMember: (memberId: string, handle: FileSystemDirectoryHandle) => Promise<MemberActionResult>;
    syncWorkspaceMember: (memberId: string) => Promise<MemberActionResult>;
    createWorkspace: (name: string) => void;
    deleteWorkspace: (workspaceId: string) => Promise<void>;
    switchWorkspace: (workspaceId: string) => void;
    updateWorkspaceName: (workspaceId: string, name: string) => void;
}

const DEFAULT_WORKSPACE: Workspace = {
    id: 'workspace_default',
    name: 'Default Workspace',
    repositories: [],
    projects: [], // Legacy fallback
    activeRepositoryId: null,
    activeProjectId: null, // Legacy fallback
    members: []
};

export const useProjectStore = create<ProjectState>((set, get) => ({
    // ── SOURCE OF TRUTH ──
    workspace: { ...DEFAULT_WORKSPACE },
    workspaces: [],

    // ── LEGACY MIRRORS ──
    availableProjects: [],
    currentProject: null,
    availableRepositories: [],
    currentRepository: null,

    // ── RENDERING PROJECTIONS ──
    nodes: [],
    connections: [],
    flows: [],

    // ── UI / SESSION STATE ──
    activeFlow: null,
    activeStepIndex: -1,
    sidebarTab: 'simulator',
    liveWatchEnabled: false,
    unifiedBatchLog: null,
    projectHandles: [],
    watchDirectoryHandle: null,
    hoveredNodeId: null,
    isTerminalVisible: true,
    terminalActiveTab: 'trace',
    isSidebarCollapsed: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isSidebarDockedRight: true,
    activeView: { type: 'workspace_overview', targetId: null },
    isInitialized: false,

    initializeStore: () => {
        backupLegacyStorageIfNeeded();

        // Load workspaces list from localStorage
        const workspacesStr = localStorage.getItem("archbench_workspaces_list");
        let workspacesList: Workspace[] = [];
        if (workspacesStr) {
            try {
                const parsed = JSON.parse(workspacesStr) as any[];
                workspacesList = Array.isArray(parsed) ? normalizeWorkspaces(parsed) : [];
            } catch (e) {
                console.error("Failed to parse workspaces list", e);
            }
        }

        if (workspacesList.length === 0) {
            // Fallback checking legacy meta
            const legacyMetaStr = localStorage.getItem("archbench_workspace_meta");
            let legacyWorkspace: SavedWorkspace | null = null;
            if (legacyMetaStr) {
                try {
                    legacyWorkspace = JSON.parse(legacyMetaStr) as SavedWorkspace;
                } catch {}
            }
            const defaultRepos = getAvailableProjects(); // Default fallback repo spec list
            workspacesList = normalizeWorkspaces([{
                id: legacyWorkspace?.id || 'workspace_default',
                name: legacyWorkspace?.name || 'Default Workspace',
                repositories: defaultRepos,
                projects: defaultRepos,
                activeRepositoryId: legacyWorkspace?.activeRepositoryId || legacyWorkspace?.activeProjectId || null,
                activeProjectId: legacyWorkspace?.activeRepositoryId || legacyWorkspace?.activeProjectId || null,
                members: (legacyWorkspace?.members || []).map((m: any) => ({
                    ...m,
                    handle: null,
                    status: 'disconnected' as const,
                    relativeWorkspacePath: m.relativeWorkspacePath || m.folderName
                }))
            }]);
        }

        // Migration/repair guard: ensure the built-in ArcBench home workspace exists.
        workspacesList = ensureArcBenchHomeWorkspace(workspacesList);
        workspacesList = normalizeWorkspaces(workspacesList as any[]);

        const activeWorkspaceId = localStorage.getItem("archbench_active_workspace_id") || workspacesList[0].id;
        let activeWorkspace = workspacesList.find(w => w.id === activeWorkspaceId) || workspacesList[0];

        const list = activeWorkspace.repositories || [];
        const activeRepo = resolvePreferredWorkspaceRepo(activeWorkspace);

        if (activeRepo && activeWorkspace.activeRepositoryId !== activeRepo.id) {
            activeWorkspace = {
                ...activeWorkspace,
                activeRepositoryId: activeRepo.id,
                activeProjectId: activeRepo.id,
                projects: activeWorkspace.repositories
            };
        }

        const liveWatchStr = localStorage.getItem("archbench_live_watch");
        const liveWatchEnabled = liveWatchStr ? (liveWatchStr === "true") : false;

        // Resolve initial view
        let activeView: ActiveView = { type: 'workspace_overview', targetId: null };
        if (activeRepo) {
            const matchedMember = activeWorkspace.members.find(m => m.specId === activeRepo.id);
            if (matchedMember) {
                activeView = { type: 'member', targetId: matchedMember.id };
            } else {
                activeView = { type: 'standalone', targetId: activeRepo.id };
            }
        }

        set({
            workspaces: workspacesList,
            workspace: activeWorkspace,
            liveWatchEnabled,
            activeView,
            isInitialized: true,
            // Legacy mirrors
            availableProjects: list,
            currentProject: activeRepo,
            availableRepositories: list,
            currentRepository: activeRepo,
            // Rendering projections
            nodes: activeRepo ? (activeRepo.nodes || []) : [],
            connections: activeRepo ? (activeRepo.connections || []) : [],
            flows: activeRepo ? (activeRepo.flows || []) : [],
            activeFlow: null,
            activeStepIndex: -1,
            hoveredNodeId: null
        });

        // Ensure synced back to storage
        saveWorkspaceMeta(activeWorkspace);

        // Hydrate persisted folder handles from IndexedDB so rows don't reset to Connect after reload.
        (async () => {
            try {
                const current = useProjectStore.getState();
                const handleMap = await getWorkspaceMemberHandleMap(current.workspaces.map(w => w.id));
                if (handleMap.size === 0) return;

                const hydratedWorkspaces = current.workspaces.map(w => {
                    const members = w.members.map(m => {
                        const handle = handleMap.get(`${w.id}:${m.id}`) || null;
                        if (!handle) {
                            return {
                                ...m,
                                handle: null,
                                status: 'disconnected' as const,
                                syncState: 'reconnect_required' as const
                            };
                        }

                        return {
                            ...m,
                            handle,
                            status: m.status === 'needs_init' ? 'needs_init' as const : 'ready' as const,
                            syncState: m.syncState || 'stale'
                        };
                    });

                    return { ...w, members };
                });

                const activeId = useProjectStore.getState().workspace.id;
                const hydratedActive = hydratedWorkspaces.find(w => w.id === activeId) || hydratedWorkspaces[0];
                const activeHandles = hydratedActive.members
                    .map(m => m.handle)
                    .filter((h): h is FileSystemDirectoryHandle => h !== null);

                useProjectStore.setState({
                    workspaces: hydratedWorkspaces,
                    workspace: hydratedActive,
                    projectHandles: activeHandles,
                    watchDirectoryHandle: activeHandles[0] || null
                });
            } catch (e) {
                console.error('Failed to hydrate persisted workspace handles', e);
            }
        })();
    },

    loadRepository: (repoToLoad: Repository) => {
        localStorage.setItem("archbench_active_project_id", repoToLoad.id);

        const workspace: Workspace = {
            ...get().workspace,
            activeRepositoryId: repoToLoad.id,
            activeProjectId: repoToLoad.id // Legacy fallback
        };

        // Sync watchDirectoryHandle with the newly loaded project's member directory handle (if connected)
        const correspondingMember = workspace.members.find(m => m.specId === repoToLoad.id && m.status === 'ready');
        const watchDirectoryHandle = correspondingMember ? correspondingMember.handle : get().watchDirectoryHandle;

        set({
            workspace,
            watchDirectoryHandle,
            // Legacy mirrors
            currentProject: repoToLoad,
            availableProjects: workspace.repositories || [],
            currentRepository: repoToLoad,
            availableRepositories: workspace.repositories || [],
            // Rendering projections
            nodes: repoToLoad.nodes || [],
            connections: repoToLoad.connections || [],
            flows: repoToLoad.flows || [],
            activeFlow: null,
            activeStepIndex: -1,
            unifiedBatchLog: null,
            hoveredNodeId: null
        });

        saveWorkspaceMeta(workspace);
    },

    loadProject: (p: Repository) => get().loadRepository(p),

    reloadRepositoriesList: (updatedWorkspace?: Workspace) => {
        const ws = updatedWorkspace || get().workspace;
        const list = ws.repositories || [];
        const currentActiveId = ws.activeRepositoryId;
        const updatedCurrent = currentActiveId
            ? (list.find(p => p.id === currentActiveId) || null)
            : null;

        const finalWorkspace: Workspace = {
            ...ws,
            repositories: list,
            projects: list, // Legacy fallback
            activeRepositoryId: updatedCurrent ? updatedCurrent.id : ws.activeRepositoryId,
            activeProjectId: updatedCurrent ? updatedCurrent.id : ws.activeRepositoryId // Legacy fallback
        };

        set({
            workspace: finalWorkspace,
            // Legacy mirrors
            availableProjects: list,
            currentProject: updatedCurrent,
            availableRepositories: list,
            currentRepository: updatedCurrent,
            // Rendering projections
            nodes: updatedCurrent ? (updatedCurrent.nodes || []) : [],
            connections: updatedCurrent ? (updatedCurrent.connections || []) : [],
            flows: updatedCurrent ? (updatedCurrent.flows || []) : []
        });

        saveWorkspaceMeta(finalWorkspace);
    },

    reloadProjectsList: () => get().reloadRepositoriesList(),

    setSidebarTab: (tabId: string) => {
        set({ sidebarTab: tabId });
    },

    startFlow: (flowId: string) => {
        const flows = get().flows;
        const selected = flows.find(f => f.id === flowId) || null;
        set({
            activeFlow: selected,
            activeStepIndex: selected && selected.steps.length > 0 ? 0 : -1
        });
    },

    exitFlow: () => {
        set({
            activeFlow: null,
            activeStepIndex: -1
        });
    },

    stepFlow: (direction: 'next' | 'prev') => {
        const { activeFlow, activeStepIndex } = get();
        if (!activeFlow) return;

        let newIndex = activeStepIndex;
        if (direction === 'next') {
            if (activeStepIndex < activeFlow.steps.length - 1) {
                newIndex = activeStepIndex + 1;
            }
        } else {
            if (activeStepIndex > 0) {
                newIndex = activeStepIndex - 1;
            }
        }
        set({ activeStepIndex: newIndex });
    },

    setUnifiedBatchLog: (log: BatchLog | null) => {
        set({ unifiedBatchLog: log });
    },

    setLiveWatchEnabled: (enabled: boolean) => {
        localStorage.setItem("archbench_live_watch", String(enabled));
        set({ liveWatchEnabled: enabled });
    },

    setHoveredNodeId: (id: string | null) => {
        set({ hoveredNodeId: id });
    },

    setTerminalVisible: (visible: boolean) => {
        set({ isTerminalVisible: visible });
    },

    setTerminalActiveTab: (tab: 'trace' | 'shell') => {
        set({ terminalActiveTab: tab });
    },

    setSidebarCollapsed: (collapsed: boolean) => {
        set({ isSidebarCollapsed: collapsed });
    },

    setSidebarDockedRight: (dockRight: boolean) => {
        set({ isSidebarDockedRight: dockRight });
    },

    setProjectHandles: (handles: FileSystemDirectoryHandle[], wsName?: string) => {
        const { workspace } = get();
        const currentMembers = [...workspace.members];
        const newMembers: WorkspaceMember[] = [];
        const matchedMemberIds = new Set<string>();

        // Reconcile handles with existing members
        handles.forEach(handle => {
            // Match to a member with same folderName that hasn't been matched yet
            const existingIdx = currentMembers.findIndex(m => m.folderName === handle.name && !matchedMemberIds.has(m.id));
            if (existingIdx !== -1) {
                const existing = currentMembers[existingIdx];
                matchedMemberIds.add(existing.id);
                const updated: WorkspaceMember = {
                    ...existing,
                    handle,
                    status: 'ready',
                    syncState: existing.syncState || 'stale',
                    lastConnectedAt: new Date().toISOString()
                };
                currentMembers[existingIdx] = updated;
                newMembers.push(updated);
            } else {
                // Determine a unique display name to prevent UI collisions
                let uniqueName = handle.name;
                let suffix = 2;
                while (
                    currentMembers.some(m => m.name === uniqueName) ||
                    newMembers.some(m => m.name === uniqueName)
                ) {
                    uniqueName = `${handle.name} (${suffix})`;
                    suffix++;
                }

                const memberId = "member_" + Math.random().toString(36).substring(2, 15);
                const newMember: WorkspaceMember = {
                    id: memberId,
                    name: uniqueName,
                    folderName: handle.name,
                    relativeWorkspacePath: handle.name,
                    handle,
                    status: 'ready',
                    hasArchitecture: false,
                    specId: null,
                    createdAt: new Date().toISOString(),
                    lastConnectedAt: new Date().toISOString(),
                    syncState: 'stale',
                    lastSyncAt: null,
                    lastSyncError: null
                };
                newMembers.push(newMember);
            }
        });

        // Any member in currentMembers that was NOT matched should be marked disconnected
        const allMembers = currentMembers.map(m => {
            if (!matchedMemberIds.has(m.id)) {
                return {
                    ...m,
                    handle: null,
                    status: 'disconnected' as const,
                    syncState: 'reconnect_required' as const,
                    lastSyncError: 'Handle disconnected'
                };
            }
            return m;
        });

        // Add any brand new members
        newMembers.forEach(nm => {
            if (!allMembers.some(m => m.id === nm.id)) {
                allMembers.push(nm);
            }
        });

        const newWorkspace: Workspace = {
            ...workspace,
            id: workspace.id,
            name: wsName || workspace.name,
            members: allMembers
        };

        const updatedHandles = allMembers
            .map(m => m.handle)
            .filter((h): h is FileSystemDirectoryHandle => h !== null);

        set({
            workspace: newWorkspace,
            projectHandles: updatedHandles,
            watchDirectoryHandle: updatedHandles.length > 0 ? updatedHandles[0] : null
        });

        saveWorkspaceMeta(newWorkspace);

        // Perform async check of architecture for each connected member sequentially to prevent race conditions
        (async () => {
            for (const m of allMembers) {
                if (m.handle) {
                    await syncMemberArchitecture(m.id, m.handle, get().workspace.activeRepositoryId);
                }
            }
        })();
    },

    setWatchDirectoryHandle: (handle: FileSystemDirectoryHandle | null) => {
        set({ watchDirectoryHandle: handle });
    },

    updateNodePosition: (nodeId: string, x: number, y: number) => {
        const { workspace, nodes } = get();
        let targetNodeId = nodeId;
        let targetRepoId = workspace.activeRepositoryId;

        const matchingRepo = workspace.repositories.find(r => nodeId.startsWith(`${r.id}_`));
        if (matchingRepo) {
            targetRepoId = matchingRepo.id;
            targetNodeId = nodeId.substring(matchingRepo.id.length + 1);
        }

        if (!targetRepoId) return;

        const activeRepo = workspace.repositories.find(p => p.id === targetRepoId);
        if (!activeRepo) return;

        const updatedNodesInRepo = (activeRepo.nodes || []).map(n => 
            n.id === targetNodeId ? { ...n, x, y } : n
        );

        const updatedRepo = {
            ...activeRepo,
            nodes: updatedNodesInRepo
        };

        const updatedRepos = workspace.repositories.map(p => 
            p.id === targetRepoId ? updatedRepo : p
        );

        const newWorkspace: Workspace = {
            ...workspace,
            repositories: updatedRepos,
            projects: updatedRepos // legacy
        };

        // If dragging in single repo view, also update nodes state projection
        let currentNodesProjection = nodes;
        if (targetRepoId === workspace.activeRepositoryId) {
            currentNodesProjection = nodes.map(n => n.id === targetNodeId ? { ...n, x, y } : n);
        }

        set({
            workspace: newWorkspace,
            nodes: currentNodesProjection,
            // Legacy mirrors
            currentProject: targetRepoId === workspace.activeRepositoryId ? updatedRepo : get().currentProject,
            availableProjects: updatedRepos,
            currentRepository: targetRepoId === workspace.activeRepositoryId ? updatedRepo : get().currentRepository,
            availableRepositories: updatedRepos,
        });

        saveWorkspaceMeta(newWorkspace);
    },

    createRepository: (newRepo: Repository) => {
        const workspace = get().workspace;
        const repoToCreate: Repository = {
            ...newRepo,
            workspaceId: workspace.id,
            sourceKind: newRepo.sourceKind || (newRepo.id === DEFAULT_PROJECT_ID ? 'builtin' : 'standalone')
        };
        const updatedRepos = [...(workspace.repositories || []), repoToCreate];
        const updatedWorkspace: Workspace = {
            ...workspace,
            repositories: updatedRepos,
            projects: updatedRepos // Legacy fallback
        };
        set({ workspace: updatedWorkspace });
        get().reloadRepositoriesList(updatedWorkspace);
        get().loadRepository(repoToCreate);
    },

    createProject: (proj: Repository) => get().createRepository(proj),

    deleteRepository: async (repoId: string) => {
        const workspace = get().workspace;

        // System guard: never allow deletion of ArcBench Home built-in repository.
        if (workspace.id === ARC_BENCH_HOME_WORKSPACE_ID && repoId === DEFAULT_PROJECT_ID) {
            alert("ArcBench Home repository is protected and cannot be removed.");
            return;
        }

        const updatedRepos = (workspace.repositories || []).filter(p => p.id !== repoId);
        const updatedMembers = workspace.members.map(member =>
            member.specId === repoId
                ? { ...member, specId: null, hasArchitecture: false, status: 'needs_init' as const }
                : member
        );
        
        try {
            await clearProjectHistoryFromDB(repoId);
        } catch (e) {
            console.error("Failed to clear repository history from DB", e);
        }

        const currentActiveId = workspace.activeRepositoryId;
        const updatedWorkspace: Workspace = {
            ...workspace,
            members: updatedMembers,
            repositories: updatedRepos,
            projects: updatedRepos // Legacy fallback
        };

        // If deleting active repository, select next one
        if (currentActiveId === repoId) {
            const nextRepo = updatedRepos.length > 0 ? updatedRepos[0] : null;
            if (nextRepo) {
                const finalWS = {
                    ...updatedWorkspace,
                    activeRepositoryId: nextRepo.id,
                    activeProjectId: nextRepo.id
                };
                set({ workspace: finalWS });
                get().reloadRepositoriesList(finalWS);
                get().loadRepository(nextRepo);
            } else {
                const emptyWorkspace: Workspace = {
                    ...updatedWorkspace,
                    activeRepositoryId: null,
                    activeProjectId: null
                };
                set({
                    workspace: emptyWorkspace,
                    currentProject: null,
                    currentRepository: null,
                    nodes: [],
                    connections: [],
                    flows: [],
                    activeFlow: null,
                    activeStepIndex: -1,
                    unifiedBatchLog: null,
                    hoveredNodeId: null
                });
                saveWorkspaceMeta(emptyWorkspace);
            }
        } else {
            set({ workspace: updatedWorkspace });
            get().reloadRepositoriesList(updatedWorkspace);
        }
    },

    deleteProject: (projectId: string) => get().deleteRepository(projectId),

    updateRepository: (repoId: string, title: string, version: string, spec: Repository) => {
        const workspace = get().workspace;
        const repos = [...(workspace.repositories || [])];
        const idx = repos.findIndex(p => p.id === repoId);
        const existing = idx !== -1 ? repos[idx] : null;
        
        let savedRepo: Repository;
        if (idx === -1) {
            savedRepo = {
                ...spec,
                id: "repo_" + Date.now(),
                workspaceId: workspace.id,
                sourceKind: spec.sourceKind || 'standalone',
                title,
                version
            };
            repos.push(savedRepo);
        } else {
            savedRepo = {
                ...spec,
                id: repoId,
                workspaceId: workspace.id,
                sourceKind: spec.sourceKind || existing?.sourceKind || 'standalone',
                title,
                version
            };
            repos[idx] = savedRepo;
        }

        const updatedWorkspace: Workspace = {
            ...workspace,
            repositories: repos,
            projects: repos // Legacy fallback
        };
        
        set({ workspace: updatedWorkspace });
        get().reloadRepositoriesList(updatedWorkspace);
        
        const currentActiveId = workspace.activeRepositoryId;
        if (currentActiveId === repoId || idx === -1) {
            get().loadRepository(savedRepo);
        }
    },

    updateProject: (projectId: string, title: string, version: string, spec: Repository) => 
        get().updateRepository(projectId, title, version, spec),

    addWorkspaceMember: async (handle: FileSystemDirectoryHandle) => {
        const { workspace } = get();
        
        // Strictly expect .arcbench directory
        let hasArcbench = false;
        try {
            await handle.getDirectoryHandle(".arcbench");
            hasArcbench = true;
        } catch {
            // Not found
        }
        if (!hasArcbench) {
            return {
                ok: false,
                code: 'missing_arcbench',
                message: "This folder does not contain a .arcbench configuration directory."
            };
        }

        // Prevent duplicate folder connection by checking isSameEntry on active handles
        let isDuplicate = false;
        for (const m of workspace.members) {
            if (m.handle) {
                try {
                    if (await handle.isSameEntry(m.handle)) {
                        isDuplicate = true;
                        break;
                    }
                } catch (e) {
                    // Ignore errors
                }
            }
        }
        if (isDuplicate) {
            return {
                ok: false,
                code: 'duplicate',
                message: "This folder is already connected to the workspace."
            };
        }

        // Determine a unique display name to prevent UI collisions
        let uniqueName = handle.name;
        let suffix = 2;
        while (workspace.members.some(m => m.name === uniqueName)) {
            uniqueName = `${handle.name} (${suffix})`;
            suffix++;
        }

        const memberId = "member_" + Math.random().toString(36).substring(2, 15);
        const newMember: WorkspaceMember = {
            id: memberId,
            name: uniqueName,
            folderName: handle.name,
            relativeWorkspacePath: handle.name,
            handle,
            status: 'needs_init', // temporary until checked
            hasArchitecture: false,
            specId: null,
            createdAt: new Date().toISOString(),
            lastConnectedAt: new Date().toISOString(),
            syncState: 'stale',
            lastSyncAt: null,
            lastSyncError: null
        };

        const updatedMembers = [...workspace.members, newMember];
        const updatedHandles = updatedMembers
            .map(m => m.handle)
            .filter((h): h is FileSystemDirectoryHandle => h !== null);

        const updatedWorkspace: Workspace = {
            ...workspace,
            members: updatedMembers
        };

        set({
            workspace: updatedWorkspace,
            projectHandles: updatedHandles,
            watchDirectoryHandle: get().watchDirectoryHandle || handle
        });

        await upsertWorkspaceMemberHandle(workspace.id, memberId, handle);

        saveWorkspaceMeta(updatedWorkspace);
        await syncMemberArchitecture(memberId, handle, workspace.activeRepositoryId);
        const syncedMember = get().workspace.members.find(m => m.id === memberId);
        if (syncedMember?.status === 'needs_init') {
            return {
                ok: false,
                code: 'missing_architecture',
                message: "Connected successfully, but no .arcbench/architecture.md file was found yet."
            };
        }
        return {
            ok: true,
            code: 'ok',
            message: 'Repository connected and synced.'
        };
    },

    removeWorkspaceMember: async (memberId: string) => {
        const { workspace, watchDirectoryHandle } = get();
        const member = workspace.members.find(m => m.id === memberId);
        if (!member) return;

        await removeWorkspaceMemberHandle(workspace.id, memberId);

        const updatedMembers = workspace.members.filter(m => m.id !== memberId);
        const updatedHandles = updatedMembers
            .map(m => m.handle)
            .filter((h): h is FileSystemDirectoryHandle => h !== null);
        
        let newWatchHandle = watchDirectoryHandle;
        if (watchDirectoryHandle && member.handle) {
            try {
                if (await watchDirectoryHandle.isSameEntry(member.handle)) {
                    newWatchHandle = updatedHandles.length > 0 ? updatedHandles[0] : null;
                }
            } catch {
                if (watchDirectoryHandle.name === member.folderName) {
                    newWatchHandle = updatedHandles.length > 0 ? updatedHandles[0] : null;
                }
            }
        }

        const updatedWorkspace: Workspace = {
            ...workspace,
            members: updatedMembers
        };

        let finalWorkspace = updatedWorkspace;

        // If this member was bound to a member-owned repository and no other member references it,
        // remove that repository and clear its audit history.
        if (member.specId) {
            const remainingRefCount = updatedMembers.filter(m => m.specId === member.specId).length;
            const boundRepo = workspace.repositories.find(r => r.id === member.specId);
            if (boundRepo && boundRepo.sourceKind === 'member-bound' && remainingRefCount === 0) {
                const updatedRepos = workspace.repositories.filter(r => r.id !== member.specId);
                finalWorkspace = {
                    ...updatedWorkspace,
                    repositories: updatedRepos,
                    projects: updatedRepos,
                    activeRepositoryId: updatedWorkspace.activeRepositoryId === member.specId
                        ? (updatedRepos[0]?.id || null)
                        : updatedWorkspace.activeRepositoryId,
                    activeProjectId: updatedWorkspace.activeRepositoryId === member.specId
                        ? (updatedRepos[0]?.id || null)
                        : updatedWorkspace.activeProjectId
                };
                try {
                    await clearProjectHistoryFromDB(member.specId);
                } catch (e) {
                    console.error("Failed to clear repository history for removed member", e);
                }
            }
        }

        set({
            workspace: finalWorkspace,
            projectHandles: updatedHandles,
            watchDirectoryHandle: newWatchHandle
        });

        saveWorkspaceMeta(finalWorkspace);
    },

    reconnectWorkspaceMember: async (memberId: string, handle: FileSystemDirectoryHandle) => {
        const { workspace } = get();
        
        // Strictly expect .arcbench directory
        let hasArcbench = false;
        try {
            await handle.getDirectoryHandle(".arcbench");
            hasArcbench = true;
        } catch {
            // Not found
        }
        if (!hasArcbench) {
            return {
                ok: false,
                code: 'missing_arcbench',
                message: "This folder does not contain a .arcbench configuration directory."
            };
        }

        // Prevent cross-connection of the same folder to another member slot
        let isDuplicate = false;
        for (const m of workspace.members) {
            if (m.id !== memberId && m.handle) {
                try {
                    if (await handle.isSameEntry(m.handle)) {
                        isDuplicate = true;
                        break;
                    }
                } catch (e) {
                    // Ignore errors
                }
            }
        }
        if (isDuplicate) {
            return {
                ok: false,
                code: 'duplicate',
                message: "This folder is already connected to another repository row in this workspace."
            };
        }

        const updatedMembers = workspace.members.map(m => {
            if (m.id === memberId) {
                return {
                    ...m,
                    handle,
                    lastConnectedAt: new Date().toISOString(),
                    syncState: 'stale' as const,
                    lastSyncError: null
                };
            }
            return m;
        });

        const updatedHandles = updatedMembers
            .map(m => m.handle)
            .filter((h): h is FileSystemDirectoryHandle => h !== null);

        const updatedWorkspace: Workspace = {
            ...workspace,
            members: updatedMembers
        };

        set({
            workspace: updatedWorkspace,
            projectHandles: updatedHandles,
            watchDirectoryHandle: get().watchDirectoryHandle || handle
        });

        await upsertWorkspaceMemberHandle(workspace.id, memberId, handle);

        saveWorkspaceMeta(updatedWorkspace);
        await syncMemberArchitecture(memberId, handle, workspace.activeRepositoryId);
        const syncedMember = get().workspace.members.find(m => m.id === memberId);
        if (syncedMember?.status === 'needs_init') {
            return {
                ok: false,
                code: 'missing_architecture',
                message: "Connected successfully, but no .arcbench/architecture.md file was found yet."
            };
        }
        return {
            ok: true,
            code: 'ok',
            message: 'Repository reconnected and synced.'
        };
    },

    syncWorkspaceMember: async (memberId: string) => {
        const { workspace } = get();
        const member = workspace.members.find(m => m.id === memberId);
        if (!member || !member.handle) {
            const updatedMembers = workspace.members.map(m =>
                m.id === memberId
                    ? { ...m, status: 'disconnected' as const, syncState: 'reconnect_required' as const, lastSyncError: 'No saved folder handle' }
                    : m
            );
            const updatedWorkspace = { ...workspace, members: updatedMembers };
            set({ workspace: updatedWorkspace });
            saveWorkspaceMeta(updatedWorkspace);
            return {
                ok: false,
                code: 'missing_handle',
                message: 'Saved folder location is no longer available. Connect again.'
            };
        }

        const handleWithPermissions = member.handle as FileSystemDirectoryHandle & {
            queryPermission?: (descriptor: { mode: 'readwrite' | 'read' }) => Promise<PermissionState>;
            requestPermission?: (descriptor: { mode: 'readwrite' | 'read' }) => Promise<PermissionState>;
        };
        const descriptor = { mode: 'readwrite' as const };
        try {
            if (typeof handleWithPermissions.queryPermission === 'function') {
                const permission = await handleWithPermissions.queryPermission(descriptor);
                if (permission !== 'granted' && typeof handleWithPermissions.requestPermission === 'function') {
                    const requested = await handleWithPermissions.requestPermission(descriptor);
                    if (requested !== 'granted') {
                        const updatedMembers = workspace.members.map(m =>
                            m.id === memberId
                                ? { ...m, syncState: 'stale' as const, lastSyncError: 'Permission denied', lastSyncAt: new Date().toISOString() }
                                : m
                        );
                        const updatedWorkspace = { ...workspace, members: updatedMembers };
                        set({ workspace: updatedWorkspace });
                        saveWorkspaceMeta(updatedWorkspace);
                        return {
                            ok: false,
                            code: 'permission_denied',
                            message: 'Folder permission was not granted. Please approve permission and try Sync again.'
                        };
                    }
                }
            }

            try {
                await member.handle.getDirectoryHandle('.arcbench');
            } catch (err) {
                const domErr = err as DOMException;
                const isPermissionError = domErr?.name === 'NotAllowedError' || domErr?.name === 'SecurityError';
                const updatedMembers = workspace.members.map(m =>
                    m.id === memberId
                        ? {
                            ...m,
                            status: isPermissionError ? m.status : ('disconnected' as const),
                            syncState: isPermissionError ? ('stale' as const) : ('reconnect_required' as const),
                            lastSyncError: isPermissionError ? 'Permission denied' : '.arcbench folder missing',
                            lastSyncAt: new Date().toISOString()
                        }
                        : m
                );
                const updatedWorkspace = { ...workspace, members: updatedMembers };
                set({ workspace: updatedWorkspace });
                saveWorkspaceMeta(updatedWorkspace);

                return isPermissionError
                    ? {
                        ok: false,
                        code: 'permission_denied',
                        message: 'Permission is required to read this folder. Grant permission and try Sync again.'
                    }
                    : {
                        ok: false,
                        code: 'missing_arcbench',
                        message: 'The previous folder no longer contains .arcbench. Connect again.'
                    };
            }

            await syncMemberArchitecture(memberId, member.handle, workspace.activeRepositoryId);
            const syncedMember = get().workspace.members.find(m => m.id === memberId);
            if (syncedMember?.status === 'needs_init') {
                return {
                    ok: false,
                    code: 'missing_architecture',
                    message: 'Sync completed, but .arcbench/architecture.md is missing.'
                };
            }

            return {
                ok: true,
                code: 'ok',
                message: 'Repository synced from local files.'
            };
        } catch (err) {
            const updatedMembers = workspace.members.map(m =>
                m.id === memberId
                    ? { ...m, syncState: 'stale' as const, lastSyncError: 'Sync failed', lastSyncAt: new Date().toISOString() }
                    : m
            );
            const updatedWorkspace = { ...workspace, members: updatedMembers };
            set({ workspace: updatedWorkspace });
            saveWorkspaceMeta(updatedWorkspace);
            return {
                ok: false,
                code: 'permission_denied',
                message: 'Sync failed. Check folder permissions and try again.'
            };
        }
    },

    setActiveView: (view: ActiveView) => {
        set({ activeView: view });
        
        const state = useProjectStore.getState();
        if (view.type === 'member') {
            const member = state.workspace.members.find(m => m.id === view.targetId);
            if (member && member.specId) {
                const spec = state.workspace.repositories.find(p => p.id === member.specId);
                if (spec) {
                    state.loadRepository(spec);
                    return;
                }
            }
            // Clear spec if member has no spec (needs onboarding)
            set({
                workspace: { ...state.workspace, activeRepositoryId: null, activeProjectId: null },
                currentProject: null,
                currentRepository: null,
                nodes: [],
                connections: [],
                flows: [],
                activeFlow: null,
                activeStepIndex: -1
            });
        } else if (view.type === 'standalone') {
            const spec = state.workspace.repositories.find(p => p.id === view.targetId);
            if (spec) {
                state.loadRepository(spec);
            }
        } else if (view.type === 'workspace_overview') {
            // If a workspace has no linked members but does have standalone specs,
            // workspace overview should fall back to a visible standalone spec.
            if (state.workspace.members.length === 0 && state.workspace.repositories.length > 0) {
                const fallbackSpec = resolvePreferredWorkspaceRepo(state.workspace);
                if (fallbackSpec) {
                    set({ activeView: { type: 'standalone', targetId: fallbackSpec.id } });
                    state.loadRepository(fallbackSpec);
                    return;
                }
            }

            set({
                workspace: { ...state.workspace, activeRepositoryId: null, activeProjectId: null },
                currentProject: null,
                currentRepository: null,
                nodes: [],
                connections: [],
                flows: [],
                activeFlow: null,
                activeStepIndex: -1
            });
        }
    },

    createWorkspace: (name: string) => {
        const id = "workspace_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
        const newWorkspace: Workspace = {
            id,
            name,
            repositories: [],
            projects: [], // Legacy fallback
            activeRepositoryId: null,
            activeProjectId: null, // Legacy fallback
            members: []
        };
        const workspaces = [...get().workspaces, newWorkspace];
        set({ workspaces, workspace: newWorkspace, activeView: { type: 'workspace_overview', targetId: null } });
        saveWorkspaceMeta(newWorkspace);
    },

    deleteWorkspace: async (workspaceId: string) => {
        const list = get().workspaces;
        if (list.length <= 1) {
            alert("You must keep at least one workspace.");
            return;
        }

        const targetWorkspace = list.find(w => w.id === workspaceId);
        if (targetWorkspace) {
            try {
                await removeWorkspaceMemberHandlesByWorkspace(workspaceId);
            } catch (e) {
                console.error(`Failed to clear handle records for workspace ${workspaceId}`, e);
            }
            const repos = targetWorkspace.repositories || targetWorkspace.projects || [];
            for (const repo of repos) {
                try {
                    await clearProjectHistoryFromDB(repo.id);
                } catch (e) {
                    console.error(`Failed to clear repository history for ${repo.id} in workspace ${workspaceId}`, e);
                }
            }
        }

        const workspaces = list.filter(w => w.id !== workspaceId);
        let active = get().workspace;
        if (active.id === workspaceId) {
            active = workspaces[0];
        }
        set({ workspaces, workspace: active });
        
        // Select active repository
        const activeRepo = active.repositories.find(p => p.id === active.activeRepositoryId) || null;
        set({
            availableProjects: active.repositories,
            currentProject: activeRepo,
            availableRepositories: active.repositories,
            currentRepository: activeRepo,
            nodes: activeRepo ? (activeRepo.nodes || []) : [],
            connections: activeRepo ? (activeRepo.connections || []) : [],
            flows: activeRepo ? (activeRepo.flows || []) : [],
            activeFlow: null,
            activeStepIndex: -1
        });

        saveWorkspaceMeta(active);
    },

    switchWorkspace: (workspaceId: string) => {
        const active = get().workspaces.find(w => w.id === workspaceId);
        if (!active) return;

        const list = active.repositories || [];
        const activeRepo = resolvePreferredWorkspaceRepo(active);

        const normalizedWorkspace: Workspace = {
            ...active,
            activeRepositoryId: activeRepo ? activeRepo.id : null,
            activeProjectId: activeRepo ? activeRepo.id : null // Legacy fallback
        };

        // Resolve view exactly like initializeStore.
        let activeView: ActiveView = { type: 'workspace_overview', targetId: null };
        if (activeRepo) {
            const matchedMember = normalizedWorkspace.members.find(m => m.specId === activeRepo!.id);
            if (matchedMember) {
                activeView = { type: 'member', targetId: matchedMember.id };
            } else {
                activeView = { type: 'standalone', targetId: activeRepo.id };
            }
        }

        set({ 
            workspace: normalizedWorkspace,
            activeView,
            availableProjects: list,
            currentProject: activeRepo,
            availableRepositories: list,
            currentRepository: activeRepo,
            nodes: activeRepo ? (activeRepo.nodes || []) : [],
            connections: activeRepo ? (activeRepo.connections || []) : [],
            flows: activeRepo ? (activeRepo.flows || []) : [],
            activeFlow: null,
            activeStepIndex: -1
        });
        
        saveWorkspaceMeta(normalizedWorkspace);
    },

    updateWorkspaceName: (workspaceId: string, name: string) => {
        const workspaces = get().workspaces.map(w => w.id === workspaceId ? { ...w, name } : w);
        let active = get().workspace;
        if (active.id === workspaceId) {
            active = { ...active, name };
        }
        set({ workspaces, workspace: active });
        saveWorkspaceMeta(active);
    }
}));
