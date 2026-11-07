resource "aws_vpc" "shop" {
  cidr_block = "10.0.0.0/16"
}
resource "aws_subnet" "public_a" {
  vpc_id = aws_vpc.shop.id
}
resource "aws_subnet" "app_a" {
  vpc_id = aws_vpc.shop.id
}
resource "aws_subnet" "data_a" {
  vpc_id = aws_vpc.shop.id
}
resource "aws_cloudfront_distribution" "edge" {}
resource "aws_lb" "public" {}
resource "aws_ecs_service" "checkout_api" {}
resource "aws_ecs_service" "payment_worker" {}
resource "aws_sqs_queue" "payment_jobs" {}
resource "aws_db_instance" "orders" {}
resource "aws_elasticache_replication_group" "sessions" {}
resource "aws_secretsmanager_secret" "app" {}
resource "aws_cloudwatch_metric_alarm" "api_errors" {}
