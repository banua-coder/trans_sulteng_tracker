/**
 * Trip planner graph + shortest-path search.
 *
 * Nodes:  one per (kor, sh_id) pair — the same physical stop appears
 *         as multiple nodes when it's served by multiple corridors so
 *         we can express the cost of switching corridors at it.
 *
 * Edges:
 *   - ride        consecutive halte on the same (kor, leg). Weight =
 *                 distance / FALLBACK_AVG_SPEED_KMH (no schedule data).
 *   - transfer    two nodes at the same physical stop (within ~30 m)
 *                 but different kor. Weight = TRANSFER_WAIT_MIN.
 *   - walk        virtual start/dest nodes connected to halte within
 *                 WALK_RADIUS_M. Weight = distance / WALK_SPEED_KMH.
 *
 * Module is pure — no Vue/Pinia imports — so it can be loaded inside a
 * Web Worker without dragging the framework along.
 */
import type { BrtCorridor, BrtHalte } from '@/types/brt'
import { haversineMeters } from '@/lib/format'

export const WALK_SPEED_KMH = 5
export const RIDE_SPEED_KMH = 22
export const TRANSFER_WAIT_MIN = 5
/** How far the user is willing to walk from their origin point to
 *  reach a halte. Generous — the user is just looking for any bus. */
export const WALK_IN_RADIUS_M = 800
/** How far the user is willing to walk from a halte to their final
 *  destination. Deliberately tight so the algorithm has to actually
 *  ride the bus to the destination instead of dropping off early. */
export const WALK_OUT_RADIUS_M = 300
export const TRANSFER_RADIUS_M = 30
/** Synthetic-node bridge cap: a transfer-point node created via
 *  in_koridor expansion connects to the nearest real node on the
 *  same kor via a fake ride edge, but only if within this distance.
 *  Keeps the bridge realistic. */
export const SYNTH_BRIDGE_MAX_M = 2500

export interface LatLng { lat: number; lng: number }

export type NodeId = string  // `${kor}|${sh_id}` for halte nodes, '__start__' / '__dest__' for virtuals

export interface HalteNode {
  id: NodeId
  kor: string
  sh_id: string
  sh_name: string
  lat: number
  lng: number
}

export type EdgeKind = 'ride' | 'transfer' | 'walk'

export interface Edge {
  to: NodeId
  weight: number       // minutes
  distM: number        // metres covered by this edge
  kind: EdgeKind
}

export interface Graph {
  nodes: Map<NodeId, HalteNode>
  /** Adjacency list. Static edges only (ride + transfer). Walk edges
   *  are added per query in {@link planTrip}. */
  adj: Map<NodeId, Edge[]>
}

export interface PlanStep {
  kind: EdgeKind
  fromName: string
  toName: string
  kor?: string         // present for ride steps
  durationMin: number
  distM: number
}

export interface PlanResult {
  totalMin: number
  totalWalkM: number
  totalRideM: number
  steps: PlanStep[]
  /** Path through the graph; useful for the map preview. */
  nodes: NodeId[]
}

const STOP_DWELL_MIN = 0.25 // 15s typical halte dwell baked into each ride edge

/** Build the static graph (ride + transfer edges). Run once per city
 *  load + whenever per-leg halte data lands. Walk edges are added
 *  lazily inside {@link planTrip} because they depend on origin/dest.
 *
 *  Multi-corridor halte (in_koridor like 'K2A|K2B|K2C') often appear
 *  in the bulk feed under only ONE kor — so a naive build leaves
 *  K2B disconnected from K2A. We use in_koridor to synthesize
 *  transfer nodes for the missing kors at the same physical stop. */
export function buildGraph(
  corridors: BrtCorridor[],
  halteByLeg: BrtHalte[][],
  allHalte: BrtHalte[] = [],
): Graph {
  const nodes = new Map<NodeId, HalteNode>()
  const adj = new Map<NodeId, Edge[]>()
  /** sh_name → list of node ids at that physical stop. Powers
   *  cross-corridor transfer edges + synthetic-node placement. */
  const nodesByName = new Map<string, NodeId[]>()

  function addEdge(from: NodeId, edge: Edge) {
    let list = adj.get(from)
    if (!list) {
      list = []
      adj.set(from, list)
    }
    list.push(edge)
  }

  function addNode(kor: string, sh_id: string, sh_name: string, lat: number, lng: number): NodeId {
    const id: NodeId = `${kor}|${sh_id}`
    if (nodes.has(id)) return id
    nodes.set(id, { id, kor, sh_id, sh_name, lat, lng })
    const list = nodesByName.get(sh_name) ?? []
    list.push(id)
    nodesByName.set(sh_name, list)
    return id
  }

  // 1. Real nodes + ride edges from each leg's known halte order.
  for (const leg of halteByLeg) {
    for (let i = 0; i < leg.length; i++) {
      const h = leg[i]
      const lat = parseFloat(h.sh_lat)
      const lng = parseFloat(h.sh_lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      const id = addNode(h.kor, h.sh_id, h.sh_name, lat, lng)
      if (i > 0) {
        const prev = leg[i - 1]
        const prevId: NodeId = `${prev.kor}|${prev.sh_id}`
        if (!nodes.has(prevId)) continue
        const pLat = parseFloat(prev.sh_lat)
        const pLng = parseFloat(prev.sh_lng)
        if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) continue
        const distM = haversineMeters({ lat: pLat, lng: pLng }, { lat, lng })
        const rideMin = (distM / 1000) / RIDE_SPEED_KMH * 60 + STOP_DWELL_MIN
        addEdge(prevId, { to: id, weight: rideMin, distM, kind: 'ride' })
      }
    }
  }

  // 2. Synthesize transfer nodes from in_koridor expansion. For every
  //    bulk halte that lists multiple corridors, ensure a node exists
  //    at this physical stop for each listed kor. The sh_id stays
  //    unique by prefixing with `syn_` so we don't collide with real
  //    rows. Each synth node gets a single low-cost "bridge" ride
  //    edge to the nearest real node on the same kor — that's how it
  //    enters the corridor's ride sequence. Without the bridge the
  //    synth node would be an unreachable orphan.
  for (const h of allHalte) {
    if (!h.in_koridor) continue
    const kors = h.in_koridor.split('|').filter(Boolean)
    if (kors.length < 2) continue
    const lat = parseFloat(h.sh_lat)
    const lng = parseFloat(h.sh_lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    for (const kor of kors) {
      const namedAtKor = (nodesByName.get(h.sh_name) ?? []).some((id) => {
        return nodes.get(id)?.kor === kor
      })
      if (namedAtKor) continue
      addNode(kor, `syn_${kor}_${h.sh_id}`, h.sh_name, lat, lng)
    }
  }

  // 3. Bridge each synthetic node to its corridor's nearest real
  //    node via a ride edge. Distance from the bridge is metered so
  //    Dijkstra correctly accounts for the extra distance.
  for (const [, ids] of nodesByName) {
    for (const id of ids) {
      const n = nodes.get(id)
      if (!n || !n.sh_id.startsWith('syn_')) continue
      let best: { id: NodeId; dist: number } | null = null
      for (const [otherId, other] of nodes) {
        if (other.kor !== n.kor || other.sh_id.startsWith('syn_')) continue
        const dist = haversineMeters(n, other)
        if (!best || dist < best.dist) best = { id: otherId, dist }
      }
      if (!best || best.dist > SYNTH_BRIDGE_MAX_M) continue
      const rideMin = (best.dist / 1000) / RIDE_SPEED_KMH * 60 + STOP_DWELL_MIN
      addEdge(id, { to: best.id, weight: rideMin, distM: best.dist, kind: 'ride' })
      addEdge(best.id, { to: id, weight: rideMin, distM: best.dist, kind: 'ride' })
    }
  }

  // 4. Transfer edges between same-physical-stop nodes on different
  //    corridors. Use sh_name as the cross-corridor identifier (the
  //    bulk feed gives slightly different lat/lng per kor for the
  //    same stop, so a 30 m haversine cutoff misses real transfers).
  for (const [, ids] of nodesByName) {
    if (ids.length < 2) continue
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = nodes.get(ids[i])
        const b = nodes.get(ids[j])
        if (!a || !b || a.kor === b.kor) continue
        addEdge(ids[i], { to: ids[j], weight: TRANSFER_WAIT_MIN, distM: 0, kind: 'transfer' })
        addEdge(ids[j], { to: ids[i], weight: TRANSFER_WAIT_MIN, distM: 0, kind: 'transfer' })
      }
    }
  }

  void corridors

  return { nodes, adj }
}

/** Find candidate halte within `radiusM` of a point. Returns nodes
 *  sorted by walk distance ascending. */
function nearbyHalte(graph: Graph, point: LatLng, radiusM: number): { node: HalteNode; distM: number }[] {
  const out: { node: HalteNode; distM: number }[] = []
  for (const node of graph.nodes.values()) {
    const distM = haversineMeters(point, node)
    if (distM <= radiusM) out.push({ node, distM })
  }
  out.sort((a, b) => a.distM - b.distM)
  return out
}

/** Min-heap keyed on `weight`. Tiny — we never have more than a few
 *  hundred entries so a simple array + sort on insert is plenty. */
class MinHeap<T extends { weight: number }> {
  private a: T[] = []
  push(x: T) {
    this.a.push(x)
    // Bubble up
    let i = this.a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.a[p].weight <= this.a[i].weight) break
      ;[this.a[p], this.a[i]] = [this.a[i], this.a[p]]
      i = p
    }
  }
  pop(): T | undefined {
    if (!this.a.length) return undefined
    const top = this.a[0]
    const last = this.a.pop()!
    if (this.a.length) {
      this.a[0] = last
      // Bubble down
      let i = 0
      const n = this.a.length
      while (true) {
        const l = i * 2 + 1
        const r = l + 1
        let s = i
        if (l < n && this.a[l].weight < this.a[s].weight) s = l
        if (r < n && this.a[r].weight < this.a[s].weight) s = r
        if (s === i) break
        ;[this.a[s], this.a[i]] = [this.a[i], this.a[s]]
        i = s
      }
    }
    return top
  }
  get size(): number { return this.a.length }
}

interface ExpansionState {
  weight: number
  node: NodeId
  prev: NodeId | null
  edge: Edge | null
}

/** Single-source shortest path with virtual start + dest. Returns one
 *  best plan, or null if unreachable. */
function shortestPath(
  graph: Graph,
  origin: LatLng,
  dest: LatLng,
): PlanResult | null {
  const originHalte = nearbyHalte(graph, origin, WALK_IN_RADIUS_M)
  // Tighter walk-out radius — forces the algorithm to actually ride
  // the bus to (near) the destination instead of dropping off early
  // and walking 800 m.
  let destHalte = nearbyHalte(graph, dest, WALK_OUT_RADIUS_M)
  if (!destHalte.length) {
    // Fallback: if nothing within the tight radius, widen so the
    // user at least gets a route rather than 'no route'.
    destHalte = nearbyHalte(graph, dest, WALK_IN_RADIUS_M)
  }
  if (!originHalte.length || !destHalte.length) return null

  const START: NodeId = '__start__'
  const DEST: NodeId = '__dest__'

  // Walk edges from start
  const walkOut = new Map<NodeId, Edge>()
  for (const { node, distM } of originHalte) {
    walkOut.set(node.id, {
      to: node.id,
      weight: (distM / 1000) / WALK_SPEED_KMH * 60,
      distM,
      kind: 'walk',
    })
  }
  // Walk edges into dest
  const walkIn = new Map<NodeId, Edge>()
  for (const { node, distM } of destHalte) {
    walkIn.set(node.id, {
      to: DEST,
      weight: (distM / 1000) / WALK_SPEED_KMH * 60,
      distM,
      kind: 'walk',
    })
  }

  const dist = new Map<NodeId, number>()
  const prev = new Map<NodeId, { from: NodeId; edge: Edge }>()
  const heap = new MinHeap<ExpansionState>()

  dist.set(START, 0)
  heap.push({ weight: 0, node: START, prev: null, edge: null })

  while (heap.size) {
    const cur = heap.pop()!
    if (cur.node === DEST) break
    if (cur.weight !== dist.get(cur.node)) continue

    const outEdges: Edge[] = cur.node === START
      ? [...walkOut.values()]
      : (graph.adj.get(cur.node) ?? [])

    // The walk-into-dest edge applies to any halte node that's within
    // walking radius of the destination.
    if (cur.node !== START) {
      const w = walkIn.get(cur.node)
      if (w) outEdges.push(w)
    }

    for (const edge of outEdges) {
      const nextWeight = cur.weight + edge.weight
      const known = dist.get(edge.to)
      if (known != null && known <= nextWeight) continue
      dist.set(edge.to, nextWeight)
      prev.set(edge.to, { from: cur.node, edge })
      heap.push({ weight: nextWeight, node: edge.to, prev: cur.node, edge })
    }
  }

  if (!dist.has(DEST)) return null

  // Reconstruct path
  const reversed: { from: NodeId; to: NodeId; edge: Edge }[] = []
  let cursor: NodeId = DEST
  while (cursor !== START) {
    const back = prev.get(cursor)
    if (!back) return null
    reversed.push({ from: back.from, to: cursor, edge: back.edge })
    cursor = back.from
  }
  reversed.reverse()

  return collapseToSteps(graph, reversed, dist.get(DEST)!)
}

function nodeLabel(graph: Graph, id: NodeId): string {
  if (id === '__start__') return 'Lokasi Anda'
  if (id === '__dest__') return 'Tujuan'
  return graph.nodes.get(id)?.sh_name ?? id
}

/** Walk the reconstructed edge list and collapse consecutive 'ride'
 *  edges on the same corridor into a single step (so the itinerary
 *  reads "ride K1 from A to B (12 menit, 4 stops)" instead of one row
 *  per stop). Transfer + walk stays as-is. */
function collapseToSteps(
  graph: Graph,
  reversed: { from: NodeId; to: NodeId; edge: Edge }[],
  totalMin: number,
): PlanResult {
  const steps: PlanStep[] = []
  let totalWalkM = 0
  let totalRideM = 0
  const nodes: NodeId[] = []
  if (reversed.length) nodes.push(reversed[0].from)
  for (const r of reversed) nodes.push(r.to)

  let i = 0
  while (i < reversed.length) {
    const seg = reversed[i]
    if (seg.edge.kind === 'ride') {
      // Group all subsequent rides on the same corridor
      const kor = graph.nodes.get(seg.from)?.kor
      let j = i
      let distM = 0
      let durationMin = 0
      while (
        j < reversed.length &&
        reversed[j].edge.kind === 'ride' &&
        graph.nodes.get(reversed[j].from)?.kor === kor
      ) {
        distM += reversed[j].edge.distM
        durationMin += reversed[j].edge.weight
        j++
      }
      totalRideM += distM
      steps.push({
        kind: 'ride',
        fromName: nodeLabel(graph, seg.from),
        toName: nodeLabel(graph, reversed[j - 1].to),
        kor,
        durationMin,
        distM,
      })
      i = j
    } else {
      if (seg.edge.kind === 'walk') totalWalkM += seg.edge.distM
      steps.push({
        kind: seg.edge.kind,
        fromName: nodeLabel(graph, seg.from),
        toName: nodeLabel(graph, seg.to),
        durationMin: seg.edge.weight,
        distM: seg.edge.distM,
      })
      i++
    }
  }

  return { totalMin, totalWalkM, totalRideM, steps, nodes }
}

/** Top-K shortest distinct plans via a simplified Yen-style search:
 *  run shortestPath, then iteratively forbid one edge from each prior
 *  result and re-search. Good enough at our graph size — for 50 nodes
 *  and K ≤ 5 the total work is microseconds. */
export function planTrip(
  graph: Graph,
  origin: LatLng,
  dest: LatLng,
  k = 5,
): PlanResult[] {
  const out: PlanResult[] = []
  const forbidden = new Set<string>() // `${from}|${to}` keys

  for (let attempt = 0; attempt < k; attempt++) {
    const result = shortestPathWithForbidden(graph, origin, dest, forbidden)
    if (!result) break
    if (out.some((r) => sameRoute(r, result))) {
      // Add another forbidden edge and try again
      const firstRide = result.steps.find((s) => s.kind === 'ride')
      if (!firstRide || !firstRide.kor) break
      forbidden.add(`__ride__|${firstRide.kor}`)
      continue
    }
    out.push(result)
    // Forbid the corridor used on the longest ride to nudge diversity
    const longest = result.steps
      .filter((s) => s.kind === 'ride' && s.kor)
      .sort((a, b) => b.durationMin - a.durationMin)[0]
    if (longest?.kor) forbidden.add(`__ride__|${longest.kor}`)
  }

  out.sort((a, b) => a.totalMin - b.totalMin)
  return out
}

function sameRoute(a: PlanResult, b: PlanResult): boolean {
  if (a.nodes.length !== b.nodes.length) return false
  for (let i = 0; i < a.nodes.length; i++) {
    if (a.nodes[i] !== b.nodes[i]) return false
  }
  return true
}

function shortestPathWithForbidden(
  graph: Graph,
  origin: LatLng,
  dest: LatLng,
  forbidden: Set<string>,
): PlanResult | null {
  if (!forbidden.size) return shortestPath(graph, origin, dest)
  // Filter adjacency on the fly using a temporary view
  const filtered: Graph = {
    nodes: graph.nodes,
    adj: new Map(),
  }
  for (const [from, edges] of graph.adj) {
    const fromKor = graph.nodes.get(from)?.kor
    const kept = edges.filter((e) => {
      if (e.kind === 'ride' && fromKor && forbidden.has(`__ride__|${fromKor}`)) return false
      return true
    })
    filtered.adj.set(from, kept)
  }
  return shortestPath(filtered, origin, dest)
}
