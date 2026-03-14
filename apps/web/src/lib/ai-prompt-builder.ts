import { ArchNodeType, NODE_LABELS } from '@system-vis/shared';

// ---------------------------------------------------------------------------
// Scale detection
// ---------------------------------------------------------------------------

type ScaleTier = 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4';

function detectScaleTier(description: string): ScaleTier {
  const lower = description.toLowerCase();

  // Extract explicit numeric user/traffic count
  const match = lower.match(
    /(\d[\d,]*)\s*(k|m|million|thousand)?\s*(users|dau|mau|concurrent|rps|requests)/
  );

  let users = 0;

  if (match) {
    users = parseFloat(match[1].replace(/,/g, ''));
    const unit = match[2];
    if (unit === 'k' || unit === 'thousand') users *= 1_000;
    if (unit === 'm' || unit === 'million') users *= 1_000_000;
  }

  // Fallback: keyword hints when no explicit number is found
  if (!users) {
    if (/massive|planet.?scale|hyper.?scale|billions?/.test(lower)) users = 50_000_000;
    else if (/\b(1m|10m|50m|100m)\b/.test(lower)) users = 10_000_000;
    else if (/million|large.?scale|high.?traffic|global/.test(lower)) users = 1_000_000;
    else if (/hundred.?thousand|500k|enterprise|mid.?scale/.test(lower)) users = 500_000;
    else if (/startup|small|prototype|mvp|personal/.test(lower)) users = 5_000;
    else users = 50_000; // safe default
  }

  if (users < 10_000) return 'TIER_1';
  if (users < 500_000) return 'TIER_2';
  if (users < 5_000_000) return 'TIER_3';
  return 'TIER_4';
}

// ---------------------------------------------------------------------------
// Tier constraints injected into the prompt
// ---------------------------------------------------------------------------

const TIER_CONSTRAINTS: Record<ScaleTier, string> = {
  TIER_1: `
DETECTED SCALE: Small — fewer than 10K users, ~50–200 RPS peak.

TOPOLOGY RULES:
- INCLUDE: frontend, api_gateway, 1–2 business services (custom_service or auth_service), 1 database.
- OMIT: cdn, load_balancer, queue, cache, stream_processor, read replicas, ml_model_service.
- Keep the total node count between 4 and 6. Do not add nodes "just in case".

NUMERIC TARGETS (set these values on every relevant node):
- instances: 1–2 per service
- maxRPS: 100–500 per service
- database.readReplicas: 0
- database.maxConnections: 20–50
- autoScale: false
- failureRate: 0.001–0.005
- baseLatencyMs: 20–80

SCALING STRATEGY:
- estimatedCapacity: "~200 RPS"
- recommendations: scale vertically first; add a read replica before any horizontal scaling.

WARNINGS to emit:
- "Single point of failure on the database — no replica or failover configured"
- "No caching layer; all reads hit the database directly"
`,

  TIER_2: `
DETECTED SCALE: Medium — 10K–500K users, ~500–2,000 RPS peak.

TOPOLOGY RULES:
- INCLUDE: frontend, api_gateway, load_balancer, cache (Redis), 2–3 services, database with 1 read replica.
- OPTIONALLY INCLUDE: cdn (if the app serves static assets), queue (only if async workflows exist — emails, background jobs).
- OMIT: stream_processor, ml_model_service unless the feature set explicitly requires them.

NUMERIC TARGETS:
- instances: 2–4 per service
- maxRPS: 500–2,000 per service
- database.readReplicas: 1
- database.maxConnections: 50–150
- cache.hitRate: 0.65–0.75
- cache.maxMemoryMB: 512–2048
- autoScale: true, autoScaleThreshold: 0.70
- failureRate: 0.001
- baseLatencyMs: 15–60

SCALING STRATEGY:
- estimatedCapacity: "~2,000 RPS"
- recommendations: tune cache TTLs before scaling instances; move session storage to Redis.

WARNINGS to emit:
- "Cache invalidation strategy must be defined to avoid stale reads"
- "Database write path has no horizontal scaling — monitor write latency closely"
`,

  TIER_3: `
DETECTED SCALE: Large — 500K–5M users, ~2,000–20,000 RPS peak.

TOPOLOGY RULES:
- INCLUDE: frontend, cdn (cacheHitRate ≥ 0.85), api_gateway, load_balancer, cache (Redis cluster),
  queue (Kafka or SQS), 3–5 services, database with 2–3 read replicas.
- INCLUDE stream_processor if real-time analytics, event sourcing, or activity feeds are described.
- All services must have autoScale: true.

NUMERIC TARGETS:
- instances: 4–10 per service
- maxRPS: 2,000–10,000 per service
- database.readReplicas: 2–3
- database.maxConnections: 200–500
- cache.hitRate: 0.80–0.90
- cache.maxMemoryMB: 4096–16384
- queue.partitions: 8–16
- queue.consumerCount: 8–20
- autoScale: true, autoScaleThreshold: 0.65
- failureRate: 0.0005
- baseLatencyMs: 10–40

SCALING STRATEGY:
- estimatedCapacity: "~15,000 RPS"
- recommendations: introduce database read replicas before adding cache; use Kafka for event-driven decoupling.

WARNINGS to emit:
- "Database write throughput ceiling approaching — evaluate sharding or CQRS"
- "Multi-AZ deployment required for production resilience"
- "Cache stampede protection (mutex / probabilistic early expiry) needed at this hit rate"
`,

  TIER_4: `
DETECTED SCALE: Hyper-scale — 5M+ users, 20,000+ RPS peak.

TOPOLOGY RULES:
- INCLUDE: frontend, cdn (multi-region, cacheHitRate ≥ 0.92), api_gateway, load_balancer,
  cache (Redis cluster), queue (Kafka, high partition count), stream_processor,
  4–6 business services, database with 4–5 read replicas.
- INCLUDE ml_model_service if personalization, recommendations, or fraud detection are mentioned.
- INCLUDE analytics_service with a data warehouse (BigQuery / Redshift / Snowflake).
- All services must have autoScale: true.

NUMERIC TARGETS:
- instances: 10–50 per service
- maxRPS: 10,000–100,000 per service
- database.readReplicas: 4–5
- database.maxConnections: 500–2000
- cache.hitRate: 0.90–0.95
- cache.maxMemoryMB: 32768–131072
- queue.partitions: 32–64
- queue.consumerCount: 30–80
- cdn.regions: minimum 3 geographic regions
- autoScale: true, autoScaleThreshold: 0.60
- failureRate: 0.0002
- baseLatencyMs: 5–25

SCALING STRATEGY:
- estimatedCapacity: "50,000+ RPS"
- recommendations: adopt geo-distributed read replicas; implement database sharding with a consistent partition key.

WARNINGS to emit:
- "Global load balancing via Anycast / GeoDNS required — single-region will not meet SLA"
- "Database sharding is mandatory at this scale — define the partition key before data grows"
- "CAP theorem tradeoffs must be explicitly decided per service domain"
- "Chaos engineering and dependency SLA contracts are required at this scale"
`,
};

// ---------------------------------------------------------------------------
// Main prompt builder
// ---------------------------------------------------------------------------

export function buildArchitecturePrompt(description: string, constraints?: string): string {
  const nodeTypes = Object.values(ArchNodeType).join(', ');
  const tier = detectScaleTier(description);
  const tierBlock = TIER_CONSTRAINTS[tier];

  return `You are a system architecture expert. Design a complete system architecture based on the user's description.

OUTPUT FORMAT: You MUST respond with ONLY valid JSON matching this exact schema. No markdown, no explanation outside the JSON.

{
  "nodes": [
    {
      "id": "node_1",
      "type": "<one of: ${nodeTypes}>",
      "position": { "x": <number>, "y": <number> },
      "data": {
        "label": "<descriptive name>",
        "nodeType": "<same as type>",
        "maxRPS": <number>,
        "baseLatencyMs": <number>,
        "latencyStdDevMs": <number>,
        "failureRate": <number between 0 and 1>,
        "maxConcurrentRequests": <number>,
        "healthStatus": "healthy",
        "tooltip": "<short hover tooltip: what it is, primary use, and one key scaling concern>",
        ... <type-specific fields>,
        "requestResponseTemplate": {
          "requestTemplate": {
            "description": "<what kind of request this node receives>",
            "sample": { <realistic sample request JSON matching the node's purpose> },
            "fields": [
              { "name": "<field>", "type": "<string|number|boolean|object|array>", "description": "<what this field represents>" }
            ]
          },
          "responseTemplate": {
            "description": "<what kind of response this node returns>",
            "sample": { <realistic sample response JSON matching the node's purpose> },
            "fields": [
              { "name": "<field>", "type": "<string|number|boolean|object|array>", "description": "<what this field represents>" }
            ]
          }
        }
      }
    }
  ],
  "edges": [
    {
      "id": "edge_<source>_<target>",
      "source": "<source node id>",
      "target": "<target node id>",
      "data": {
        "protocol": "http",
        "bandwidthMbps": 1000,
        "latencyOverheadMs": 1,
        "encrypted": true
      }
    }
  ],
  "explanation": "<2-3 sentence explanation of the architecture, including the detected scale tier>",
  "scalingStrategy": {
    "recommendations": ["<recommendation 1>", "<recommendation 2>"],
    "estimatedCapacity": "<e.g., 10,000 RPS>"
  },
  "warnings": ["<potential issue 1>"]
}

TYPE-SPECIFIC DATA FIELDS:
- tooltip (hover): short string describing what the component is used for and one key scaling/reliability concern
- cdn: cacheHitRate (0-1), regions (string[])
- load_balancer: algorithm ("round_robin"|"least_connections"|"ip_hash"|"weighted"), healthCheckIntervalMs
- frontend, auth_service, order_service, custom_service: instances, cpuPerInstance, memoryPerInstanceMB, autoScale (bool), autoScaleThreshold
- api_gateway: rateLimitRPS, authEnabled (bool), corsEnabled (bool)
- database: dbType ("postgresql"|"mysql"|"mongodb"|"dynamodb"), maxConnections, readReplicas, avgQueryLatencyMs, connectionPoolSize
- cache: cacheType ("redis"|"memcached"), maxMemoryMB, hitRate (0-1), ttlSeconds, evictionPolicy ("lru"|"lfu"|"random")
- queue: queueType ("kafka"|"rabbitmq"|"sqs"), maxQueueDepth, consumerCount, consumerProcessingMs, partitions
- websocket_server: instances, cpuPerInstance, memoryPerInstanceMB, autoScale (bool), autoScaleThreshold, maxConnections
- search_engine: engineType ("elasticsearch"|"opensearch"|"solr"), maxMemoryMB, shardCount, replicaCount, indexingLatencyMs
- stream_processor: processorType ("kafka-streams"|"flink"|"spark"), instances, cpuPerInstance, memoryPerInstanceMB, autoScale (bool), autoScaleThreshold, processLatencyMs
- ml_model_service: instances, cpuPerInstance, memoryPerInstanceMB, autoScale (bool), autoScaleThreshold, gpuSupport (bool), inferenceLatencyMs
- payment_gateway: provider ("stripe"|"paypal"|"square"|"razorpay"), instances, cpuPerInstance, memoryPerInstanceMB, transactionLatencyMs
- notification_service: instances, cpuPerInstance, memoryPerInstanceMB, autoScale (bool), autoScaleThreshold, channels (["email"|"sms"|"push"|"webhook"])
- analytics_service: instances, cpuPerInstance, memoryPerInstanceMB, dataWarehouse ("bigquery"|"redshift"|"snowflake"), aggregationLatencyMs
- real_time_db: dbType ("firebase"|"dynamodb"|"supabase"), maxMemoryMB, maxConnections, replicationLatencyMs

POSITIONING: Layout nodes in a logical top-to-bottom flow. Start at y=0, increment y by 150 for each tier. Space nodes horizontally with x increments of 250, centered around x=400.

WHEN TO USE EACH NODE TYPE:
- frontend: User-facing clients (web, mobile, desktop)
- api_gateway: Entry point for all requests, handles auth & rate limiting
- load_balancer: Distribute traffic across multiple service instances
- cdn: Cache static assets & reduce latency for global users
- websocket_server: Real-time bidirectional communication (chat, live updates)
- search_engine: Full-text search on large datasets (products, messages, content)
- stream_processor: Process continuous event streams (analytics, logs, activity)
- database: Primary data storage (SQL/NoSQL based on use case)
- cache: In-memory caching (sessions, hot data, rate limit tracking)
- queue: Async job processing, event buffering (Kafka, RabbitMQ, SQS)
- ml_model_service: ML inference (predictions, recommendations, fraud detection)
- payment_gateway: Payment processing (must have for e-commerce, SaaS)
- notification_service: Send emails, SMS, push notifications, webhooks
- analytics_service: Data aggregation & reporting to data warehouse
- real_time_db: Real-time subscriptions (Firebase, DynamoDB streams)
- auth_service: User authentication & authorization
- custom_service: Business logic services (order, user, message services)
- order_service: E-commerce order management (extends custom_service)

REQUEST/RESPONSE TEMPLATES - IMPORTANT:
Each node MUST include a "requestResponseTemplate" field in its data. This defines what data flows INTO and OUT OF each component during simulation. Make the samples REALISTIC and SPECIFIC to the node's actual purpose in this architecture. For example:
- A "Chat Server" custom_service should show chat message request/response, NOT generic "get_product" data
- A "User Auth" auth_service should show login/token verification data
- A database storing chat messages should show chat-specific queries, NOT generic "SELECT * FROM products"
The request sample should represent what the upstream node sends TO this node.
The response sample should represent what this node sends BACK after processing.
Keep samples concise (3-5 fields each). Include 2-4 field descriptions.

SCALE & TOPOLOGY CONSTRAINTS (derived from the user's description — follow these strictly):
${tierBlock}

${constraints ? `ADDITIONAL CONSTRAINTS: ${constraints}` : ''}

USER REQUEST: ${description}`;
}


