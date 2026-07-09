import type { WikiGraph } from "../types";

type GraphViewProps = {
  graph: WikiGraph;
  selectedId?: string;
  onNodeClick: (nodeId: string, title: string, missing: boolean) => void;
};

const width = 920;
const height = 620;
const centerX = width / 2;
const centerY = height / 2;

export function GraphView({ graph, selectedId, onNodeClick }: GraphViewProps) {
  if (graph.nodes.length === 0) {
    return <div className="graph-empty">No graph data yet.</div>;
  }

  const radius = Math.min(250, Math.max(130, graph.nodes.length * 22));
  const positions = new Map<string, { x: number; y: number }>();

  graph.nodes.forEach((node, index) => {
    const angle = graph.nodes.length === 1 ? 0 : (Math.PI * 2 * index) / graph.nodes.length - Math.PI / 2;
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    });
  });

  return (
    <div className="graph-stage">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Page graph">
        <g className="graph-edges">
          {graph.edges.map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            return <line key={edge.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
          })}
        </g>
        <g className="graph-nodes">
          {graph.nodes.map((node) => {
            const position = positions.get(node.id)!;
            const active = selectedId === node.id;
            return (
              <g key={node.id} className={`${node.missing ? "missing" : ""} ${active ? "active" : ""}`} transform={`translate(${position.x} ${position.y})`}>
                <g className="graph-node-hit" role="button" tabIndex={0} onClick={() => onNodeClick(node.id, node.title, node.missing)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onNodeClick(node.id, node.title, node.missing); }} aria-label={node.title}>
                  <circle r={node.missing ? 24 : 30} />
                  <text y={5}>{shortTitle(node.title)}</text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function shortTitle(title: string) {
  return title.length > 18 ? `${title.slice(0, 17)}...` : title;
}
