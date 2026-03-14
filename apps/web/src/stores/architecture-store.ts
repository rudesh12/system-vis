import { create } from 'zustand';
import {
  type Node,
  type Edge,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import { NODE_TOOLTIPS, type ArchNodeData, type ArchEdgeData } from '@system-vis/shared';

let nodeIdCounter = 0;

function withTooltip(data: ArchNodeData): ArchNodeData {
  const tooltip =
    typeof data.tooltip === 'string' && data.tooltip.trim().length > 0
      ? data.tooltip
      : NODE_TOOLTIPS[data.nodeType];
  return { ...data, tooltip } as ArchNodeData;
}


interface ArchitectureState {
  nodes: Node<ArchNodeData>[];
  edges: Edge<ArchEdgeData>[];
  selectedNodeId: string | null;
  architectureName: string;

  // Node operations
  addNode: (params: { type: string; position: { x: number; y: number }; data: ArchNodeData }) => void;
  updateNodeData: (nodeId: string, data: Partial<ArchNodeData>) => void;
  removeNode: (nodeId: string) => void;
  setSelectedNodeId: (nodeId: string | null) => void;

  // Edge operations
  addEdge: (connection: Connection) => void;
  removeEdge: (edgeId: string) => void;

  // React Flow change handlers
  onNodesChange: (changes: NodeChange<Node<ArchNodeData>>[]) => void;
  onEdgesChange: (changes: EdgeChange<Edge<ArchEdgeData>>[]) => void;

  // Persistence
  setArchitectureName: (name: string) => void;
  loadArchitecture: (nodes: Node<ArchNodeData>[], edges: Edge<ArchEdgeData>[], name?: string) => void;
  clearArchitecture: () => void;
  getNodeLabels: () => Record<string, string>;
}

export const useArchitectureStore = create<ArchitectureState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  architectureName: 'Untitled Architecture',

  addNode: ({ type, position, data }) => {
    const id = `node_${++nodeIdCounter}_${Date.now()}`;
    const newNode: Node<ArchNodeData> = {
      id,
      type,
      position,
      data: withTooltip(data),
    };
    set((state) => ({ nodes: [...state.nodes, newNode] }));
  },

  updateNodeData: (nodeId, data) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } as ArchNodeData }
          : node
      ),
    }));
  },

  removeNode: (nodeId) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
    }));
  },

  setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),

  addEdge: (connection) => {
    const id = `edge_${connection.source}_${connection.target}`;
    const newEdge: Edge<ArchEdgeData> = {
      id,
      source: connection.source!,
      target: connection.target!,
      sourceHandle: connection.sourceHandle ?? undefined,
      targetHandle: connection.targetHandle ?? undefined,
      data: {
        protocol: 'http',
        bandwidthMbps: 1000,
        latencyOverheadMs: 1,
        encrypted: true,
      },
    };
    set((state) => ({
      edges: state.edges.some((e) => e.id === id)
        ? state.edges
        : [...state.edges, newEdge],
    }));
  },

  removeEdge: (edgeId) => {
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== edgeId),
    }));
  },

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
    }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }));
  },

  setArchitectureName: (name) => set({ architectureName: name }),

  loadArchitecture: (nodes, edges, name) => {
    const hydratedNodes = nodes.map((n) => ({ ...n, data: withTooltip(n.data) }));
    set({
      nodes: hydratedNodes,
      edges,
      selectedNodeId: null,
      architectureName: name ?? 'Untitled Architecture',
    });
  },

  clearArchitecture: () => {
    set({ nodes: [], edges: [], selectedNodeId: null });
  },

  getNodeLabels: () => {
    const { nodes } = get();
    const labels: Record<string, string> = {};
    nodes.forEach((node) => {
      labels[node.id] = node.data.label || node.id;
    });
    return labels;
  },
}));

