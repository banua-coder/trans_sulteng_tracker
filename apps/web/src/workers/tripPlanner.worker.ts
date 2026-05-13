/**
 * Trip planner worker — runs graph build + Dijkstra off the main
 * thread so the UI stays smooth even when the user is dragging the
 * map while a plan is recomputing.
 */
import { buildGraph, planTrip, type Graph, type LatLng } from '@/lib/tripPlanner'
import type { BrtCorridor, BrtHalte } from '@/types/brt'

type Request =
  | { id: number; type: 'buildGraph'; corridors: BrtCorridor[]; halteByLeg: BrtHalte[][]; allHalte: BrtHalte[] }
  | { id: number; type: 'plan'; origin: LatLng; dest: LatLng; k?: number }

let graph: Graph | null = null

self.onmessage = (event: MessageEvent<Request>) => {
  const msg = event.data
  try {
    switch (msg.type) {
      case 'buildGraph': {
        graph = buildGraph(msg.corridors, msg.halteByLeg, msg.allHalte)
        ;(self as unknown as Worker).postMessage({
          id: msg.id,
          type: 'graphReady',
          nodeCount: graph.nodes.size,
          edgeCount: [...graph.adj.values()].reduce((n, l) => n + l.length, 0),
        })
        return
      }
      case 'plan': {
        if (!graph) {
          ;(self as unknown as Worker).postMessage({
            id: msg.id,
            type: 'error',
            message: 'graph not built',
          })
          return
        }
        const paths = planTrip(graph, msg.origin, msg.dest, msg.k ?? 5)
        ;(self as unknown as Worker).postMessage({
          id: msg.id,
          type: 'plan',
          paths,
        })
        return
      }
    }
  } catch (err) {
    ;(self as unknown as Worker).postMessage({
      id: msg.id,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
