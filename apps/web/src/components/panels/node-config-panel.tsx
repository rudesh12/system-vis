'use client';

import { useArchitectureStore } from '@/stores/architecture-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ArchNodeType } from '@system-vis/shared';
import type { ArchNodeData } from '@system-vis/shared';

const getSliderValue = (v: number | readonly number[]): number =>
  typeof v === 'number' ? v : v[0];

export function NodeConfigPanel() {
  const { nodes, selectedNodeId, updateNodeData, removeNode, setSelectedNodeId } = useArchitectureStore();
  const node = nodes.find((n) => n.id === selectedNodeId);

  if (!node) return null;

  const data = node.data as ArchNodeData;

  const updateField = (field: string, value: unknown) => {
    updateNodeData(node.id, { [field]: value } as Partial<ArchNodeData>);
  };

  const requestTimeoutMs = Number((data as { requestTimeoutMs?: number }).requestTimeoutMs ?? 1200);
  const retryCount = Number((data as { retryCount?: number }).retryCount ?? 2);
  const retryBackoffMs = Number((data as { retryBackoffMs?: number }).retryBackoffMs ?? 120);
  const retryBackoffStrategy =
    ((data as { retryBackoffStrategy?: 'fixed' | 'exponential' }).retryBackoffStrategy ?? 'exponential');

  return (
    <div className="w-72 h-full min-h-0 border-l bg-card flex flex-col">
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="font-semibold text-sm">Properties</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setSelectedNodeId(null)}
        >
          ✕
        </Button>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-4">
          {/* Label */}
          <div className="space-y-1.5">
            <Label className="text-xs">Label</Label>
            <Input
              value={data.label}
              onChange={(e) => updateField('label', e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <Separator />

          {/* Common Performance Fields */}
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground">Performance</div>

            <div className="space-y-1.5">
              <Label className="text-xs">Max RPS</Label>
              <Input
                type="number"
                value={data.maxRPS}
                onChange={(e) => updateField('maxRPS', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Base Latency (ms)</Label>
              <Input
                type="number"
                value={data.baseLatencyMs}
                onChange={(e) => updateField('baseLatencyMs', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Failure Rate: {(data.failureRate * 100).toFixed(1)}%</Label>
              <Slider
                value={[data.failureRate * 100]}
                onValueChange={(v) => updateField('failureRate', getSliderValue(v) / 100)}
                max={50}
                step={0.1}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Max Concurrent Requests</Label>
              <Input
                type="number"
                value={data.maxConcurrentRequests}
                onChange={(e) => updateField('maxConcurrentRequests', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <Separator />

          {/* Resilience Policy */}
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground">Resilience</div>

            <div className="space-y-1.5">
              <Label className="text-xs">Request Timeout (ms)</Label>
              <Input
                type="number"
                value={requestTimeoutMs}
                onChange={(e) => updateField('requestTimeoutMs', Number(e.target.value))}
                className="h-8 text-sm"
                min={1}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Retry Count</Label>
              <Input
                type="number"
                value={retryCount}
                onChange={(e) => updateField('retryCount', Number(e.target.value))}
                className="h-8 text-sm"
                min={0}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Retry Backoff (ms)</Label>
              <Input
                type="number"
                value={retryBackoffMs}
                onChange={(e) => updateField('retryBackoffMs', Number(e.target.value))}
                className="h-8 text-sm"
                min={1}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Retry Strategy</Label>
              <Select
                value={retryBackoffStrategy}
                onValueChange={(v) => updateField('retryBackoffStrategy', v)}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed</SelectItem>
                  <SelectItem value="exponential">Exponential</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Type-specific Fields */}
          {data.nodeType === ArchNodeType.DATABASE && (
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground">Database</div>
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select
                  value={(data as { dbType: string }).dbType}
                  onValueChange={(v) => updateField('dbType', v)}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="postgresql">PostgreSQL</SelectItem>
                    <SelectItem value="mysql">MySQL</SelectItem>
                    <SelectItem value="mongodb">MongoDB</SelectItem>
                    <SelectItem value="dynamodb">DynamoDB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max Connections</Label>
                <Input
                  type="number"
                  value={(data as { maxConnections: number }).maxConnections}
                  onChange={(e) => updateField('maxConnections', Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Read Replicas</Label>
                <Input
                  type="number"
                  value={(data as { readReplicas: number }).readReplicas}
                  onChange={(e) => updateField('readReplicas', Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          {data.nodeType === ArchNodeType.CACHE && (
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground">Cache</div>
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select
                  value={(data as { cacheType: string }).cacheType}
                  onValueChange={(v) => updateField('cacheType', v)}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="redis">Redis</SelectItem>
                    <SelectItem value="memcached">Memcached</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Hit Rate: {((data as { hitRate: number }).hitRate * 100).toFixed(0)}%</Label>
                <Slider
                  value={[(data as { hitRate: number }).hitRate * 100]}
                  onValueChange={(v) => updateField('hitRate', getSliderValue(v) / 100)}
                  max={100}
                  step={1}
                />
              </div>
            </div>
          )}

          {data.nodeType === ArchNodeType.QUEUE && (
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground">Queue</div>
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select
                  value={(data as { queueType: string }).queueType}
                  onValueChange={(v) => updateField('queueType', v)}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kafka">Kafka</SelectItem>
                    <SelectItem value="rabbitmq">RabbitMQ</SelectItem>
                    <SelectItem value="sqs">SQS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Consumer Count</Label>
                <Input
                  type="number"
                  value={(data as { consumerCount: number }).consumerCount}
                  onChange={(e) => updateField('consumerCount', Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max Queue Depth</Label>
                <Input
                  type="number"
                  value={(data as { maxQueueDepth: number }).maxQueueDepth}
                  onChange={(e) => updateField('maxQueueDepth', Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          {data.nodeType === ArchNodeType.LOAD_BALANCER && (
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground">Load Balancer</div>
              <div className="space-y-1.5">
                <Label className="text-xs">Algorithm</Label>
                <Select
                  value={(data as { algorithm: string }).algorithm}
                  onValueChange={(v) => updateField('algorithm', v)}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="round_robin">Round Robin</SelectItem>
                    <SelectItem value="least_connections">Least Connections</SelectItem>
                    <SelectItem value="ip_hash">IP Hash</SelectItem>
                    <SelectItem value="weighted">Weighted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {(data.nodeType === ArchNodeType.AUTH_SERVICE ||
            data.nodeType === ArchNodeType.ORDER_SERVICE ||
            data.nodeType === ArchNodeType.CUSTOM_SERVICE ||
            data.nodeType === ArchNodeType.FRONTEND) && (
              <div className="space-y-3">
                <div className="text-xs font-medium text-muted-foreground">Service</div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Instances</Label>
                  <Input
                    type="number"
                    value={(data as { instances: number }).instances}
                    onChange={(e) => updateField('instances', Number(e.target.value))}
                    className="h-8 text-sm"
                    min={1}
                  />
                </div>
              </div>
            )}

          {data.nodeType === ArchNodeType.API_GATEWAY && (
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground">Gateway</div>
              <div className="space-y-1.5">
                <Label className="text-xs">Rate Limit (RPS)</Label>
                <Input
                  type="number"
                  value={(data as { rateLimitRPS: number }).rateLimitRPS}
                  onChange={(e) => updateField('rateLimitRPS', Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          {data.nodeType === ArchNodeType.CDN && (
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground">CDN</div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cache Hit Rate: {((data as { cacheHitRate: number }).cacheHitRate * 100).toFixed(0)}%</Label>
                <Slider
                  value={[(data as { cacheHitRate: number }).cacheHitRate * 100]}
                  onValueChange={(v) => updateField('cacheHitRate', getSliderValue(v) / 100)}
                  max={100}
                  step={1}
                />
              </div>
            </div>
          )}

          <Separator />

          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => {
              removeNode(node.id);
              setSelectedNodeId(null);
            }}
          >
            Delete Component
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}

