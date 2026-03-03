import React, { useEffect, useState, useCallback, useRef } from 'react';
import ReactFlow, {
    Background,
    Node,
    Edge,
    Handle,
    Position,
    NodeProps,
    useNodesState,
    useEdgesState,
    useReactFlow,
    useViewport,
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
    expansionGroupId?: string; // ID of the node whose expand action created this node
    onToggle?: () => void;     // always up-to-date: expand if collapsed, collapse if expanded
}

// ─── Custom node component — must be defined outside GraphView ────────────────

const SymbolGraphNode: React.FC<NodeProps<SymbolNodeData>> = ({ data }) => {
    const isCenter = data.nodeKind === 'center';
    const isCaller = data.nodeKind === 'caller';

    return (
        <div style={{
            background: isCenter ? '#2563eb' : isCaller ? '#1e293b' : '#0f172a',
            border: isCenter ? '2px solid #3b82f6' : '1px solid #334155',
            borderRadius: isCenter ? '10px' : '5px',
            padding: '10px 12px',
            minWidth: '160px',
            maxWidth: '220px',
            position: 'relative',
            color: isCenter ? '#fff' : '#cbd5e1',
            boxShadow: isCenter ? '0 0 20px rgba(59,130,246,0.3)' : 'none',
        }}>
            <Handle
                type="target"
                position={Position.Top}
                style={{ background: '#475569', border: 'none', width: '8px', height: '8px' }}
            />

            {/* Function name */}
            <div style={{
                fontWeight: isCenter ? 700 : 500,
                fontSize: isCenter ? '13px' : '11px',
                wordBreak: 'break-all',
                lineHeight: '1.4',
                paddingRight: data.onToggle ? '22px' : '0',
                letterSpacing: isCenter ? '0.01em' : '0',
            }}>
                {data.label}
            </div>

            {/* Call site snippet */}
            {data.snippet && !isCenter && (
                <div style={{
                    fontSize: '10px',
                    color: '#64748b',
                    fontFamily: 'monospace',
                    marginTop: '5px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '185px',
                }} title={data.snippet}>
                    {data.snippet}
                </div>
            )}

            {/* Source file name */}
            {data.file && !isCenter && (
                <div style={{
                    fontSize: '9px',
                    color: '#475569',
                    marginTop: '3px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
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
                        top: '6px',
                        right: '6px',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: data.isExpanded ? '#450a0a' : '#1d4ed8',
                        border: `1px solid ${data.isExpanded ? '#ef4444' : '#3b82f6'}`,
                        color: data.isExpanded ? '#fca5a5' : '#fff',
                        fontSize: '14px',
                        lineHeight: '1',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        flexShrink: 0,
                    }}
                >
                    {data.isExpanded ? '−' : '+'}
                </button>
            )}

            <Handle
                type="source"
                position={Position.Bottom}
                style={{ background: '#475569', border: 'none', width: '8px', height: '8px' }}
            />
        </div>
    );
};

const nodeTypes = { symbolNode: SymbolGraphNode };

// ─── GraphView ────────────────────────────────────────────────────────────────

const GraphView: React.FC<GraphViewProps> = ({ centerSymbol, onNodeSelect }) => {
    const { setViewport, getNodes } = useReactFlow();
    const { x, y, zoom } = useViewport();

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    const [pendingExpand,   setPendingExpand]   = useState<{ nodeId: string; nodeName: string } | null>(null);
    const [pendingCollapse, setPendingCollapse] = useState<string | null>(null);

    // ── Node factory ──────────────────────────────────────────────────────────
    // setPendingExpand / setPendingCollapse are stable (from useState), so makeNode is stable.
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

    const makeEdge = (id: string, source: string, target: string, dim = false): Edge => ({
        id, source, target,
        animated: !dim,
        style: { stroke: dim ? '#1e293b' : '#475569', strokeWidth: dim ? 1 : 1.5 },
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

            newNodes.push(makeNode('center', centerSymbol.name, 'center', { x: 400, y: 280 }));

            const callerSpacing = Math.min(240, 1200 / Math.max(callers.length, 1));
            const callerStartX  = 400 - ((callers.length - 1) / 2) * callerSpacing;
            callers.forEach((c, idx) => {
                const id = `caller-${idx}`;
                newNodes.push(makeNode(id, c.caller, 'caller',
                    { x: callerStartX + idx * callerSpacing, y: 80 },
                    c.snippet, c.file,
                ));
                newEdges.push(makeEdge(`e-${id}-ctr`, id, 'center'));
            });

            const calleeSpacing = Math.min(240, 1200 / Math.max(callees.length, 1));
            const calleeStartX  = 400 - ((callees.length - 1) / 2) * calleeSpacing;
            callees.forEach((callee, idx) => {
                const id = `callee-${idx}`;
                newNodes.push(makeNode(id, callee, 'callee',
                    { x: calleeStartX + idx * calleeSpacing, y: 480 },
                ));
                newEdges.push(makeEdge(`e-ctr-${id}`, 'center', id));
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

            const callerSpacing = Math.min(220, 1000 / Math.max(callers.length, 1));
            callers.forEach((c, idx) => {
                if (existingLabels.has(c.caller)) return;
                existingLabels.add(c.caller);
                const id = `exp-${nodeId}-cal-${idx}`;
                // Pass nodeId as expansionGroupId so collapse can find these nodes
                addedNodes.push(makeNode(id, c.caller, 'caller',
                    { x: pos.x + (idx - callers.length / 2) * callerSpacing, y: pos.y - 160 },
                    c.snippet, c.file, nodeId,
                ));
                addedEdges.push(makeEdge(`ee-${id}-${nodeId}`, id, nodeId, true));
            });

            const calleeSpacing = Math.min(220, 1000 / Math.max(callees.length, 1));
            callees.forEach((callee, idx) => {
                if (existingLabels.has(callee)) return;
                existingLabels.add(callee);
                const id = `exp-${nodeId}-cle-${idx}`;
                addedNodes.push(makeNode(id, callee, 'callee',
                    { x: pos.x + (idx - callees.length / 2) * calleeSpacing, y: pos.y + 160 },
                    undefined, undefined, nodeId,
                ));
                addedEdges.push(makeEdge(`ee-${nodeId}-${id}`, nodeId, id, true));
            });

            setNodes(prev => [
                ...prev.map(n => n.id === nodeId
                    ? {
                        ...n,
                        data: {
                            ...n.data,
                            isExpanded: true,
                            // Switch toggle to collapse handler
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
                            // Switch toggle back to expand handler
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

    // ── Viewport slider handlers ──────────────────────────────────────────────
    const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) =>
        setViewport({ x, y, zoom: parseFloat(e.target.value) });
    const handlePanXChange = (e: React.ChangeEvent<HTMLInputElement>) =>
        setViewport({ x: parseFloat(e.target.value), y, zoom });
    const handlePanYChange = (e: React.ChangeEvent<HTMLInputElement>) =>
        setViewport({ x, y: parseFloat(e.target.value), zoom });

    if (!centerSymbol) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
                <svg className="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm">Select a symbol to view its constellation</span>
                <span className="text-xs opacity-50">or press <kbd className="border border-gray-700 rounded px-1">Ctrl+P</kbd> to search</span>
            </div>
        );
    }

    return (
        <div className="h-full w-full bg-gray-950 flex flex-col graph-viewport-container">
            <div className="flex-1 flex graph-main-area">
                <div className="flex-1 relative graph-flow-wrapper">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={nodeTypes}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onNodeClick={handleNodeClick}
                        fitView
                        fitViewOptions={{ padding: 0.3 }}
                        minZoom={0.05}
                        maxZoom={4}
                        zoomOnScroll
                        panOnScroll
                    >
                        <Background color="#1f2937" gap={20} size={1} />
                    </ReactFlow>

                    <div className="zoom-corner-control">
                        <input
                            type="range" min="0.05" max="4" step="0.05"
                            value={zoom} onChange={handleZoomChange}
                            className="edge-slider-input" style={{ width: '60px' }}
                        />
                    </div>
                </div>

                <div className="edge-slider-v">
                    <input
                        type="range" min="-2000" max="2000" step="10"
                        value={y} onChange={handlePanYChange}
                        className="edge-slider-input edge-slider-input-v"
                    />
                </div>
            </div>

            <div className="edge-slider-h">
                <input
                    type="range" min="-2000" max="2000" step="10"
                    value={x} onChange={handlePanXChange}
                    className="edge-slider-input"
                />
            </div>
        </div>
    );
};

export default GraphView;
