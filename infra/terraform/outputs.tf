output "app_url" {
  value = "http://127.0.0.1:${var.app_port}"
}

output "postgres_container" {
  value = docker_container.postgres.name
}

output "worker_container" {
  value = docker_container.worker.name
}