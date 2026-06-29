import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  MarkerType,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import CanvasNode from "./CanvasNode";
import NodeConfigPanel from "./NodeConfigPanel";
import { NODE_DEFS, getNodeDef, genId, defaultDataForType } from "./nodeDefs";

const nodeTypes = { botNode: CanvasNode };

const toRfNodes = (nodes = []) =>
  nodes.map((n, i) => ({
    id: n.id,
    type: "botNode",
    position: n.position || { x: 80 + (i % 4) * 260, y: 40 + Math.floor(i / 4) * 180 },
    data: { flowType: n.type, nodeData: n.data || {} },
  }));

const toRfEdges = (edges = []) =>
  edges.map((e, i) => ({
    id: e.id || `e_${e.source}_${e.sourceHandle || "default"}_${e.target}_${i}`,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || "default",
    targetHandle: e.targetHandle || null,
  }));

const toFlowJson = (nodes, edges) => ({
  nodes: nodes.map((n) => ({ id: n.id, type: n.data.flowType, data: n.data.nodeData, position: n.position })),
  edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle || undefined })),
});

const clampHandleIndex = (items, handlePrefix, edges, source) =>
  edges.filter((e) => {
    if (e.source !== source || !e.sourceHandle?.startsWith(handlePrefix)) return true;
    const idx = parseInt(e.sourceHandle.split("-")[1], 10);
    return idx < items.length;
  });

function FlowInner({ value, onChange }) {
  const [graph, setGraph] = useState(() => ({ nodes: toRfNodes(value?.nodes), edges: toRfEdges(value?.edges) }));
  const [selectedId, setSelectedId] = useState(null);
  const lastEmitted = useRef(JSON.stringify(value || {}));
  const isInternal = useRef(false);
  const wrapperRef = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  // Sync desde afuera (cambio de bot, "cargar ejemplo", etc.)
  useEffect(() => {
    const sig = JSON.stringify(value || {});
    if (sig !== lastEmitted.current) {
      setGraph({ nodes: toRfNodes(value?.nodes), edges: toRfEdges(value?.edges) });
      lastEmitted.current = sig;
      setSelectedId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Emitir hacia afuera solo cuando el cambio fue local
  useEffect(() => {
    if (isInternal.current) {
      isInternal.current = false;
      const flowJson = toFlowJson(graph.nodes, graph.edges);
      lastEmitted.current = JSON.stringify(flowJson);
      onChange(flowJson);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  const mutate = useCallback((updater) => {
    isInternal.current = true;
    setGraph((g) => updater(g));
  }, []);

  const onNodesChange = useCallback((changes) => mutate((g) => ({ ...g, nodes: applyNodeChanges(changes, g.nodes) })), [mutate]);
  const onEdgesChange = useCallback((changes) => mutate((g) => ({ ...g, edges: applyEdgeChanges(changes, g.edges) })), [mutate]);

  const onConnect = useCallback((params) => {
    mutate((g) => {
      const { source, sourceHandle, target } = params;
      let nodes = g.nodes;
      let edges = g.edges.filter((e) => !(e.source === source && (e.sourceHandle || "default") === (sourceHandle || "default")));

      if (sourceHandle?.startsWith("opt-")) {
        const idx = parseInt(sourceHandle.split("-")[1], 10);
        nodes = nodes.map((n) => {
          if (n.id !== source) return n;
          const options = [...(n.data.nodeData.options || [])];
          if (options[idx]) options[idx] = { ...options[idx], nextNodeId: target };
          return { ...n, data: { ...n.data, nodeData: { ...n.data.nodeData, options } } };
        });
      } else if (sourceHandle?.startsWith("cond-")) {
        const idx = parseInt(sourceHandle.split("-")[1], 10);
        nodes = nodes.map((n) => {
          if (n.id !== source) return n;
          const conditions = [...(n.data.nodeData.conditions || [])];
          if (conditions[idx]) conditions[idx] = { ...conditions[idx], nextNodeId: target };
          return { ...n, data: { ...n.data, nodeData: { ...n.data.nodeData, conditions } } };
        });
      }

      edges = addEdge({ ...params, id: `e_${source}_${sourceHandle || "default"}_${target}_${Date.now()}` }, edges);
      return { nodes, edges };
    });
  }, [mutate]);

  const clearBranchTarget = (nodes, nodeId, prefix, idx) => nodes.map((n) => {
    if (n.id !== nodeId) return n;
    if (prefix === "opt-") {
      const options = [...(n.data.nodeData.options || [])];
      if (options[idx]) { const o = { ...options[idx] }; delete o.nextNodeId; options[idx] = o; }
      return { ...n, data: { ...n.data, nodeData: { ...n.data.nodeData, options } } };
    }
    const conditions = [...(n.data.nodeData.conditions || [])];
    if (conditions[idx]) { const c = { ...conditions[idx] }; delete c.nextNodeId; conditions[idx] = c; }
    return { ...n, data: { ...n.data, nodeData: { ...n.data.nodeData, conditions } } };
  });

  const onEdgesDelete = useCallback((deleted) => {
    mutate((g) => {
      let nodes = g.nodes;
      deleted.forEach((e) => {
        if (e.sourceHandle?.startsWith("opt-")) nodes = clearBranchTarget(nodes, e.source, "opt-", parseInt(e.sourceHandle.split("-")[1], 10));
        else if (e.sourceHandle?.startsWith("cond-")) nodes = clearBranchTarget(nodes, e.source, "cond-", parseInt(e.sourceHandle.split("-")[1], 10));
      });
      return { ...g, nodes };
    });
  }, [mutate]);

  const onNodesDelete = useCallback((deletedNodes) => {
    mutate((g) => {
      const deletedIds = new Set(deletedNodes.map((n) => n.id));
      const nodes = g.nodes.filter((n) => !deletedIds.has(n.id)).map((n) => {
        let nd = n.data.nodeData;
        if (nd?.options?.some((o) => deletedIds.has(o.nextNodeId))) nd = { ...nd, options: nd.options.map((o) => deletedIds.has(o.nextNodeId) ? { ...o, nextNodeId: undefined } : o) };
        if (nd?.conditions?.some((c) => deletedIds.has(c.nextNodeId))) nd = { ...nd, conditions: nd.conditions.map((c) => deletedIds.has(c.nextNodeId) ? { ...c, nextNodeId: undefined } : c) };
        return { ...n, data: { ...n.data, nodeData: nd } };
      });
      const edges = g.edges.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target));
      return { nodes, edges };
    });
  }, [mutate]);

  const addNode = useCallback((flowType, position) => {
    mutate((g) => {
      const pos = position || { x: 120 + Math.random() * 60, y: 60 + g.nodes.length * 40 };
      const newNode = { id: genId(flowType.replace("Node", "")), type: "botNode", position: pos, data: { flowType, nodeData: defaultDataForType(flowType) } };
      return { ...g, nodes: [...g.nodes, newNode] };
    });
  }, [mutate]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const flowType = e.dataTransfer.getData("application/botnode");
    if (!flowType) return;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNode(flowType, position);
  }, [addNode, screenToFlowPosition]);

  const updateNodeData = useCallback((nodeId, updater) => {
    mutate((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, nodeData: updater(n.data.nodeData) } } : n)),
    }));
  }, [mutate]);

  const onDelete = useCallback((nodeId) => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (node) onNodesDelete([node]);
    if (selectedId === nodeId) setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes, onNodesDelete, selectedId]);

  const decoratedNodes = graph.nodes.map((n) => ({
    ...n,
    selected: n.id === selectedId,
    data: { ...n.data, onDelete },
  }));

  const selectedNode = graph.nodes.find((n) => n.id === selectedId) || null;
  const allNodesForPanel = graph.nodes.map((n) => {
    const def = getNodeDef(n.data.flowType);
    return { id: n.id, label: `${def.icon} ${def.label}` };
  });

  const numStart = graph.nodes.filter((n) => n.data.flowType === "startNode").length;

  return (
    <div className="flex h-full">
      {/* Paleta */}
      <div className="w-[180px] border-r border-slate-200 bg-slate-50 overflow-y-auto p-2 space-y-1.5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-1 mb-1">Bloques</p>
        {NODE_DEFS.filter((d) => d.type !== "startNode" || numStart === 0).map((def) => (
          <div
            key={def.type}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("application/botnode", def.type)}
            onClick={() => addNode(def.type)}
            title={def.description}
            className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-600 cursor-grab hover:border-slate-300 hover:shadow-sm active:cursor-grabbing select-none"
          >
            <span>{def.icon}</span>
            <span className="truncate">{def.label}</span>
          </div>
        ))}
        <p className="text-[10px] text-slate-400 px-1 pt-2 leading-relaxed">
          Arrastra un bloque al lienzo o haz clic para insertarlo. Conecta arrastrando desde los puntos de cada nodo.
        </p>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative" ref={wrapperRef} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
        {numStart !== 1 && (
          <div className="absolute top-2 left-2 right-2 z-10 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] px-3 py-1.5 rounded-lg">
            ⚠️ El flujo debe tener exactamente un nodo "Inicio" (tiene {numStart}).
          </div>
        )}
        <ReactFlow
          nodes={decoratedNodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" }, style: { stroke: "#94a3b8", strokeWidth: 2 } }}
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
        >
          <Background gap={18} size={1} color="#e2e8f0" />
          <Controls position="bottom-left" />
          <MiniMap pannable zoomable style={{ width: 110, height: 80 }} />
        </ReactFlow>
      </div>

      {/* Panel de configuración */}
      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          allNodes={allNodesForPanel}
          onClose={() => setSelectedId(null)}
          onUpdateField={(key, val) => updateNodeData(selectedNode.id, (nd) => ({ ...nd, [key]: val }))}
          onOptionsChange={(newOptions) => {
            updateNodeData(selectedNode.id, (nd) => ({ ...nd, options: newOptions }));
            mutate((g) => ({ ...g, edges: clampHandleIndex(newOptions, "opt-", g.edges, selectedNode.id) }));
          }}
          onConditionsChange={(newConditions) => {
            updateNodeData(selectedNode.id, (nd) => ({ ...nd, conditions: newConditions }));
            mutate((g) => ({ ...g, edges: clampHandleIndex(newConditions, "cond-", g.edges, selectedNode.id) }));
          }}
        />
      )}
    </div>
  );
}

export default function BotFlowEditor({ value, onChange }) {
  return (
    <ReactFlowProvider>
      <FlowInner value={value} onChange={onChange} />
    </ReactFlowProvider>
  );
}
