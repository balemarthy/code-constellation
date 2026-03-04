import React, { useEffect, useState, useCallback, useRef } from 'react';
import ReactFlow, {
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    Panel,
    Node,
    Edge,
    Handle,
    Position,
    NodeProps,
    useNodesState,
    useEdgesState,
    useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { SymbolNode } from '../types';

interface GraphViewProps {
    centerSymbol: SymbolNode | null;
    onNodeSelect: (name: string, metadata?: { file?: string; start?: { row: number; column: number } }) => void;
}

// ─── Custom node data ─────────────────────────────────────────────────────────

interface SymbolNodeData {
    label: string;
    snippet?: string;
    file?: string;
    start?: { row: number; column: number };
    nodeKind: 'center' | 'caller' | 'callee';
    isExpanded?: boolean;
    expansionGroupId?: string;
    onToggle?: () => void;
}

// ─── Color palette per role ────────────────────────────────────────────────────

const ROLE_COLORS = {
    center: {
        bg: '#172554',
        border: '#3b82f6',
        label: '#bfdbfe',
        sub: '#93c5fd',
        file: '#60a5fa',
        glow: 'rgba(59,130,246,0.45)',
        badge: '#1d4ed8',
        badgeText: '#93c5fd',
        handle: '#3b82f6',
    },
    caller: {
        bg: '#052e16',
        border: '#22c55e',
        label: '#bbf7d0',
        sub: '#86efac',
        file: '#4ade80',
        glow: 'rgba(34,197,94,0.2)',
        badge: '#14532d',
        badgeText: '#86efac',
        handle: '#22c55e',
    },
    callee: {
        bg: '#2e1065',
        border: '#a78bfa',
        label: '#ede9fe',
        sub: '#c4b5fd',
        file: '#a78bfa',
        glow: 'rgba(167,139,250,0.2)',
        badge: '#4c1d95',
        badgeText: '#c4b5fd',
        handle: '#a78bfa',
    },
} as const;

// ─── Custom node component — must be defined outside GraphView ────────────────

const SymbolGraphNode: React.FC<NodeProps<SymbolNodeData>> = ({ data }) => {
    const isCenter = data.nodeKind === 'center';
    const c = ROLE_COLORS[data.nodeKind];
    const roleLabel = isCenter ? 'SELECTED' : data.nodeKind === 'caller' ? 'CALLER' : 'CALLEE';

    return (
        <div style={{
            background: c.bg,
            border: `${isCenter ? '2px' : '1px'} solid ${c.border}`,
            borderRadius: '10px',
            padding: isCenter ? '14px 18px' : '10px 14px',
            minWidth: isCenter ? '190px' : '155px',
            maxWidth: '260px',
            position: 'relative',
            boxShadow: `0 0 ${isCenter ? 28 : 10}px ${c.glow}, 0 4px 16px rgba(0,0,0,0.6)`,
        }}>
            <Handle
                type="target"
                position={Position.Top}
                style={{ background: c.handle, border: 'none', width: '8px', height: '8px' }}
            />

            {/* Role badge */}
            <div style={{
                display: 'inline-block',
                fontSize: '8px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: c.badgeText,
                background: c.badge,
                border: `1px solid ${c.border}`,
                borderRadius: '4px',
                padding: '1px 5px',
                marginBottom: '7px',
                opacity: 0.9,
            }}>
                {roleLabel}
            </div>

            {/* Function name */}
            <div style={{
                fontWeight: isCenter ? 700 : 600,
                fontSize: isCenter ? '14px' : '12px',
                wordBreak: 'break-all',
                lineHeight: '1.4',
                paddingRight: data.onToggle ? '28px' : '0',
                color: c.label,
                letterSpacing: isCenter ? '0.01em' : '0',
            }}>
                {data.label}
            </div>

            {/* Call site snippet */}
            {data.snippet && !isCenter && (
                <div style={{
                    fontSize: '10px',
                    color: c.sub,
                    fontFamily: 'monospace',
                    marginTop: '5px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '210px',
                    opacity: 0.8,
                }} title={data.snippet}>
                    {data.snippet}
                </div>
            )}

            {/* Source file name */}
            {data.file && !isCenter && (
                <div style={{
                    fontSize: '9px',
                    color: c.file,
                    marginTop: '3px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    opacity: 0.7,
                }}>
                    {data.file.split(/[/\\]/).pop()}
                </div>
            )}

            {/* Expand / Collapse toggle button */}
            {data.onToggle && (
                <button
                    onClick={e => { e.stopPropagation(); data.onToggle!(); }}
                    title={data.isExpanded ? 'Collapse' : 'Expand callers & callees'}
                    style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: data.isExpanded ? 'rgba(239,68,68,0.15)' : `${c.badge}cc`,
                        border: `1px solid ${data.isExpanded ? '#ef4444' : c.border}`,
                        color: data.isExpanded ? '#fca5a5' : c.badgeText,
                        fontSize: '14px',
                        lineHeight: '1',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                    }}
                >
                    {data.isExpanded ? '−' : '+'}
                </button>
            )}

            <Handle
                type="source"
                position={Position.Bottom}
                style={{ background: c.handle, border: 'none', width: '8px', height: '8px' }}
            />
        </div>
    );
};

const nodeTypes = { symbolNode: SymbolGraphNode };

// ─── GraphView ────────────────────────────────────────────────────────────────

const GraphView: React.FC<GraphViewProps> = ({ centerSymbol, onNodeSelect }) => {
    const { getNodes } = useReactFlow();

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    const [pendingExpand,   setPendingExpand]   = useState<{ nodeId: string; nodeName: string } | null>(null);
    const [pendingCollapse, setPendingCollapse] = useState<string | null>(null);

    // ── Node / Edge factories ──────────────────────────────────────────────────
    const makeNode = useCallback((
        id: string,
        name: string,
        kind: 'center' | 'caller' | 'callee',
        position: { x: number; y: number },
        snippet?: string,
        file?: string,
        expansionGroupId?: string,
    ): Node => ({
        id,
        type: 'symbolNode',
        position,
        data: {
            label: name,
            snippet,
            file,
            nodeKind: kind,
            isExpanded: false,
            expansionGroupId,
            onToggle: kind !== 'center'
                ? () => setPendingExpand({ nodeId: id, nodeName: name })
                : undefined,
        } satisfies SymbolNodeData,
    }), [setPendingExpand]);

    const makeEdge = (
        id: string,
        source: string,
        target: string,
        dim = false,
        kind: 'caller' | 'callee' = 'caller',
    ): Edge => ({
        id, source, target,
        animated: !dim,
        style: {
            stroke: dim
                ? '#1e293b'
                : kind === 'caller' ? '#22c55e' : '#a78bfa',
            strokeWidth: dim ? 1 : 2,
            opacity: dim ? 0.35 : 1,
        },
    });

    // ── Collect all node IDs that are descendants of a given expansion ────────
    function collectExpansionDescendants(parentId: string, allNodes: Node[]): Set<string> {
        const result = new Set<string>();
        const queue = [parentId];
        while (queue.length > 0) {
            const current = queue.shift()!;
            for (const n of allNodes) {
                if (n.data.expansionGroupId === current && !result.has(n.id)) {
                    result.add(n.id);
                    queue.push(n.id);
                }
            }
        }
        return result;
    }

    // ── Build base graph when center symbol changes ───────────────────────────
    useEffect(() => {
        if (!centerSymbol) { setNodes([]); setEdges([]); return; }

        const load = async () => {
            const [callers, callees] = await Promise.all([
                window.api.getCallers(centerSymbol.name),
                window.api.getCallees(centerSymbol.name),
            ]);

            const newNodes: Node[] = [];
            const newEdges: Edge[] = [];

            // Center at origin
            newNodes.push(makeNode('center', centerSymbol.name, 'center', { x: 400, y: 300 }));

            // Callers tier — spaced above
            const callerSpacing = Math.min(260, 1400 / Math.max(callers.length, 1));
            const callerStartX  = 400 - ((callers.length - 1) / 2) * callerSpacing;
            callers.forEach((c, idx) => {
                const id = `caller-${idx}`;
                newNodes.push(makeNode(id, c.caller, 'caller',
                    { x: callerStartX + idx * callerSpacing, y: 60 },
                    c.snippet, c.file,
                ));
                newEdges.push(makeEdge(`e-${id}-ctr`, id, 'center', false, 'caller'));
            });

            // Callees tier — spaced below
            const calleeSpacing = Math.min(260, 1400 / Math.max(callees.length, 1));
            const calleeStartX  = 400 - ((callees.length - 1) / 2) * calleeSpacing;
            callees.forEach((callee, idx) => {
                const id = `callee-${idx}`;
                newNodes.push(makeNode(id, callee, 'callee',
                    { x: calleeStartX + idx * calleeSpacing, y: 540 },
                ));
                newEdges.push(makeEdge(`e-ctr-${id}`, 'center', id, false, 'callee'));
            });

            setNodes(newNodes);
            setEdges(newEdges);
        };

        load();
    }, [centerSymbol, makeNode, setNodes, setEdges]);

    // ── Expand a node in-place ────────────────────────────────────────────────
    const expandingRef = useRef(false);

    useEffect(() => {
        if (!pendingExpand || expandingRef.current) return;
        expandingRef.current = true;

        const { nodeId, nodeName } = pendingExpand;

        const doExpand = async () => {
            const currentNodes = getNodes();
            const targetNode = currentNodes.find(n => n.id === nodeId);

            if (!targetNode) {
                setPendingExpand(null);
                expandingRef.current = false;
                return;
            }

            const pos = targetNode.position;
            const [callers, callees] = await Promise.all([
                window.api.getCallers(nodeName),
                window.api.getCallees(nodeName),
            ]);

            const existingLabels = new Set(currentNodes.map(n => String(n.data.label)));
            const addedNodes: Node[] = [];
            const addedEdges: Edge[] = [];

            const callerSpacing = Math.min(240, 1100 / Math.max(callers.length, 1));
            callers.forEach((c, idx) => {
                if (existingLabels.has(c.caller)) return;
                existingLabels.add(c.caller);
                const id = `exp-${nodeId}-cal-${idx}`;
                addedNodes.push(makeNode(id, c.caller, 'caller',
                    { x: pos.x + (idx - callers.length / 2) * callerSpacing, y: pos.y - 180 },
                    c.snippet, c.file, nodeId,
                ));
                addedEdges.push(makeEdge(`ee-${id}-${nodeId}`, id, nodeId, true, 'caller'));
            });

            const calleeSpacing = Math.min(240, 1100 / Math.max(callees.length, 1));
            callees.forEach((callee, idx) => {
                if (existingLabels.has(callee)) return;
                existingLabels.add(callee);
                const id = `exp-${nodeId}-cle-${idx}`;
                addedNodes.push(makeNode(id, callee, 'callee',
                    { x: pos.x + (idx - callees.length / 2) * calleeSpacing, y: pos.y + 180 },
                    undefined, undefined, nodeId,
                ));
                addedEdges.push(makeEdge(`ee-${nodeId}-${id}`, nodeId, id, true, 'callee'));
            });

            setNodes(prev => [
                ...prev.map(n => n.id === nodeId
                    ? {
                        ...n,
                        data: {
                            ...n.data,
                            isExpanded: true,
                            onToggle: () => setPendingCollapse(nodeId),
                        },
                      }
                    : n
                ),
                ...addedNodes,
            ]);
            setEdges(prev => [...prev, ...addedEdges]);
            setPendingExpand(null);
            expandingRef.current = false;
        };

        doExpand();
    }, [pendingExpand, getNodes, makeNode, setPendingCollapse, setNodes, setEdges]);

    // ── Collapse a node and remove its descendants ────────────────────────────
    useEffect(() => {
        if (!pendingCollapse) return;

        const nodeId = pendingCollapse;
        const currentNodes = getNodes();
        const toRemove = collectExpansionDescendants(nodeId, currentNodes);

        setNodes(prev =>
            prev
                .filter(n => !toRemove.has(n.id))
                .map(n => n.id === nodeId
                    ? {
                        ...n,
                        data: {
                            ...n.data,
                            isExpanded: false,
                            onToggle: () => setPendingExpand({ nodeId, nodeName: n.data.label }),
                        },
                      }
                    : n
                )
        );
        setEdges(prev =>
            prev.filter(e => !toRemove.has(e.source) && !toRemove.has(e.target))
        );
        setPendingCollapse(null);
    }, [pendingCollapse, getNodes, setPendingExpand, setNodes, setEdges]);

    // ── Node body click → navigate ────────────────────────────────────────────
    const handleNodeClick = (_event: React.MouseEvent, node: Node) => {
        const label = node.data.label;
        if (label && label !== centerSymbol?.name) {
            onNodeSelect(label, { file: node.data.file, start: node.data.start });
        }
    };

    // ── Empty state ───────────────────────────────────────────────────────────
    if (!centerSymbol) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
                <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm text-gray-500">Select a symbol to view its constellation</span>
                <span className="text-xs opacity-40">
                    press <kbd className="border border-gray-700 rounded px-1.5 py-0.5 bg-gray-800">Ctrl+P</kbd> to search
                </span>
            </div>
        );
    }

    return (
        <div className="h-full w-full" style={{ background: '#060d1a' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                fitView
                fitViewOptions={{ padding: 0.35 }}
                minZoom={0.05}
                maxZoom={4}
                zoomOnScroll
                panOnDrag
            >
                {/* Subtle dot-grid background */}
                <Background
                    color="#1e293b"
                    gap={28}
                    size={1.5}
                    variant={BackgroundVariant.Dots}
                />

                {/* Zoom / fit controls — bottom-left, larger and clear */}
                <Controls
                    showZoom={true}
                    showFitView={true}
                    showInteractive={false}
                />

                {/* Minimap for orientation on large expanded graphs */}
                <MiniMap
                    nodeColor={(node) => {
                        if (node.data?.nodeKind === 'center')  return '#3b82f6';
                        if (node.data?.nodeKind === 'caller')  return '#22c55e';
                        return '#a78bfa';
                    }}
                    maskColor="rgba(6,13,26,0.8)"
                    style={{
                        background: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '8px',
                    }}
                    nodeBorderRadius={4}
                />

                {/* Legend — top-right */}
                <Panel position="top-right">
                    <div className="graph-legend">
                        <div className="graph-legend-item">
                            <span className="graph-legend-dot" style={{ background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
                            <span>Callers</span>
                        </div>
                        <div className="graph-legend-item">
                            <span className="graph-legend-dot" style={{ background: '#3b82f6', boxShadow: '0 0 6px rgba(59,130,246,0.5)' }} />
                            <span>Selected</span>
                        </div>
                        <div className="graph-legend-item">
                            <span className="graph-legend-dot" style={{ background: '#a78bfa', boxShadow: '0 0 6px rgba(167,139,250,0.5)' }} />
                            <span>Callees</span>
                        </div>
                    </div>
                </Panel>
            </ReactFlow>
        </div>
    );
};

export default GraphView;
