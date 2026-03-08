terraform {
  required_version = ">= 1.6.0"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {}

resource "docker_network" "nexus" {
  name = var.stack_name
}

resource "docker_volume" "postgres_data" {
  name = "${var.stack_name}-postgres-data"
}

resource "docker_volume" "minio_data" {
  name = "${var.stack_name}-minio-data"
}

resource "docker_image" "postgres" {
  name = var.postgres_image
}

resource "docker_image" "redis" {
  name = var.redis_image
}

resource "docker_image" "minio" {
  name = var.minio_image
}

resource "docker_image" "mc" {
  name = var.minio_mc_image
}

resource "docker_image" "app" {
  name = var.app_image

  build {
    context    = abspath("${path.module}/../..")
    dockerfile = abspath("${path.module}/../../Dockerfile")
  }
}

resource "docker_container" "postgres" {
  name  = "${var.stack_name}-postgres"
  image = docker_image.postgres.image_id

  env = [
    "POSTGRES_DB=${var.postgres_db}",
    "POSTGRES_USER=${var.postgres_user}",
    "POSTGRES_PASSWORD=${var.postgres_password}"
  ]

  networks_advanced {
    name = docker_network.nexus.name
  }

  mounts {
    target = "/var/lib/postgresql/data"
    source = docker_volume.postgres_data.name
    type   = "volume"
  }

  mounts {
    target    = "/docker-entrypoint-initdb.d"
    source    = var.sql_init_host_path != "" ? var.sql_init_host_path : abspath("${path.module}/../../sql/init")
    type      = "bind"
    read_only = true
  }
}

resource "docker_container" "redis" {
  name    = "${var.stack_name}-redis"
  image   = docker_image.redis.image_id
  command = ["sh", "-c", "redis-server --save '' --appendonly no"]

  networks_advanced {
    name = docker_network.nexus.name
  }
}

resource "docker_container" "minio" {
  name    = "${var.stack_name}-minio"
  image   = docker_image.minio.image_id
  command = ["server", "/data", "--console-address", ":9001"]

  env = [
    "MINIO_ROOT_USER=${var.minio_root_user}",
    "MINIO_ROOT_PASSWORD=${var.minio_root_password}"
  ]

  networks_advanced {
    name = docker_network.nexus.name
  }

  mounts {
    target = "/data"
    source = docker_volume.minio_data.name
    type   = "volume"
  }
}

resource "docker_container" "minio_bootstrap" {
  name     = "${var.stack_name}-minio-bootstrap"
  image    = docker_image.mc.image_id
  must_run = false

  depends_on = [docker_container.minio]

  env = [
    "MINIO_ROOT_USER=${var.minio_root_user}",
    "MINIO_ROOT_PASSWORD=${var.minio_root_password}",
    "MINIO_BUCKET=${var.minio_bucket}"
  ]

  command = [
    "/bin/sh",
    "-c",
    "until mc alias set local http://${docker_container.minio.name}:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD; do sleep 1; done && mc mb --ignore-existing local/$MINIO_BUCKET && mc anonymous set none local/$MINIO_BUCKET"
  ]

  networks_advanced {
    name = docker_network.nexus.name
  }
}

locals {
  common_env = [
    "NODE_ENV=${var.node_env}",
    "HOST=0.0.0.0",
    "PORT=4000",
    "APP_BASE_URL=${var.app_base_url}",
    "LOG_LEVEL=${var.log_level}",
    "ARTIFACT_STORAGE_PROVIDER=${var.artifact_storage_provider}",
    "ARTIFACT_STORAGE_PATH=${var.artifact_storage_path}",
    "ARTIFACT_DOWNLOAD_URL_TTL_SECONDS=${var.artifact_download_url_ttl_seconds}",
    "S3_REGION=${var.s3_region}",
    "S3_BUCKET=${var.s3_bucket}",
    "S3_ENDPOINT=http://${docker_container.minio.name}:9000",
    "S3_ACCESS_KEY_ID=${var.s3_access_key_id}",
    "S3_SECRET_ACCESS_KEY=${var.s3_secret_access_key}",
    "S3_FORCE_PATH_STYLE=${var.s3_force_path_style}",
    "MINIO_ROOT_USER=${var.minio_root_user}",
    "MINIO_ROOT_PASSWORD=${var.minio_root_password}",
    "MINIO_BUCKET=${var.minio_bucket}",
    "INTERNAL_SERVICE_TOKENS=${var.internal_service_tokens}",
    "SLACK_SIGNING_SECRET=${var.slack_signing_secret}",
    "WEBHOOK_SHARED_SECRET=${var.webhook_shared_secret}",
    "DATABASE_URL=postgres://${var.postgres_user}:${var.postgres_password}@${docker_container.postgres.name}:5432/${var.postgres_db}",
    "REDIS_URL=redis://${docker_container.redis.name}:6379",
    "GITHUB_DRAFT_SYNC_ENABLED=${var.github_draft_sync_enabled}",
    "GITHUB_AUTH_MODE=${var.github_auth_mode}",
    "GITHUB_USE_TEST_REPO=${var.github_use_test_repo}",
    "GITHUB_OWNER=${var.github_owner}",
    "GITHUB_REPO=${var.github_repo}",
    "GITHUB_TEST_OWNER=${var.github_test_owner}",
    "GITHUB_TEST_REPO=${var.github_test_repo}",
    "GITHUB_TOKEN=${var.github_token}",
    "GITHUB_APP_ID=${var.github_app_id}",
    "GITHUB_APP_INSTALLATION_ID=${var.github_app_installation_id}",
    "GITHUB_APP_PRIVATE_KEY=${var.github_app_private_key}",
    "AGENT_EXECUTION_COMMAND=${var.agent_execution_command}",
    "AGENT_EXECUTION_ARGS=${var.agent_execution_args}",
    "AGENT_EXECUTION_TIMEOUT_SECONDS=${var.agent_execution_timeout_seconds}",
    "AGENT_EXECUTION_AUTO_CREATE_PR=${var.agent_execution_auto_create_pr}",
    "EXTENSION_MAX_INLINE_ARTIFACT_BYTES=${var.extension_max_inline_artifact_bytes}",
    "EXTENSION_MAX_TOTAL_INLINE_ARTIFACT_BYTES=${var.extension_max_total_inline_artifact_bytes}"
  ]
}

resource "docker_container" "app" {
  name    = "${var.stack_name}-app"
  image   = docker_image.app.image_id
  restart = "unless-stopped"
  env     = local.common_env

  ports {
    internal = 4000
    external = var.app_port
  }

  networks_advanced {
    name = docker_network.nexus.name
  }

  depends_on = [docker_container.postgres, docker_container.redis, docker_container.minio_bootstrap]
}

resource "docker_container" "worker" {
  name    = "${var.stack_name}-worker"
  image   = docker_image.app.image_id
  restart = "unless-stopped"
  env     = local.common_env
  command = ["node", "dist/worker.js"]

  networks_advanced {
    name = docker_network.nexus.name
  }

  depends_on = [docker_container.postgres, docker_container.redis, docker_container.minio_bootstrap]
}