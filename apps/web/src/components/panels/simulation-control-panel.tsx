'use client';

import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useSimulationStore } from '@/stores/simulation-store';
import { useArchitectureStore } from '@/stores/architecture-store';
import { SIMULATION_PRESETS } from '@system-vis/shared';
import { getSocket } from '@/lib/socket';
import { BottleneckAdvisorPanel } from '@/components/simulation/bottleneck-advisor-panel';
import {
  SCENARIO_INJECTORS,
  type ScenarioInjectorId,
  applyScenarioInjector,
  previewScenarioInjectorImpact,
} from '@/lib/scenario-injectors';
import type { ArchEdgeData, ArchNodeData } from '@system-vis/shared';
import type { Edge, Node } from '@xyflow/react';

interface ScenarioSnapshot {
  nodes: Node<ArchNodeData>[];
  edges: Edge<ArchEdgeData>[];
  architectureName: string;
}

function cloneScenarioSnapshot(
  nodes: Node<ArchNodeData>[],
  edges: Edge<ArchEdgeData>[],
  architectureName: string
): ScenarioSnapshot {
  return {
    nodes: nodes.map((node) => ({
      ...node,
      data: { ...(node.data as Record<string, unknown>) } as ArchNodeData,
    })),
    edges: edges.map((edge) => ({
      ...edge,
      data: { ...(edge.data as Record<string, unknown>) } as ArchEdgeData,
    })),
    architectureName,
  };
}

export function SimulationControlPanel() {
  const {
    status,
    currentTimeSec,
    globalMetrics,
    bottlenecks,
    setStatus,
    setTrafficPattern,
    applyTick,
    reset,
    setSimulationId,
    setNodeLabels,
  } = useSimulationStore();
  const {
    nodes,
    edges,
    getNodeLabels,
    loadArchitecture,
    architectureName,
  } = useArchitectureStore();

  const [internalTrafficEnabled, setInternalTrafficEnabled] = useState(false);
  const [internalTrafficRPS, setInternalTrafficRPS] = useState(1000);
  const [internalTrafficPattern, setInternalTrafficPattern] = useState('wave');

  const [selectedScenario, setSelectedScenario] = useState<ScenarioInjectorId>('retry_storm');
  const [scenarioSummary, setScenarioSummary] = useState<string | null>(null);
  const [scenarioSnapshot, setScenarioSnapshot] = useState<ScenarioSnapshot | null>(null);

  const handlePresetChange = useCallback((value: string | null) => {
    if (!value) return;
    const preset = SIMULATION_PRESETS.find((p) => p.name === value);
    if (preset) {
      setTrafficPattern(preset.trafficPattern);
    }
  }, [setTrafficPattern]);

  const buildLoadPattern = (patternType: string) => {
    switch (patternType) {
      case 'constant':
        return { type: 'constant', rps: internalTrafficRPS };
      case 'wave':
        return { type: 'wave', minRps: internalTrafficRPS * 0.1, maxRps: internalTrafficRPS, periodSec: 20 };
      case 'spike':
        return { type: 'spike', baseRps: internalTrafficRPS * 0.2, spikeRps: internalTrafficRPS, spikeStartSec: 15, spikeDurationSec: 20 };
      case 'ramp':
        return { type: 'ramp', startRps: internalTrafficRPS * 0.1, endRps: internalTrafficRPS, rampDurationSec: 30 };
      default:
        return { type: 'constant', rps: internalTrafficRPS };
    }
  };

  const handleStart = useCallback(() => {
    if (nodes.length === 0) return;

    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const baseConfig = {
      architectureId: 'current',
      trafficPattern: useSimulationStore.getState().trafficPattern,
      durationSec: 60,
      tickIntervalMs: 100,
      entryNodeId: nodes[0].id,
      requestScenario: 'default',
    };

    const config = internalTrafficEnabled
      ? {
          ...baseConfig,
          trafficGeneration: {
            internal: {
              enabled: true,
              entryPointRPS: internalTrafficRPS,
              loadPattern: buildLoadPattern(internalTrafficPattern),
            },
            external: {
              enabled: false,
            },
          },
        }
      : baseConfig;

    socket.emit('sim:start', {
      architecture: { id: 'current', name: 'Current', nodes, edges, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1 },
      config,
    });

    socket.on('sim:initialized', ({ simulationId }: { simulationId: string }) => {
      console.log('Simulation started', simulationId);
      setSimulationId(simulationId);
      setNodeLabels(getNodeLabels());
      setStatus('running');
    });

    socket.on('sim:tick', applyTick);

    socket.on('sim:completed', () => {
      setStatus('completed');
    });

    socket.on('sim:error', () => {
      setStatus('error');
    });

    setStatus('running');
  }, [
    nodes,
    edges,
    setStatus,
    applyTick,
    setSimulationId,
    setNodeLabels,
    getNodeLabels,
    internalTrafficEnabled,
    internalTrafficRPS,
    internalTrafficPattern,
  ]);

  const handleStop = useCallback(() => {
    const socket = getSocket();
    socket.emit('sim:stop', { simulationId: useSimulationStore.getState().simulationId });
    setStatus('idle');
    socket.off('sim:tick');
    socket.off('sim:completed');
    socket.off('sim:error');
  }, [setStatus]);

  const handleReset = useCallback(() => {
    handleStop();
    reset();
  }, [handleStop, reset]);

  const handleApplyScenario = useCallback(() => {
    if (nodes.length === 0) return;

    if (!scenarioSnapshot) {
      setScenarioSnapshot(cloneScenarioSnapshot(nodes, edges, architectureName));
    }

    const result = applyScenarioInjector(nodes, edges, selectedScenario);
    loadArchitecture(result.nodes, result.edges, architectureName);
    setScenarioSummary(result.summary);
  }, [nodes, edges, selectedScenario, loadArchitecture, architectureName, scenarioSnapshot]);

  const handleRevertScenario = useCallback(() => {
    if (!scenarioSnapshot) return;

    loadArchitecture(scenarioSnapshot.nodes, scenarioSnapshot.edges, scenarioSnapshot.architectureName);
    setScenarioSummary('Scenario changes reverted to the pre-injector snapshot.');
    setScenarioSnapshot(null);
  }, [scenarioSnapshot, loadArchitecture]);

  const scenarioPreview = useMemo(() => {
    if (nodes.length === 0) return null;
    return previewScenarioInjectorImpact(nodes, edges, selectedScenario);
  }, [nodes, edges, selectedScenario]);

  const statusColors: Record<string, string> = {
    idle: 'bg-muted text-muted-foreground',
    running: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-blue-100 text-blue-800',
    error: 'bg-red-100 text-red-800',
  };

  return (
    <div className="border-b bg-card p-3 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Select onValueChange={handlePresetChange} defaultValue="Moderate Load" disabled={internalTrafficEnabled}>
          <SelectTrigger className="w-48 h-8 text-sm">
            <SelectValue placeholder="Select traffic" />
          </SelectTrigger>
          <SelectContent>
            {SIMULATION_PRESETS.map((preset) => (
              <SelectItem key={preset.name} value={preset.name}>
                {preset.name} - {preset.description}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {status === 'idle' || status === 'completed' || status === 'error' ? (
          <Button size="sm" onClick={handleStart} disabled={nodes.length === 0}>
            Start Simulation
          </Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={handleStop}>
            Stop
          </Button>
        )}

        <Button size="sm" variant="outline" onClick={handleReset}>
          Reset
        </Button>

        <Badge className={statusColors[status]}>{status}</Badge>
      </div>

      <div className="border-t pt-3 flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={internalTrafficEnabled}
            onChange={(e) => setInternalTrafficEnabled(e.target.checked)}
            disabled={status === 'running'}
            className="w-4 h-4"
          />
          <span className="text-sm font-medium">Internal Traffic Generation</span>
        </label>

        {internalTrafficEnabled && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">RPS:</label>
              <input
                type="number"
                value={internalTrafficRPS}
                onChange={(e) => setInternalTrafficRPS(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={status === 'running'}
                className="w-16 h-8 px-2 text-xs border rounded"
                min="1"
                max="100000"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Pattern:</label>
              <Select value={internalTrafficPattern} onValueChange={(val: string | null) => {
                if (val) setInternalTrafficPattern(val);
              }} disabled={status === 'running'}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="constant">Constant</SelectItem>
                  <SelectItem value="wave">Wave</SelectItem>
                  <SelectItem value="spike">Spike</SelectItem>
                  <SelectItem value="ramp">Ramp</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>

      <div className="border-t pt-3 space-y-2">
        <div className="text-sm font-medium">Scenario Injectors</div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedScenario} onValueChange={(value) => setSelectedScenario(value as ScenarioInjectorId)}>
            <SelectTrigger className="w-64 h-8 text-sm">
              <SelectValue placeholder="Select scenario" />
            </SelectTrigger>
            <SelectContent>
              {SCENARIO_INJECTORS.map((scenario) => (
                <SelectItem key={scenario.id} value={scenario.id}>
                  {scenario.name} ({scenario.category})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button size="sm" variant="secondary" onClick={handleApplyScenario} disabled={nodes.length === 0}>
            Apply Scenario
          </Button>

          <Button size="sm" variant="outline" onClick={handleRevertScenario} disabled={!scenarioSnapshot}>
            Revert Scenario
          </Button>
        </div>

        {scenarioPreview && (
          <div className="rounded border bg-muted/20 p-2 text-xs text-muted-foreground space-y-1">
            <div>{scenarioPreview.summary}</div>
            <div>
              Estimated impact: {scenarioPreview.changedNodeCount} node(s), {scenarioPreview.changedEdgeCount} edge(s)
            </div>
            {scenarioPreview.changedNodeLabels.length > 0 && (
              <div>Nodes: {scenarioPreview.changedNodeLabels.join(', ')}</div>
            )}
            {scenarioPreview.changedEdgeLabels.length > 0 && (
              <div>Edges: {scenarioPreview.changedEdgeLabels.join(', ')}</div>
            )}
          </div>
        )}

        {scenarioSummary && (
          <div className="rounded border bg-muted/30 p-2 text-xs">
            {scenarioSummary}
          </div>
        )}
      </div>

      {status === 'running' && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Time: {currentTimeSec.toFixed(1)}s</span>
          <span>RPS: {globalMetrics.totalRPS.toLocaleString()}</span>
          <span>Latency: {globalMetrics.avgLatencyMs.toFixed(0)}ms</span>
          <span>Errors: {(globalMetrics.errorRate * 100).toFixed(1)}%</span>
          {bottlenecks.length > 0 && (
            <>
              <Badge variant="destructive">{bottlenecks.length} bottleneck{bottlenecks.length > 1 ? 's' : ''}</Badge>
              <BottleneckAdvisorPanel />
            </>
          )}
        </div>
      )}
    </div>
  );
}
