import React, { useEffect } from 'react';
import ReactFlow, {
    Background,
    Controls,
    Node,
    Edge,
    useNodesState,
    useEdgesState
} from 'reactflow';
import 'reactflow/dist/style.css';
import { SymbolNode } from '../types';

interface GraphViewProps {
    centerSymbol: SymbolNode | null;
    onNodeSelect: (symbolName: string) => void;
}

const GraphView: React.FC<GraphViewProps> = ({ centerSymbol, onNodeSelect: _onNodeSelect }) => {

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    useEffect(() => {
        if (!centerSymbol) {
            setNodes([]);
            setEdges([]);
            return;
        }

        const loadGraph = async () => {
            // Fetch callers
            const callers = await window.api.getCallers(centerSymbol.name);

            // Build graph elements
            const newNodes: Node[] = [];
            const newEdges: Edge[] = [];

            // Center Node
            newNodes.push({
                id: 'center',
                data: { label: centerSymbol.name + ' (Selected)' },
                position: { x: 300, y: 300 },
                style: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px' }
            });

            // Callers (Top)
            callers.forEach((caller, idx) => {
                newNodes.push({
                    id: `caller-${idx}`,
                    data: { label: caller.caller },
                    position: { x: 100 + (idx * 200), y: 100 },
                    style: { background: '#1f2937', color: '#ccc', border: '1px solid #374151' }
                });

                newEdges.push({
                    id: `e-caller-${idx}`,
                    source: `caller-${idx}`,
                    target: 'center',
                    animated: true
                });
            });

            setNodes(newNodes);
            setEdges(newEdges);
        };

        loadGraph();
    }, [centerSymbol]);

    if (!centerSymbol) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500">
                Select a function to view constellation
            </div>
        );
    }

    return (
        <div className="h-full w-full bg-gray-950">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
            >
                <Background color="#333" gap={16} />
                <Controls />
            </ReactFlow>
        </div>
    );
};

export default GraphView;
