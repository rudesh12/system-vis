'use client';

import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NODE_LABELS, NODE_TOOLTIPS, type BaseNodeProps } from '@system-vis/shared';

interface BaseNodeComponentProps {
  data: BaseNodeProps;
  icon: React.ReactNode;
  color: string;
  children?: React.ReactNode;
}

const statusColors: Record<BaseNodeProps['healthStatus'], string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-yellow-500',
  saturated: 'bg-orange-500',
  partially_down: 'bg-amber-600',
  critical: 'bg-red-500',
  down: 'bg-gray-500',
};

export function BaseNode({ data, icon, color, children }: BaseNodeComponentProps) {
  const tooltipText =
    typeof data.tooltip === 'string' && data.tooltip.trim().length > 0
      ? data.tooltip
      : NODE_TOOLTIPS[data.nodeType];

  const tooltipTitle = NODE_LABELS[data.nodeType] ?? data.nodeType;

  return (
    <Tooltip>
      <TooltipTrigger>
        <div
          className={cn(
            'rounded-lg border-2 bg-card shadow-md min-w-[160px]',
            data.healthStatus === 'critical' && 'border-red-500 shadow-red-500/25',
            data.healthStatus === 'degraded' && 'border-yellow-500 shadow-yellow-500/25',
            data.healthStatus === 'saturated' && 'border-orange-500 shadow-orange-500/25',
            data.healthStatus === 'partially_down' && 'border-amber-600 shadow-amber-600/25',
            data.healthStatus === 'down' && 'border-gray-500 shadow-gray-500/20',
            data.healthStatus === 'healthy' && 'border-border'
          )}
        >
          <Handle type="target" position={Position.Top} className="!bg-primary !w-3 !h-3" />

          <div className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className={cn('p-1.5 rounded', color)}>{icon}</div>
              <div className="flex-1">
                <div className="font-medium text-sm leading-tight">{data.label}</div>
              </div>
              <div className={cn('w-2.5 h-2.5 rounded-full', statusColors[data.healthStatus])} />
            </div>
            {children && <div className="mt-2 text-xs text-muted-foreground">{children}</div>}
          </div>

          <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3" />
        </div>
      </TooltipTrigger>

      <TooltipContent side="right" className="max-w-sm">
        <div className="flex flex-col gap-1.5 whitespace-pre-line leading-snug">
          <div className="font-semibold">{tooltipTitle}</div>
          <div>{tooltipText}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
