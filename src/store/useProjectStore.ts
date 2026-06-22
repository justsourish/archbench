import { create } from 'zustand';
import { Project, NodeData, ConnectionData, Flow, BatchLog } from '../types';
import { getAvailableProjects, getCustomProjects, saveCustomProjects } from '../utils/projectHelpers';
import { clearProjectHistoryFromDB } from '../db';

interface ProjectState {
    availableProjects: Project[];
    currentProject: Project | null;
    nodes: NodeData[];
    connections: ConnectionData[];
    flows: Flow[];
    activeFlow: Flow | null;
    activeStepIndex: number;
    sidebarTab: string;
    liveWatchEnabled: boolean;
    unifiedBatchLog: BatchLog | null;
    watchDirectoryHandle: any | null;
    hoveredNodeId: string | null;

    // Actions
    initializeStore: () => void;
    loadProject: (project: Project) => void;
    reloadProjectsList: () => void;
    setSidebarTab: (tabId: string) => void;
    startFlow: (flowId: string) => void;
    exitFlow: () => void;
    stepFlow: (direction: 'next' | 'prev') => void;
    setUnifiedBatchLog: (log: BatchLog | null) => void;
    setLiveWatchEnabled: (enabled: boolean) => void;
    setWatchDirectoryHandle: (handle: any | null) => void;
    updateNodePosition: (nodeId: string, x: number, y: number) => void;
    createProject: (project: Project) => void;
    deleteProject: (projectId: string) => Promise<void>;
    updateProject: (projectId: string, title: string, version: string, spec: Project) => void;
    setHoveredNodeId: (id: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
    availableProjects: [],
    currentProject: null,
    nodes: [],
    connections: [],
    flows: [],
    activeFlow: null,
    activeStepIndex: -1,
    sidebarTab: 'ai',
    liveWatchEnabled: false,
    unifiedBatchLog: null,
    watchDirectoryHandle: null,
    hoveredNodeId: null,

    initializeStore: () => {
        const list = getAvailableProjects();
        const activeId = localStorage.getItem("archbench_active_project_id");
        let activeProj = list.find(p => p.id === activeId) || null;

        if (!activeProj && list.length > 0) {
            activeProj = list[0];
        }

        set({
            availableProjects: list,
            currentProject: activeProj,
            nodes: activeProj ? (activeProj.nodes || []) : [],
            connections: activeProj ? (activeProj.connections || []) : [],
            flows: activeProj ? (activeProj.flows || []) : [],
            activeFlow: null,
            activeStepIndex: -1,
            hoveredNodeId: null
        });
    },

    loadProject: (projectToLoad: Project) => {
        localStorage.setItem("archbench_active_project_id", projectToLoad.id);
        set({
            currentProject: projectToLoad,
            nodes: projectToLoad.nodes || [],
            connections: projectToLoad.connections || [],
            flows: projectToLoad.flows || [],
            activeFlow: null,
            activeStepIndex: -1,
            unifiedBatchLog: null,
            hoveredNodeId: null
        });
    },

    reloadProjectsList: () => {
        const list = getAvailableProjects();
        const current = get().currentProject;
        // Keep currentProject synced if list changes (e.g., project was edited)
        const updatedCurrent = current ? (list.find(p => p.id === current.id) || current) : null;
        
        set({
            availableProjects: list,
            currentProject: updatedCurrent,
            nodes: updatedCurrent ? (updatedCurrent.nodes || []) : [],
            connections: updatedCurrent ? (updatedCurrent.connections || []) : [],
            flows: updatedCurrent ? (updatedCurrent.flows || []) : []
        });
    },

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
        set({ liveWatchEnabled: enabled });
    },

    setHoveredNodeId: (id: string | null) => {
        set({ hoveredNodeId: id });
    },

    setWatchDirectoryHandle: (handle: any | null) => {
        set({ watchDirectoryHandle: handle });
    },

    updateNodePosition: (nodeId: string, x: number, y: number) => {
        const { currentProject, nodes, availableProjects } = get();
        const updatedNodes = nodes.map(n => n.id === nodeId ? { ...n, x, y } : n);
        
        if (currentProject) {
            const updatedProject = {
                ...currentProject,
                nodes: (currentProject.nodes || []).map(n => n.id === nodeId ? { ...n, x, y } : n)
            };
            
            const updatedAvailable = availableProjects.map(p => 
                p.id === currentProject.id ? updatedProject : p
            );
            
            const customProjects = getCustomProjects();
            const isCustom = customProjects.some(p => p.id === currentProject.id);
            if (isCustom) {
                const updatedCustom = customProjects.map(p => 
                    p.id === currentProject.id ? updatedProject : p
                );
                saveCustomProjects(updatedCustom);
            }
            
            set({
                nodes: updatedNodes,
                currentProject: updatedProject,
                availableProjects: updatedAvailable
            });
        } else {
            set({ nodes: updatedNodes });
        }
    },

    createProject: (newProj: Project) => {
        const custom = getCustomProjects();
        custom.push(newProj);
        saveCustomProjects(custom);
        get().reloadProjectsList();
        get().loadProject(newProj);
    },

    deleteProject: async (projectId: string) => {
        const custom = getCustomProjects();
        const updated = custom.filter(p => p.id !== projectId);
        saveCustomProjects(updated);
        
        try {
            await clearProjectHistoryFromDB(projectId);
        } catch (e) {
            console.error("Failed to clear project history from DB", e);
        }

        const current = get().currentProject;
        get().reloadProjectsList();
        
        if (current && current.id === projectId) {
            const list = get().availableProjects;
            const nextProj = list.length > 0 ? list[0] : null;
            if (nextProj) {
                get().loadProject(nextProj);
            } else {
                set({
                    currentProject: null,
                    nodes: [],
                    connections: [],
                    flows: [],
                    activeFlow: null,
                    activeStepIndex: -1,
                    unifiedBatchLog: null,
                    hoveredNodeId: null
                });
            }
        }
    },

    updateProject: (projectId: string, title: string, version: string, spec: Project) => {
        const custom = getCustomProjects();
        const idx = custom.findIndex(p => p.id === projectId);
        
        let savedProject: Project;
        if (idx === -1) {
            // Editing built-in project, save as a new custom project clone
            savedProject = {
                ...spec,
                id: "project_" + Date.now(),
                title,
                version
            };
            custom.push(savedProject);
            saveCustomProjects(custom);
        } else {
            savedProject = {
                ...spec,
                id: projectId,
                title,
                version
            };
            custom[idx] = savedProject;
            saveCustomProjects(custom);
        }
        
        get().reloadProjectsList();
        
        const current = get().currentProject;
        if (current && (current.id === projectId || idx === -1)) {
            get().loadProject(savedProject);
        }
    }
}));
