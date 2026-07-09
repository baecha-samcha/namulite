import { PointerEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import type { CanvasBoard, CanvasNode, WikiPage } from "../types";

type CanvasViewProps = {
  pages: WikiPage[];
  selectedPage: WikiPage | null;
  onOpenPage: (pageId: string) => void;
};

type DragState = {
  nodeId: string;
  startX: number;
  startY: number;
  originalX: number;
  originalY: number;
};

export function CanvasView({ pages, selectedPage, onOpenPage }: CanvasViewProps) {
  const [boards, setBoards] = useState<CanvasBoard[]>([]);
  const [activeBoard, setActiveBoard] = useState<CanvasBoard | null>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void loadBoards();
  }, []);

  async function loadBoards() {
    try {
      const result = await api.listBoards();
      setBoards(result.boards);
      if (result.boards[0]) await openBoard(result.boards[0].id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load boards.");
    }
  }

  async function openBoard(boardId: string) {
    const result = await api.getBoard(boardId);
    setActiveBoard(result.board);
    setNodes(result.nodes);
  }

  async function createBoard() {
    const title = window.prompt("Board title", "New board");
    if (!title) return;
    const result = await api.createBoard({ title });
    setBoards((current) => [result.board, ...current]);
    await openBoard(result.board.id);
  }

  async function addTextNode() {
    if (!activeBoard) return;
    const result = await api.createCanvasNode(activeBoard.id, {
      type: "text",
      x: 80 + nodes.length * 24,
      y: 80 + nodes.length * 18,
      content: "Note"
    });
    setNodes((current) => [...current, result.node]);
  }

  async function addSelectedPageNode() {
    if (!activeBoard || !selectedPage) return;
    const result = await api.createCanvasNode(activeBoard.id, {
      type: "page",
      page_id: selectedPage.server_id ?? selectedPage.id,
      x: 110 + nodes.length * 24,
      y: 110 + nodes.length * 18,
      content: selectedPage.title
    });
    setNodes((current) => [...current, result.node]);
  }

  async function updateText(node: CanvasNode) {
    const content = window.prompt("Node text", node.content ?? "");
    if (content === null) return;
    const result = await api.updateCanvasNode(node.id, { content });
    setNodes((current) => current.map((item) => item.id === node.id ? result.node : item));
  }

  async function removeNode(nodeId: string) {
    await api.deleteCanvasNode(nodeId);
    setNodes((current) => current.filter((item) => item.id !== nodeId));
  }

  function startDrag(event: PointerEvent<HTMLDivElement>, node: CanvasNode) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ nodeId: node.id, startX: event.clientX, startY: event.clientY, originalX: node.x, originalY: node.y });
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const nextX = Math.max(0, drag.originalX + event.clientX - drag.startX);
    const nextY = Math.max(0, drag.originalY + event.clientY - drag.startY);
    setNodes((current) => current.map((node) => node.id === drag.nodeId ? { ...node, x: nextX, y: nextY } : node));
  }

  async function finishDrag() {
    if (!drag) return;
    const node = nodes.find((item) => item.id === drag.nodeId);
    setDrag(null);
    if (node) await api.updateCanvasNode(node.id, { x: node.x, y: node.y });
  }

  return (
    <section className="canvas-layout">
      <aside className="canvas-sidebar">
        <button className="primary-button full-width" type="button" onClick={() => void createBoard()}>New board</button>
        <div className="canvas-board-list">
          {boards.map((board) => (
            <button key={board.id} className={activeBoard?.id === board.id ? "active" : ""} type="button" onClick={() => void openBoard(board.id)}>
              {board.title}
            </button>
          ))}
          {boards.length === 0 && <p className="empty-state">No boards yet.</p>}
        </div>
      </aside>
      <section className="canvas-workspace">
        <header className="canvas-toolbar">
          <strong>{activeBoard?.title ?? "Canvas"}</strong>
          <button type="button" onClick={() => void addTextNode()} disabled={!activeBoard}>Add note</button>
          <button type="button" onClick={() => void addSelectedPageNode()} disabled={!activeBoard || !selectedPage}>Add page</button>
          <span>{status}</span>
        </header>
        <div className="canvas-board" onPointerMove={moveDrag} onPointerUp={() => void finishDrag()} onPointerCancel={() => void finishDrag()}>
          {nodes.map((node) => (
            <div
              key={node.id}
              className={`canvas-node ${node.type}`}
              style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
              onPointerDown={(event) => startDrag(event, node)}
            >
              <strong>{node.type === "page" ? node.title ?? node.content ?? "Page" : "Text"}</strong>
              <p>{node.type === "page" ? node.content : node.content}</p>
              <div className="canvas-node-actions">
                {node.page_id && <button type="button" onClick={(event) => { event.stopPropagation(); onOpenPage(node.page_id!); }}>Open</button>}
                <button type="button" onClick={(event) => { event.stopPropagation(); void updateText(node); }}>Edit</button>
                <button type="button" onClick={(event) => { event.stopPropagation(); void removeNode(node.id); }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
