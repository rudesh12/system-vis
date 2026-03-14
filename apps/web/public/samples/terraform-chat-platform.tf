terraform {
  required_version = ">= 1.5.0"
}

provider "aws" {
  region = "us-east-1"
}

resource "aws_cloudfront_distribution" "edge" {
  enabled = true

  origin {
    domain_name = aws_apigatewayv2_api.main.api_endpoint
    origin_id   = "api-gateway-origin"
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "api-gateway-origin"
  }
}

resource "aws_apigatewayv2_api" "main" {
  name          = "chat-api"
  protocol_type = "HTTP"
  description   = "Routes requests to the main load balancer"

  tags = {
    upstream = aws_lb.main.arn
  }
}

resource "aws_lb" "main" {
  name               = "chat-app-lb"
  internal           = false
  load_balancer_type = "application"

  tags = {
    message_service = aws_ecs_service.message.name
    user_service    = aws_ecs_service.user.name
    ws_service      = aws_ecs_service.websocket.name
  }
}

resource "aws_ecs_cluster" "apps" {
  name = "chat-cluster"
}

resource "aws_ecs_service" "message" {
  name            = "message-service"
  cluster         = aws_ecs_cluster.apps.id
  task_definition = aws_ecs_task_definition.message.arn
  desired_count   = 4

  tags = {
    search  = aws_opensearch_domain.search.domain_name
    queue   = aws_msk_cluster.events.arn
    db      = aws_db_instance.primary.address
    cache   = aws_elasticache_replication_group.sessions.primary_endpoint_address
    metrics = aws_kinesis_analytics_application.stream.name
  }
}

resource "aws_ecs_service" "user" {
  name            = "user-service"
  cluster         = aws_ecs_cluster.apps.id
  task_definition = aws_ecs_task_definition.user.arn
  desired_count   = 3

  tags = {
    auth_pool = aws_cognito_user_pool.main.id
    rtdb      = aws_dynamodb_table.presence.name
    db        = aws_db_instance.primary.address
  }
}

resource "aws_ecs_service" "websocket" {
  name            = "websocket-service"
  cluster         = aws_ecs_cluster.apps.id
  task_definition = aws_ecs_task_definition.websocket.arn
  desired_count   = 6

  tags = {
    notification_topic = aws_sns_topic.notifications.arn
  }
}

resource "aws_ecs_task_definition" "message" {
  family                   = "message-task"
  requires_compatibilities = ["FARGATE"]
}

resource "aws_ecs_task_definition" "user" {
  family                   = "user-task"
  requires_compatibilities = ["FARGATE"]
}

resource "aws_ecs_task_definition" "websocket" {
  family                   = "websocket-task"
  requires_compatibilities = ["FARGATE"]
}

resource "aws_opensearch_domain" "search" {
  domain_name    = "chat-search"
  engine_version = "OpenSearch_2.11"
}

resource "aws_msk_cluster" "events" {
  cluster_name           = "chat-events"
  kafka_version          = "3.6.0"
  number_of_broker_nodes = 3
}

resource "aws_kinesis_analytics_application" "stream" {
  name = "chat-stream-processor"

  tags = {
    source_queue = aws_msk_cluster.events.arn
    sink_topic   = aws_sns_topic.notifications.arn
  }
}

resource "aws_sns_topic" "notifications" {
  name = "chat-notifications"

  tags = {
    source = aws_msk_cluster.events.arn
  }
}

resource "aws_db_instance" "primary" {
  identifier          = "chat-primary"
  engine              = "postgres"
  instance_class      = "db.t3.medium"
  allocated_storage   = 50
  skip_final_snapshot = true
}

resource "aws_elasticache_replication_group" "sessions" {
  replication_group_id = "chat-sessions"
  engine               = "redis"
  node_type            = "cache.t3.small"
  num_cache_clusters   = 2
}

resource "aws_dynamodb_table" "presence" {
  name         = "chat-presence"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }
}

resource "aws_cognito_user_pool" "main" {
  name = "chat-users"
}
