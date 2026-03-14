import {
  ArchNodeType,
  NODE_DEFAULTS,
  NODE_LABELS,
  NODE_TOOLTIPS,
  type ArchEdge,
  type ArchEdgeData,
  type ArchNode,
  type ArchNodeData,
  type Architecture,
} from '@system-vis/shared';

type TerraformResource = {
  id: string;
  type: string;
  name: string;
  body: string;
};

type TerraformImportResult = Pick<Architecture, 'name' | 'nodes' | 'edges'>;

type NodeLane = 'edge' | 'routing' | 'service' | 'state';

const LANE_Y: Record<NodeLane, number> = {
  edge: 40,
  routing: 210,
  service: 380,
  state: 560,
};

const LANE_X_START = 120;
const LANE_X_GAP = 240;

const RESOURCE_PREFIX_TO_NODE_TYPE: Array<[string, ArchNodeType]> = [
  ['aws_cloudfront_distribution', ArchNodeType.CDN],
  ['aws_apigatewayv2_api', ArchNodeType.API_GATEWAY],
  ['aws_api_gateway_rest_api', ArchNodeType.API_GATEWAY],
  ['aws_lb', ArchNodeType.LOAD_BALANCER],
  ['aws_alb', ArchNodeType.LOAD_BALANCER],
  ['aws_ecs_service', ArchNodeType.CUSTOM_SERVICE],
  ['aws_ecs_task_definition', ArchNodeType.CUSTOM_SERVICE],
  ['aws_lambda_function', ArchNodeType.CUSTOM_SERVICE],
  ['aws_ecs_cluster', ArchNodeType.CUSTOM_SERVICE],
  ['aws_db_instance', ArchNodeType.DATABASE],
  ['aws_rds_cluster', ArchNodeType.DATABASE],
  ['aws_docdb_cluster', ArchNodeType.DATABASE],
  ['aws_elasticache_replication_group', ArchNodeType.CACHE],
  ['aws_elasticache_cluster', ArchNodeType.CACHE],
  ['aws_msk_cluster', ArchNodeType.QUEUE],
  ['aws_sqs_queue', ArchNodeType.QUEUE],
  ['aws_opensearch_domain', ArchNodeType.SEARCH_ENGINE],
  ['aws_elasticsearch_domain', ArchNodeType.SEARCH_ENGINE],
  ['aws_kinesis_analytics_application', ArchNodeType.STREAM_PROCESSOR],
  ['aws_sagemaker_endpoint', ArchNodeType.ML_MODEL_SERVICE],
  ['aws_sns_topic', ArchNodeType.NOTIFICATION_SERVICE],
  ['aws_ses_domain_identity', ArchNodeType.NOTIFICATION_SERVICE],
  ['aws_glue_job', ArchNodeType.ANALYTICS_SERVICE],
  ['aws_athena_workgroup', ArchNodeType.ANALYTICS_SERVICE],
  ['aws_dynamodb_table', ArchNodeType.REAL_TIME_DB],
  ['aws_appsync_graphql_api', ArchNodeType.REAL_TIME_DB],
  ['aws_amplify_app', ArchNodeType.FRONTEND],
  ['aws_s3_bucket', ArchNodeType.FRONTEND],
  ['aws_cognito_user_pool', ArchNodeType.AUTH_SERVICE],
];

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
}

function titleCaseFromSnake(value: string): string {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function inferNodeType(resource: TerraformResource): ArchNodeType {
  for (const [prefix, nodeType] of RESOURCE_PREFIX_TO_NODE_TYPE) {
    if (resource.type === prefix || resource.type.startsWith(`${prefix}_`)) {
      return nodeType;
    }
  }

  const nameHint = resource.name.toLowerCase();
  if (nameHint.includes('cache') || nameHint.includes('redis')) return ArchNodeType.CACHE;
  if (nameHint.includes('queue') || nameHint.includes('kafka') || nameHint.includes('mq')) {
    return ArchNodeType.QUEUE;
  }
  if (nameHint.includes('search') || nameHint.includes('index')) return ArchNodeType.SEARCH_ENGINE;
  if (nameHint.includes('notif') || nameHint.includes('email') || nameHint.includes('push')) {
    return ArchNodeType.NOTIFICATION_SERVICE;
  }

  return ArchNodeType.CUSTOM_SERVICE;
}

function inferLane(nodeType: ArchNodeType): NodeLane {
  switch (nodeType) {
    case ArchNodeType.FRONTEND:
    case ArchNodeType.CDN:
      return 'edge';
    case ArchNodeType.API_GATEWAY:
    case ArchNodeType.LOAD_BALANCER:
      return 'routing';
    case ArchNodeType.DATABASE:
    case ArchNodeType.CACHE:
    case ArchNodeType.QUEUE:
    case ArchNodeType.REAL_TIME_DB:
      return 'state';
    default:
      return 'service';
  }
}

function inferProtocol(targetType: ArchNodeType): ArchEdgeData['protocol'] {
  switch (targetType) {
    case ArchNodeType.QUEUE:
      return 'kafka';
    case ArchNodeType.WEBSOCKET_SERVER:
      return 'websocket';
    case ArchNodeType.DATABASE:
    case ArchNodeType.CACHE:
    case ArchNodeType.REAL_TIME_DB:
      return 'tcp';
    default:
      return 'http';
  }
}

function inferDatabaseType(resourceType: string): 'postgresql' | 'mysql' | 'mongodb' | 'dynamodb' {
  if (resourceType.includes('dynamodb')) return 'dynamodb';
  if (resourceType.includes('docdb') || resourceType.includes('mongo')) return 'mongodb';
  if (resourceType.includes('mysql')) return 'mysql';
  return 'postgresql';
}

function inferCacheType(resourceType: string): 'redis' | 'memcached' {
  if (resourceType.includes('memcached')) return 'memcached';
  return 'redis';
}

function inferQueueType(resourceType: string): 'kafka' | 'rabbitmq' | 'sqs' {
  if (resourceType.includes('sqs')) return 'sqs';
  if (resourceType.includes('rabbit')) return 'rabbitmq';
  return 'kafka';
}

function buildNodeData(resource: TerraformResource, nodeType: ArchNodeType): ArchNodeData {
  const defaults = { ...NODE_DEFAULTS[nodeType] } as Record<string, unknown>;
  const labelPrefix = NODE_LABELS[nodeType];
  const label = `${labelPrefix}: ${titleCaseFromSnake(resource.name)}`;

  defaults.nodeType = nodeType;
  defaults.label = label;
  defaults.healthStatus = 'healthy';
  defaults.tooltip = `${NODE_TOOLTIPS[nodeType]}\nTerraform source: ${resource.type}.${resource.name}`;

  if (nodeType === ArchNodeType.DATABASE) {
    defaults.dbType = inferDatabaseType(resource.type);
  }
  if (nodeType === ArchNodeType.CACHE) {
    defaults.cacheType = inferCacheType(resource.type);
  }
  if (nodeType === ArchNodeType.QUEUE) {
    defaults.queueType = inferQueueType(resource.type);
  }
  if (nodeType === ArchNodeType.REAL_TIME_DB && resource.type.includes('dynamodb')) {
    defaults.dbType = 'dynamodb';
  }

  return defaults as ArchNodeData;
}

function parseResourceBlocks(terraform: string): TerraformResource[] {
  const blocks: TerraformResource[] = [];
  const resourceStartPattern = /resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/g;

  let match: RegExpExecArray | null;
  while ((match = resourceStartPattern.exec(terraform)) !== null) {
    const type = match[1];
    const name = match[2];
    const openBraceIndex = resourceStartPattern.lastIndex - 1;

    let depth = 0;
    let inString = false;
    let escaped = false;
    let closeBraceIndex = -1;

    for (let i = openBraceIndex; i < terraform.length; i++) {
      const ch = terraform[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          closeBraceIndex = i;
          break;
        }
      }
    }

    if (closeBraceIndex === -1) {
      continue;
    }

    const body = terraform.slice(openBraceIndex + 1, closeBraceIndex);
    blocks.push({
      id: `${type}.${name}`,
      type,
      name,
      body,
    });

    resourceStartPattern.lastIndex = closeBraceIndex + 1;
  }

  return blocks;
}

function extractResourceReferences(body: string, knownResourceIds: Set<string>): string[] {
  const refs = new Set<string>();
  const refPattern = /\b([a-zA-Z][\w]*)\.([a-zA-Z][\w]*)\b/g;

  let match: RegExpExecArray | null;
  while ((match = refPattern.exec(body)) !== null) {
    const candidate = `${match[1]}.${match[2]}`;
    if (knownResourceIds.has(candidate)) {
      refs.add(candidate);
    }
  }

  return [...refs];
}

function buildFallbackEdges(nodes: ArchNode[]): ArchEdge[] {
  const byType = new Map<ArchNodeType, ArchNode[]>();
  for (const node of nodes) {
    const current = byType.get(node.data.nodeType) ?? [];
    current.push(node);
    byType.set(node.data.nodeType, current);
  }

  const fallbackChain: ArchNodeType[] = [
    ArchNodeType.FRONTEND,
    ArchNodeType.CDN,
    ArchNodeType.API_GATEWAY,
    ArchNodeType.LOAD_BALANCER,
    ArchNodeType.CUSTOM_SERVICE,
    ArchNodeType.DATABASE,
  ];

  const chainNodes = fallbackChain
    .map((type) => byType.get(type)?.[0])
    .filter((n): n is ArchNode => Boolean(n));

  const edges: ArchEdge[] = [];
  for (let i = 0; i < chainNodes.length - 1; i++) {
    const source = chainNodes[i];
    const target = chainNodes[i + 1];
    edges.push({
      id: `edge_${source.id}_${target.id}`,
      source: source.id,
      target: target.id,
      data: {
        protocol: inferProtocol(target.data.nodeType),
        bandwidthMbps: 1000,
        latencyOverheadMs: 2,
        encrypted: true,
      },
    });
  }

  return edges;
}

function deriveArchitectureName(fileName?: string): string {
  if (!fileName) return 'Terraform Import';
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  const title = titleCaseFromSnake(withoutExt);
  return title.length > 0 ? `Terraform: ${title}` : 'Terraform Import';
}

export function parseTerraformArchitecture(terraform: string, fileName?: string): TerraformImportResult {
  const resources = parseResourceBlocks(terraform);
  if (resources.length === 0) {
    throw new Error('No Terraform resources were found. Upload a .tf file with one or more resource blocks.');
  }

  const laneCounts: Record<NodeLane, number> = {
    edge: 0,
    routing: 0,
    service: 0,
    state: 0,
  };

  const resourceToNodeId = new Map<string, string>();
  const nodes: ArchNode[] = resources.map((resource, index) => {
    const nodeType = inferNodeType(resource);
    const lane = inferLane(nodeType);
    const laneIndex = laneCounts[lane]++;

    const nodeId = `tf_${sanitizeId(resource.name)}_${index + 1}`;
    resourceToNodeId.set(resource.id, nodeId);

    return {
      id: nodeId,
      type: nodeType,
      position: {
        x: LANE_X_START + laneIndex * LANE_X_GAP,
        y: LANE_Y[lane],
      },
      data: buildNodeData(resource, nodeType),
    };
  });

  const knownResourceIds = new Set(resources.map((resource) => resource.id));
  const edgeDedup = new Set<string>();
  const edges: ArchEdge[] = [];

  for (const resource of resources) {
    const sourceNodeId = resourceToNodeId.get(resource.id);
    if (!sourceNodeId) continue;

    const references = extractResourceReferences(resource.body, knownResourceIds);
    for (const ref of references) {
      if (ref === resource.id) continue;

      const targetNodeId = resourceToNodeId.get(ref);
      if (!targetNodeId) continue;

      const dedupKey = `${sourceNodeId}->${targetNodeId}`;
      if (edgeDedup.has(dedupKey)) continue;
      edgeDedup.add(dedupKey);

      const targetNode = nodes.find((node) => node.id === targetNodeId);
      const targetType = targetNode?.data.nodeType ?? ArchNodeType.CUSTOM_SERVICE;

      edges.push({
        id: `edge_${sourceNodeId}_${targetNodeId}`,
        source: sourceNodeId,
        target: targetNodeId,
        data: {
          protocol: inferProtocol(targetType),
          bandwidthMbps: 1000,
          latencyOverheadMs: 2,
          encrypted: true,
        },
      });
    }
  }

  const finalEdges = edges.length > 0 ? edges : buildFallbackEdges(nodes);

  return {
    name: deriveArchitectureName(fileName),
    nodes,
    edges: finalEdges,
  };
}
