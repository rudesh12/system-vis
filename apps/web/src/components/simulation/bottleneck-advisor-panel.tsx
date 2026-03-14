'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { useSimulationStore } from '@/stores/simulation-store';
import { useArchitectureStore } from '@/stores/architecture-store';
import type { AIBottleneckAnalysisResponse } from '@system-vis/shared';

export function BottleneckAdvisorPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIBottleneckAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { bottlenecks, globalMetrics, componentMetrics, nodeLabels, status } = useSimulationStore();
  const { nodes, edges, loadArchitecture } = useArchitectureStore();

  const canAnalyze = bottlenecks.length > 0 && (status === 'running' || status === 'completed');

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const architecture = {
        id: 'current',
        name: 'Current Architecture',
        nodes,
        edges,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const res = await fetch('/api/ai/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          architecture,
          bottlenecks,
          globalMetrics,
          componentMetrics,
          nodeLabels,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Request failed');
      }

      const data: AIBottleneckAnalysisResponse = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!result?.optimizedArchitecture) return;
    loadArchitecture(
      result.optimizedArchitecture.nodes as Parameters<typeof loadArchitecture>[0],
      result.optimizedArchitecture.edges as Parameters<typeof loadArchitecture>[1],
      result.optimizedArchitecture.name
    );
    setOpen(false);
  };

  const handleApplyAndArchitect = () => {
    handleApply();
    router.push('/architect');
  };

  const priorityColors: Record<string, string> = {
    critical: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 border-red-200 dark:border-red-800',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200 border-orange-200 dark:border-orange-800',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200 border-yellow-200 dark:border-yellow-800',
  };

  const priorityBadgeColors: Record<string, string> = {
    critical: 'bg-red-500 text-white',
    high: 'bg-orange-500 text-white',
    medium: 'bg-yellow-500 text-black',
  };

  if (!canAnalyze) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950"
          />
        }
      >
        AI Optimize
      </SheetTrigger>
      <SheetContent className="w-[460px] sm:w-[580px]">
        <SheetHeader>
          <SheetTitle>AI Bottleneck Advisor</SheetTitle>
          <SheetDescription>
            AI will analyze simulation bottlenecks and suggest an optimized architecture.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 mt-4 space-y-4">
          {/* Current bottleneck summary */}
          <div className="rounded-lg border bg-muted/50 p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Detected Issues ({bottlenecks.length})
            </div>
            <div className="space-y-1">
              {bottlenecks.slice(0, 5).map((b) => (
                <div key={`${b.nodeId}-${b.metric}`} className="text-xs flex items-center gap-2">
                  <span>{b.severity === 'critical' ? '🔴' : '🟡'}</span>
                  <span className="font-medium">{nodeLabels[b.nodeId] || b.nodeId}:</span>
                  <span className="text-muted-foreground">{b.reason}</span>
                </div>
              ))}
              {bottlenecks.length > 5 && (
                <div className="text-xs text-muted-foreground">
                  +{bottlenecks.length - 5} more...
                </div>
              )}
            </div>
          </div>

          {!result && (
            <Button
              className="w-full"
              onClick={handleAnalyze}
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Analyzing bottlenecks...
                </span>
              ) : (
                'Analyze & Generate Optimized Architecture'
              )}
            </Button>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-200">
              <div className="font-semibold mb-1">Error</div>
              {error}
            </div>
          )}

          {result && (
            <ScrollArea className="h-[calc(100vh-380px)]">
              <div className="space-y-4">
                {/* Summary */}
                <div>
                  <div className="text-sm font-semibold mb-1">Analysis Summary</div>
                  <p className="text-sm text-muted-foreground">{result.summary}</p>
                </div>

                <Separator />

                {/* Insights */}
                <div>
                  <div className="text-sm font-semibold mb-2">
                    Bottleneck Insights ({result.insights.length})
                  </div>
                  <div className="space-y-2">
                    {result.insights.map((insight, i) => (
                      <Card
                        key={i}
                        className={`border ${priorityColors[insight.priority] || ''}`}
                      >
                        <CardContent className="p-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{insight.nodeName}</span>
                            <Badge className={`text-[10px] ${priorityBadgeColors[insight.priority] || ''}`}>
                              {insight.priority}
                            </Badge>
                          </div>
                          <div className="text-xs">
                            <span className="font-medium">Issue: </span>
                            <span className="text-muted-foreground">{insight.issue}</span>
                          </div>
                          <div className="text-xs">
                            <span className="font-medium">Root Cause: </span>
                            <span className="text-muted-foreground">{insight.rootCause}</span>
                          </div>
                          <div className="text-xs">
                            <span className="font-medium text-green-700 dark:text-green-400">Fix: </span>
                            <span className="text-muted-foreground">{insight.suggestion}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Changes */}
                {result.changes.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold mb-2">Changes Made</div>
                    <div className="space-y-1">
                      {result.changes.map((change, i) => (
                        <div key={i} className="text-xs flex gap-2">
                          <span className="text-green-600 dark:text-green-400 shrink-0">✓</span>
                          <span className="text-muted-foreground">{change}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Optimized arch summary */}
                <div className="rounded-lg border bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 p-3">
                  <div className="text-xs font-medium text-green-800 dark:text-green-200 mb-1">
                    Optimized Architecture
                  </div>
                  <div className="text-xs text-green-700 dark:text-green-300">
                    {result.optimizedArchitecture.nodes.length} nodes, {result.optimizedArchitecture.edges.length} connections
                  </div>
                </div>

                <Separator />

                {/* Actions */}
                <div className="space-y-2">
                  <Button className="w-full" onClick={handleApply}>
                    Apply Optimized Architecture
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={handleApplyAndArchitect}
                  >
                    Apply & Edit in Architect
                  </Button>
                  <Button
                    className="w-full"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setResult(null);
                      setError(null);
                    }}
                  >
                    Re-analyze
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
