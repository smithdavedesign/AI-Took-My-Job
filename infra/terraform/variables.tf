variable "stack_name" {
  type    = string
  default = "nexus"
}

variable "app_image" {
  type    = string
  default = "ai-devops-nexus:latest"
}

variable "postgres_image" {
  type    = string
  default = "pgvector/pgvector:pg17"
}

variable "redis_image" {
  type    = string
  default = "redis:7-alpine"
}

variable "minio_image" {
  type    = string
  default = "minio/minio:RELEASE.2025-02-28T09-55-16Z"
}

variable "minio_mc_image" {
  type    = string
  default = "minio/mc:RELEASE.2025-02-21T16-00-46Z"
}

variable "node_env" { type = string default = "production" }
variable "app_port" { type = number default = 4000 }
variable "app_base_url" { type = string default = "http://127.0.0.1:4000" }
variable "log_level" { type = string default = "info" }
variable "postgres_db" { type = string default = "nexus" }
variable "postgres_user" { type = string default = "nexus" }
variable "postgres_password" { type = string default = "nexus" sensitive = true }
variable "artifact_storage_provider" { type = string default = "s3" }
variable "artifact_storage_path" { type = string default = "./var/artifacts" }
variable "artifact_download_url_ttl_seconds" { type = number default = 600 }
variable "s3_region" { type = string default = "us-east-1" }
variable "s3_bucket" { type = string default = "nexus-artifacts" }
variable "s3_endpoint" { type = string default = "http://nexus-minio:9000" }
variable "s3_access_key_id" { type = string default = "minioadmin" sensitive = true }
variable "s3_secret_access_key" { type = string default = "minioadmin" sensitive = true }
variable "s3_force_path_style" { type = string default = "true" }
variable "minio_root_user" { type = string default = "minioadmin" }
variable "minio_root_password" { type = string default = "minioadmin" sensitive = true }
variable "minio_bucket" { type = string default = "nexus-artifacts" }
variable "internal_service_tokens" { type = string }
variable "slack_signing_secret" { type = string sensitive = true }
variable "webhook_shared_secret" { type = string sensitive = true }
variable "github_draft_sync_enabled" { type = string default = "false" }
variable "github_auth_mode" { type = string default = "pat" }
variable "github_use_test_repo" { type = string default = "false" }
variable "github_owner" { type = string default = "" }
variable "github_repo" { type = string default = "" }
variable "github_test_owner" { type = string default = "" }
variable "github_test_repo" { type = string default = "" }
variable "github_token" { type = string default = "" sensitive = true }
variable "github_app_id" { type = string default = "" }
variable "github_app_installation_id" { type = string default = "" }
variable "github_app_private_key" { type = string default = "" sensitive = true }
variable "agent_execution_command" { type = string default = "" }
variable "agent_execution_args" { type = string default = "[]" }
variable "agent_execution_timeout_seconds" { type = string default = "600" }
variable "agent_execution_auto_create_pr" { type = string default = "false" }
variable "extension_max_inline_artifact_bytes" { type = string default = "1048576" }
variable "extension_max_total_inline_artifact_bytes" { type = string default = "5242880" }