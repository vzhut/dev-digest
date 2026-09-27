/** Per-symbol caller cap in the graph view — the tree already shows the full
    list, the graph exists to make the shape of the impact legible, not to
    dump every caller as a node. */
export const GRAPH_MAX_CALLERS_PER_SYMBOL = 5;

/** Hard cap on total nodes (symbols + callers + endpoints/crons) so a PR that
    touches many symbols still renders a diagram mermaid can lay out. */
export const GRAPH_MAX_NODES = 40;
