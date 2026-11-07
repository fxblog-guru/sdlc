/**
 * clouds.mjs — the cloud registry: one adapter per provider (DEV-CONTRACTS §13.14).
 *
 * A deployment model (`deployment/<slug>/topology.yaml`) names neutral kinds — `vm`, `sql-database`,
 * `vpc`, `subnet` — and never a vendor's style string. The adapter turns each kind into the
 * provider's own service name and its official draw.io stencil, and carries the provider's diagram
 * rules: which groups exist and what each may sit inside. topology.mjs reads nothing else, so
 * supporting a provider is one adapter here and a row in `skills/dev-designing-cloud/providers/`.
 *
 * Every stencil below was taken from the draw.io sidebar that ships it (jgraph/drawio
 * `js/diagramly/sidebar/Sidebar-<Provider>.js`) and drawn once in headless Edge before it was added;
 * a name that is not in that file renders as an empty box. OCI's toolkit is not built into
 * draw.io, so its groups follow Oracle's OCI Style Guide for draw.io v24.2 and its services are
 * drawn as OCI component cards, the toolkit's own logical-view element.
 *
 * Adapter shape:
 *   id, name          provider id (lower case) and display name
 *   guide             the provider's diagram guidance, cited by the skill
 *   framework         the provider's well-architected framework and its pillars
 *   services          kind → [service name, stencil]. A stencil is one of
 *                       { r: name, fill }        AWS resource icon (square tile, glyph inside)
 *                       { s: name, fill, w, h }  a stencil shape: `mxgraph.<lib>.<name>`
 *                       { img: path, w, h }      a draw.io image library path (Azure)
 *                       { hex: name }            GCP product hexagon (`gcp2.hexIcon`)
 *                       { card: true }           a labelled card in the provider's colours (OCI)
 *   groups            kind → { label, style, parents } — `parents` lists the group kinds this one may
 *                     be drawn inside, `null` for the top level. The nesting rule IS the diagram
 *                     standard: an AWS subnet outside a VPC is a finding, not a style choice.
 *   required          group kinds every diagram of this provider must draw
 */

const ICON = 'sketch=0;outlineConnect=0;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;';
const AWS_GROUP = 'outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;verticalAlign=top;align=left;spacingLeft=30;';
const BOX = 'container=1;collapsible=0;recursiveResize=0;pointerEvents=0;html=1;whiteSpace=wrap;verticalAlign=top;align=left;spacingLeft=8;fontSize=12;';

/** The neutral kinds a topology may use. A kind outside this list is `E721`. */
export const KINDS = {
  // actors and edges of the system
  users: 'people using the system', mobile: 'a mobile app', client: 'a browser or desktop client',
  internet: 'the public internet', onprem: 'an on-premises system', external: 'a third-party service',
  // edge and network
  dns: 'DNS', cdn: 'CDN', waf: 'web application firewall', ddos: 'DDoS protection',
  'api-gateway': 'API gateway', 'load-balancer': 'L7 load balancer', 'network-load-balancer': 'L4 load balancer',
  'nat-gateway': 'NAT gateway', 'internet-gateway': 'internet gateway / public IP', vpn: 'VPN gateway',
  // compute
  vm: 'virtual machine', 'container-service': 'managed containers (no cluster to run)',
  kubernetes: 'managed Kubernetes', 'serverless-function': 'functions', 'container-registry': 'container registry',
  // data
  'sql-database': 'relational database', 'nosql-database': 'document / key-value database', cache: 'in-memory cache',
  'object-storage': 'object storage', 'file-storage': 'shared file storage', 'data-warehouse': 'data warehouse',
  search: 'search engine',
  // integration
  queue: 'message queue', pubsub: 'pub/sub topic', 'event-bus': 'event bus', stream: 'event stream',
  email: 'transactional e-mail',
  // security
  secrets: 'secrets store', kms: 'key management', identity: 'customer identity (sign-in)', iam: 'workload identity / IAM',
  // operations
  monitoring: 'metrics and alerts', logging: 'logs', tracing: 'traces', 'ci-cd': 'delivery pipeline',
};

/** Kinds every provider draws the same way: things outside any cloud. */
const GENERIC = {
  onprem: ['On-premises', { box: 'rounded=1;fillColor=#F5F5F5;strokeColor=#666666;fontColor=#333333;' }],
  external: ['External service', { box: 'rounded=1;dashed=1;fillColor=#FFFFFF;strokeColor=#666666;fontColor=#333333;' }],
};

const aws = {
  id: 'aws',
  name: 'AWS',
  guide: 'https://aws.amazon.com/architecture/icons/',
  framework: { name: 'AWS Well-Architected Framework', url: 'https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html', pillars: ['Operational excellence', 'Security', 'Reliability', 'Performance efficiency', 'Cost optimization', 'Sustainability'] },
  services: {
    users: ['Users', { s: 'users', fill: '#232F3D' }],
    mobile: ['Mobile client', { s: 'mobile_client', fill: '#232F3D', w: 41, h: 78 }],
    client: ['Client', { s: 'client', fill: '#232F3D', w: 78, h: 76 }],
    internet: ['Internet', { s: 'internet_alt1', fill: '#232F3D', w: 78, h: 48 }],
    dns: ['Route 53', { r: 'route_53', fill: '#8C4FFF' }],
    cdn: ['CloudFront', { r: 'cloudfront', fill: '#8C4FFF' }],
    waf: ['AWS WAF', { r: 'waf', fill: '#DD344C' }],
    ddos: ['AWS Shield', { r: 'shield', fill: '#DD344C' }],
    'api-gateway': ['API Gateway', { r: 'api_gateway', fill: '#E7157B' }],
    'load-balancer': ['Application Load Balancer', { s: 'application_load_balancer', fill: '#8C4FFF' }],
    'network-load-balancer': ['Network Load Balancer', { s: 'network_load_balancer', fill: '#8C4FFF' }],
    'nat-gateway': ['NAT gateway', { s: 'nat_gateway', fill: '#8C4FFF' }],
    'internet-gateway': ['Internet gateway', { s: 'internet_gateway', fill: '#8C4FFF' }],
    vpn: ['Site-to-Site VPN', { r: 'site_to_site_vpn', fill: '#8C4FFF' }],
    vm: ['Amazon EC2', { r: 'ec2', fill: '#ED7100' }],
    'container-service': ['Amazon ECS on Fargate', { r: 'fargate', fill: '#ED7100' }],
    kubernetes: ['Amazon EKS', { r: 'eks', fill: '#ED7100' }],
    'serverless-function': ['AWS Lambda', { r: 'lambda', fill: '#ED7100' }],
    'container-registry': ['Amazon ECR', { r: 'ecr', fill: '#ED7100' }],
    'sql-database': ['Amazon RDS', { r: 'rds', fill: '#C925D1' }],
    'nosql-database': ['Amazon DynamoDB', { r: 'dynamodb', fill: '#C925D1' }],
    cache: ['Amazon ElastiCache', { r: 'elasticache', fill: '#C925D1' }],
    'object-storage': ['Amazon S3', { r: 's3', fill: '#7AA116' }],
    'file-storage': ['Amazon EFS', { r: 'elastic_file_system', fill: '#7AA116' }],
    'data-warehouse': ['Amazon Redshift', { r: 'redshift', fill: '#8C4FFF' }],
    search: ['Amazon OpenSearch Service', { r: 'elasticsearch_service', fill: '#8C4FFF' }],
    queue: ['Amazon SQS', { r: 'sqs', fill: '#E7157B' }],
    pubsub: ['Amazon SNS', { r: 'sns', fill: '#E7157B' }],
    'event-bus': ['Amazon EventBridge', { r: 'eventbridge', fill: '#E7157B' }],
    stream: ['Amazon Kinesis', { r: 'kinesis', fill: '#8C4FFF' }],
    email: ['Amazon SES', { r: 'simple_email_service', fill: '#DD344C' }],
    secrets: ['Secrets Manager', { r: 'secrets_manager', fill: '#DD344C' }],
    kms: ['AWS KMS', { r: 'key_management_service', fill: '#DD344C' }],
    identity: ['Amazon Cognito', { r: 'cognito', fill: '#DD344C' }],
    iam: ['AWS IAM', { r: 'identity_and_access_management', fill: '#DD344C' }],
    monitoring: ['Amazon CloudWatch', { r: 'cloudwatch_2', fill: '#E7157B' }],
    logging: ['CloudWatch Logs', { s: 'cloudwatch_logs', fill: '#E7157B', w: 78, h: 58 }],
    tracing: ['AWS X-Ray', { r: 'xray', fill: '#C925D1' }],
    'ci-cd': ['AWS CodePipeline', { r: 'codepipeline', fill: '#C925D1' }],
  },
  groups: {
    account: { label: 'AWS account', parents: [null], style: `${AWS_GROUP}grIcon=mxgraph.aws4.group_account;strokeColor=#CD2264;fillColor=none;fontColor=#CD2264;dashed=0;` },
    cloud: { label: 'AWS Cloud', parents: [null, 'account'], style: `${AWS_GROUP}grIcon=mxgraph.aws4.group_aws_cloud_alt;strokeColor=#232F3E;fillColor=none;fontColor=#232F3E;dashed=0;` },
    region: { label: 'Region', parents: ['cloud'], style: `${AWS_GROUP}grIcon=mxgraph.aws4.group_region;strokeColor=#00A4A6;fillColor=none;fontColor=#147EBA;dashed=1;` },
    vpc: { label: 'VPC', parents: ['region'], style: `${AWS_GROUP}grIcon=mxgraph.aws4.group_vpc2;strokeColor=#8C4FFF;fillColor=none;fontColor=#AAB7B8;dashed=0;` },
    zone: { label: 'Availability Zone', parents: ['vpc'], style: `${BOX}fillColor=none;strokeColor=#147EBA;dashed=1;fontColor=#147EBA;align=center;` },
    'public-subnet': { label: 'Public subnet', parents: ['zone', 'vpc'], style: `${AWS_GROUP}grIcon=mxgraph.aws4.group_security_group;grStroke=0;strokeColor=#7AA116;fillColor=#F2F6E8;fontColor=#248814;dashed=0;` },
    'private-subnet': { label: 'Private subnet', parents: ['zone', 'vpc'], style: `${AWS_GROUP}grIcon=mxgraph.aws4.group_security_group;grStroke=0;strokeColor=#00A4A6;fillColor=#E6F6F7;fontColor=#147EBA;dashed=0;` },
    'security-group': { label: 'Security group', parents: ['public-subnet', 'private-subnet'], style: `${BOX}fillColor=none;strokeColor=#DD3522;fontColor=#DD3522;` },
    'auto-scaling': { label: 'Auto Scaling group', parents: ['zone', 'vpc', 'public-subnet', 'private-subnet'], style: `${AWS_GROUP.replace('shape=mxgraph.aws4.group;', 'shape=mxgraph.aws4.groupCenter;').replace('align=left;spacingLeft=30;', 'align=center;')}grIcon=mxgraph.aws4.group_auto_scaling_group;grStroke=1;strokeColor=#D86613;fillColor=none;fontColor=#D86613;dashed=1;spacingTop=25;` },
    onprem: { label: 'Corporate data center', parents: [null], style: `${AWS_GROUP}grIcon=mxgraph.aws4.group_corporate_data_center;strokeColor=#7D8998;fillColor=none;fontColor=#5A6C86;dashed=0;` },
  },
  required: ['cloud', 'region'],
};

const AZ = 'img/lib/azure2/';
const azure = {
  id: 'azure',
  name: 'Microsoft Azure',
  guide: 'https://learn.microsoft.com/azure/architecture/icons/',
  framework: { name: 'Azure Well-Architected Framework', url: 'https://learn.microsoft.com/azure/well-architected/', pillars: ['Reliability', 'Security', 'Cost optimization', 'Operational excellence', 'Performance efficiency'] },
  services: {
    users: ['Users', { img: `${AZ}identity/Users.svg` }],
    mobile: ['Mobile app', { img: `${AZ}general/Mobile.svg`, w: 40, h: 64 }],
    client: ['Browser', { img: `${AZ}general/Browser.svg`, w: 64, h: 52 }],
    internet: ['Internet', { img: `${AZ}general/Globe.svg` }],
    dns: ['Azure DNS', { img: `${AZ}networking/DNS_Zones.svg` }],
    cdn: ['Azure Front Door', { img: `${AZ}networking/Front_Doors.svg`, w: 64, h: 58 }],
    waf: ['Web Application Firewall', { img: `${AZ}networking/Web_Application_Firewall_Policies_WAF.svg` }],
    ddos: ['DDoS Protection', { img: `${AZ}networking/DDoS_Protection_Plans.svg`, w: 52, h: 64 }],
    'api-gateway': ['API Management', { img: `${AZ}integration/API_Management_Services.svg`, w: 64, h: 60 }],
    'load-balancer': ['Application Gateway', { img: `${AZ}networking/Application_Gateways.svg` }],
    'network-load-balancer': ['Azure Load Balancer', { img: `${AZ}networking/Load_Balancers.svg` }],
    'nat-gateway': ['NAT gateway', { img: `${AZ}networking/NAT.svg` }],
    'internet-gateway': ['Public IP address', { img: `${AZ}networking/Public_IP_Addresses.svg`, w: 64, h: 52 }],
    vpn: ['VPN Gateway', { img: `${AZ}networking/Virtual_Network_Gateways.svg`, w: 52, h: 64 }],
    vm: ['Virtual Machines', { img: `${AZ}compute/Virtual_Machine.svg`, w: 64, h: 60 }],
    'container-service': ['Azure Container Apps', { img: `${AZ}other/Worker_Container_App.svg` }],
    kubernetes: ['Azure Kubernetes Service', { img: `${AZ}containers/Kubernetes_Services.svg`, w: 64, h: 56 }],
    'serverless-function': ['Azure Functions', { img: `${AZ}compute/Function_Apps.svg`, w: 64, h: 56 }],
    'container-registry': ['Container Registry', { img: `${AZ}containers/Container_Registries.svg`, w: 64, h: 56 }],
    'sql-database': ['Azure Database for PostgreSQL', { img: `${AZ}databases/Azure_Database_PostgreSQL_Server.svg`, w: 48, h: 64 }],
    'nosql-database': ['Azure Cosmos DB', { img: `${AZ}databases/Azure_Cosmos_DB.svg` }],
    cache: ['Azure Cache for Redis', { img: `${AZ}databases/Cache_Redis.svg`, w: 64, h: 52 }],
    'object-storage': ['Blob Storage', { img: `${AZ}storage/Storage_Accounts.svg`, w: 64, h: 52 }],
    'file-storage': ['Azure Files', { img: `${AZ}storage/Azure_Fileshare.svg`, w: 64, h: 40 }],
    'data-warehouse': ['Azure Synapse Analytics', { img: `${AZ}analytics/Azure_Synapse_Analytics.svg`, w: 56, h: 64 }],
    search: ['Azure AI Search', { img: `${AZ}app_services/Search_Services.svg`, w: 64, h: 44 }],
    queue: ['Service Bus queue', { img: `${AZ}integration/Service_Bus.svg`, w: 64, h: 56 }],
    pubsub: ['Service Bus topic', { img: `${AZ}integration/Service_Bus.svg`, w: 64, h: 56 }],
    'event-bus': ['Event Grid', { img: `${AZ}integration/Event_Grid_Topics.svg`, w: 64, h: 60 }],
    stream: ['Event Hubs', { img: `${AZ}analytics/Event_Hubs.svg`, w: 56, h: 64 }],
    email: ['Communication Services', { img: `${AZ}other/Azure_Communication_Services.svg`, w: 64, h: 60 }],
    secrets: ['Key Vault', { img: `${AZ}security/Key_Vaults.svg` }],
    kms: ['Key Vault (keys)', { img: `${AZ}security/Key_Vaults.svg` }],
    identity: ['Entra External ID', { img: `${AZ}identity/External_Identities.svg`, w: 60, h: 64 }],
    iam: ['Managed identity', { img: `${AZ}identity/Managed_Identities.svg`, w: 52, h: 64 }],
    monitoring: ['Azure Monitor', { img: `${AZ}management_governance/Monitor.svg` }],
    logging: ['Log Analytics', { img: `${AZ}management_governance/Log_Analytics_Workspaces.svg` }],
    tracing: ['Application Insights', { img: `${AZ}management_governance/Application_Insights.svg`, w: 44, h: 64 }],
    'ci-cd': ['Azure Pipelines', { img: `${AZ}devops/Azure_DevOps.svg` }],
  },
  // Microsoft's reference architectures draw scopes as labelled dashed boxes, the scope's icon at the
  // top left; the colours are the ones the Azure Architecture Center diagrams use.
  groups: {
    subscription: { label: 'Subscription', parents: [null], style: `${BOX}rounded=0;dashed=1;fillColor=none;strokeColor=#0078D4;fontColor=#0078D4;fontStyle=1;` },
    'resource-group': { label: 'Resource group', parents: ['subscription', 'region'], style: `${BOX}rounded=0;dashed=1;fillColor=none;strokeColor=#7A7A7A;fontColor=#505050;` },
    region: { label: 'Region', parents: ['subscription'], style: `${BOX}rounded=0;dashed=0;fillColor=none;strokeColor=#0078D4;fontColor=#0078D4;` },
    vnet: { label: 'Virtual network', parents: ['resource-group', 'region'], style: `${BOX}rounded=0;dashed=0;fillColor=#EAF3FB;strokeColor=#50A0E0;fontColor=#0F6CBD;` },
    zone: { label: 'Availability zone', parents: ['vnet'], style: `${BOX}rounded=0;dashed=1;fillColor=none;strokeColor=#7A7A7A;fontColor=#505050;align=center;` },
    subnet: { label: 'Subnet', parents: ['vnet', 'zone'], style: `${BOX}rounded=0;dashed=1;fillColor=#FFFFFF;strokeColor=#50A0E0;fontColor=#0F6CBD;` },
    onprem: { label: 'On-premises', parents: [null], style: `${BOX}rounded=0;dashed=0;fillColor=#F5F5F5;strokeColor=#7A7A7A;fontColor=#505050;` },
  },
  required: ['subscription', 'region'],
};

const gcp = {
  id: 'gcp',
  name: 'Google Cloud',
  guide: 'https://cloud.google.com/icons',
  framework: { name: 'Google Cloud Well-Architected Framework', url: 'https://cloud.google.com/architecture/framework', pillars: ['Operational excellence', 'Security', 'Reliability', 'Cost optimization', 'Performance optimization', 'Sustainability'] },
  services: {
    users: ['Users', { s: 'users', fill: '#757575', w: 56, h: 56, lib: 'gcp2' }],
    mobile: ['Mobile', { s: 'mobile_devices', fill: '#757575', w: 56, h: 56, lib: 'gcp2' }],
    client: ['Browser', { s: 'desktop', fill: '#757575', w: 56, h: 50, lib: 'gcp2' }],
    internet: ['Internet', { s: 'internet_connection', fill: '#757575', w: 56, h: 56, lib: 'gcp2' }],
    dns: ['Cloud DNS', { hex: 'cloud_dns' }],
    cdn: ['Cloud CDN', { hex: 'cloud_cdn' }],
    waf: ['Cloud Armor', { hex: 'cloud_armor' }],
    ddos: ['Cloud Armor', { hex: 'cloud_armor' }],
    'api-gateway': ['Apigee', { hex: 'apigee_api_platform' }],
    'load-balancer': ['Cloud Load Balancing', { hex: 'cloud_load_balancing' }],
    'network-load-balancer': ['Network Load Balancer', { hex: 'cloud_load_balancing' }],
    'nat-gateway': ['Cloud NAT', { hex: 'cloud_nat' }],
    'internet-gateway': ['External IP address', { hex: 'cloud_external_ip_addresses' }],
    vpn: ['Cloud VPN', { hex: 'cloud_vpn' }],
    vm: ['Compute Engine', { hex: 'compute_engine' }],
    'container-service': ['Cloud Run', { hex: 'cloud_run' }],
    kubernetes: ['Google Kubernetes Engine', { hex: 'container_engine' }],
    'serverless-function': ['Cloud Run functions', { hex: 'cloud_functions' }],
    'container-registry': ['Artifact Registry', { hex: 'container_registry' }],
    'sql-database': ['Cloud SQL', { hex: 'cloud_sql' }],
    'nosql-database': ['Firestore', { hex: 'cloud_firestore' }],
    cache: ['Memorystore', { hex: 'cloud_memorystore' }],
    'object-storage': ['Cloud Storage', { hex: 'cloud_storage' }],
    'file-storage': ['Filestore', { hex: 'cloud_filestore' }],
    'data-warehouse': ['BigQuery', { hex: 'bigquery' }],
    search: ['Vertex AI Search', { hex: 'cloud_machine_learning' }],
    queue: ['Cloud Tasks', { hex: 'cloud_tasks' }],
    pubsub: ['Pub/Sub', { hex: 'cloud_pubsub' }],
    'event-bus': ['Eventarc', { hex: 'cloud_pubsub' }],
    stream: ['Pub/Sub', { hex: 'cloud_pubsub' }],
    email: ['SendGrid (Marketplace)', { hex: 'cloud_apis' }],
    secrets: ['Secret Manager', { hex: 'key_management_service' }],
    kms: ['Cloud KMS', { hex: 'key_management_service' }],
    identity: ['Identity Platform', { hex: 'identity_aware_proxy' }],
    iam: ['Cloud IAM', { hex: 'cloud_iam' }],
    monitoring: ['Cloud Monitoring', { hex: 'stackdriver' }],
    logging: ['Cloud Logging', { hex: 'logging' }],
    tracing: ['Cloud Trace', { hex: 'trace' }],
    'ci-cd': ['Cloud Build', { hex: 'container_builder' }],
  },
  // Google's diagram guidance: grey canvas for Google Cloud, coloured zone cards nested inside. The
  // zone fills are the gcp2 "Zones" palette's. A GCP VPC is global and its subnets are regional, so
  // both nestings are Google's: region ▸ VPC ▸ subnet (one region drawn) and VPC ▸ region ▸ subnet.
  groups: {
    cloud: { label: 'Google Cloud', parents: [null], style: `${BOX}rounded=1;arcSize=2;absoluteArcSize=1;fillColor=#F6F6F6;strokeColor=none;fontColor=#717171;fontSize=14;spacingLeft=10;` },
    project: { label: 'Project', parents: ['cloud'], style: `${BOX}rounded=1;arcSize=2;absoluteArcSize=1;fillColor=#FFFFFF;strokeColor=#BDBDBD;fontColor=#757575;spacingLeft=10;` },
    region: { label: 'Region', parents: ['project', 'vpc', 'cloud'], style: `${BOX}rounded=1;arcSize=2;absoluteArcSize=1;fillColor=#E1F5FE;strokeColor=none;fontColor=#5F6368;spacingLeft=10;` },
    vpc: { label: 'VPC network', parents: ['project', 'cloud', 'region'], style: `${BOX}rounded=1;arcSize=2;absoluteArcSize=1;fillColor=#E3F2FD;strokeColor=#4285F4;dashed=1;fontColor=#1A73E8;spacingLeft=10;` },
    zone: { label: 'Zone', parents: ['region'], style: `${BOX}rounded=1;arcSize=2;absoluteArcSize=1;fillColor=#FFF8E1;strokeColor=none;fontColor=#5F6368;spacingLeft=10;` },
    subnet: { label: 'Subnet', parents: ['region', 'zone', 'vpc'], style: `${BOX}rounded=1;arcSize=2;absoluteArcSize=1;fillColor=#F1F8E9;strokeColor=none;fontColor=#5F6368;spacingLeft=10;` },
    'instance-group': { label: 'Managed instance group', parents: ['zone', 'region', 'subnet'], style: `${BOX}rounded=1;arcSize=2;absoluteArcSize=1;fillColor=#F3E5F5;strokeColor=none;fontColor=#5F6368;spacingLeft=10;` },
    onprem: { label: 'On-premises', parents: [null], style: `${BOX}rounded=1;arcSize=2;absoluteArcSize=1;fillColor=#EFEBE9;strokeColor=none;fontColor=#5F6368;spacingLeft=10;` },
  },
  required: ['cloud'],
};

const ali = (name, w, h) => ({ s: name, fill: '#FF6A00', w, h, lib: 'alibaba_cloud' });
const alibaba = {
  id: 'alibaba',
  name: 'Alibaba Cloud',
  guide: 'https://www.alibabacloud.com/architecture/index',
  framework: { name: 'Alibaba Cloud Well-Architected Framework', url: 'https://www.alibabacloud.com/help/en/well-architected/latest/learning', pillars: ['Security', 'Reliability', 'Cost optimization', 'Operational excellence', 'Performance efficiency'] },
  services: {
    users: ['Users', ali('user', 48, 48)],
    mobile: ['Mobile app', ali('emas_enterprise_mobile_application_studio', 48, 48)],
    client: ['Client', ali('user', 48, 48)],
    internet: ['Internet', ali('eip_elastic_ip_address', 47, 47)],
    dns: ['Alibaba Cloud DNS', ali('dns_domain_name_system', 56, 55)],
    cdn: ['CDN', ali('cdn_content_distribution_network', 51, 42)],
    waf: ['WAF', ali('waf_web_application_firewall', 49, 43)],
    ddos: ['Anti-DDoS', ali('ddos_protection', 41, 47)],
    'api-gateway': ['API Gateway', ali('apigateway', 43, 42)],
    'load-balancer': ['Application Load Balancer', ali('alb_application_load_balancer_01', 47, 40)],
    'network-load-balancer': ['Network Load Balancer', ali('nlb_network_load_balancer_01', 47, 40)],
    'nat-gateway': ['NAT Gateway', ali('nat_gateway', 52, 42)],
    'internet-gateway': ['Elastic IP address', ali('eip_elastic_ip_address', 47, 47)],
    vpn: ['VPN Gateway', ali('vpn_gateway', 55, 55)],
    vm: ['Elastic Compute Service', ali('ecs_elastic_compute_service', 49, 45)],
    'container-service': ['Serverless App Engine', ali('sae_serverless_app_engine', 49, 55)],
    kubernetes: ['Container Service for Kubernetes', ali('ask_ack_container_service_for_kubernetes', 45, 51)],
    'serverless-function': ['Function Compute', ali('fc_function_compute', 52, 51)],
    'container-registry': ['Container Registry', ali('acr_cloud_container_registry', 49, 56)],
    'sql-database': ['PolarDB', ali('polardb', 56, 57)],
    'nosql-database': ['ApsaraDB for MongoDB', ali('mongodb', 47, 47)],
    cache: ['Tair (Redis)', ali('redis_kvstore', 53, 41)],
    'object-storage': ['Object Storage Service', ali('oss_object_storage_service', 51, 39)],
    'file-storage': ['NAS', ali('nas_network_attached_storage', 40, 40)],
    'data-warehouse': ['MaxCompute', ali('maxcompute', 50, 50)],
    search: ['Elasticsearch', ali('elasticsearch', 46, 50)],
    queue: ['Message Queue', ali('mq_message_queue', 45, 50)],
    pubsub: ['Simple Message Queue', ali('mns_message_service', 40, 40)],
    'event-bus': ['EventBridge', ali('mns_message_service', 40, 40)],
    stream: ['Message Queue for Kafka', ali('kafka', 57, 42)],
    email: ['Direct Mail', ali('directmail', 53, 35)],
    secrets: ['KMS Secrets Manager', ali('ram_resource_access_management', 55, 36)],
    kms: ['Key Management Service', ali('ram_resource_access_management', 55, 36)],
    identity: ['IDaaS', ali('ram_resource_access_management', 55, 36)],
    iam: ['Resource Access Management', ali('ram_resource_access_management', 55, 36)],
    monitoring: ['CloudMonitor', ali('cms_cloud_monitor_service', 52, 41)],
    logging: ['Simple Log Service', ali('sls_simple_log_service', 48, 48)],
    tracing: ['ARMS', ali('arms_application_real-time_monitoring_service', 55, 26)],
    'ci-cd': ['Apsara DevOps', ali('devops', 48, 48)],
  },
  groups: {
    cloud: { label: 'Alibaba Cloud', parents: [null], style: `${BOX}rounded=0;dashed=0;fillColor=none;strokeColor=#FF6A00;fontColor=#FF6A00;fontStyle=1;` },
    region: { label: 'Region', parents: ['cloud'], style: `${BOX}rounded=0;dashed=1;fillColor=none;strokeColor=#FF6A00;fontColor=#FF6A00;` },
    vpc: { label: 'VPC', parents: ['region'], style: `${BOX}rounded=0;dashed=0;fillColor=#FFF4EC;strokeColor=#FF8A3D;fontColor=#C2571A;` },
    zone: { label: 'Zone', parents: ['vpc'], style: `${BOX}rounded=0;dashed=1;fillColor=none;strokeColor=#999999;fontColor=#666666;align=center;` },
    vswitch: { label: 'vSwitch', parents: ['zone', 'vpc'], style: `${BOX}rounded=0;dashed=1;fillColor=#FFFFFF;strokeColor=#FF8A3D;fontColor=#C2571A;` },
    onprem: { label: 'On-premises', parents: [null], style: `${BOX}rounded=0;dashed=0;fillColor=#F5F5F5;strokeColor=#999999;fontColor=#666666;` },
  },
  required: ['cloud', 'region'],
};

// OCI Style Guide for draw.io v24.2: "Physical — Grouping" shapes, Oracle Sans, the Redwood palette.
const OCI_FONT = 'fontFamily=Oracle Sans,Arial;';
const oci = {
  id: 'oci',
  name: 'Oracle Cloud Infrastructure',
  guide: 'https://docs.oracle.com/en-us/iaas/Content/General/Reference/graphicsfordiagrams.htm',
  framework: { name: 'OCI Well-Architected Framework', url: 'https://docs.oracle.com/en/solutions/oci-best-practices/index.html', pillars: ['Security and compliance', 'Reliability and resilience', 'Performance and cost optimization', 'Operational efficiency', 'Distributed cloud'] },
  services: Object.fromEntries(Object.entries({
    users: 'Users', mobile: 'Mobile app', client: 'Browser', internet: 'Internet', dns: 'OCI DNS', cdn: 'OCI CDN',
    waf: 'OCI WAF', ddos: 'DDoS protection', 'api-gateway': 'API Gateway', 'load-balancer': 'Flexible Load Balancer',
    'network-load-balancer': 'Network Load Balancer', 'nat-gateway': 'NAT gateway', 'internet-gateway': 'Internet gateway',
    vpn: 'Site-to-Site VPN', vm: 'Compute (Flex VM)', 'container-service': 'Container Instances', kubernetes: 'OKE (Kubernetes Engine)',
    'serverless-function': 'OCI Functions', 'container-registry': 'Container Registry', 'sql-database': 'Autonomous Database',
    'nosql-database': 'NoSQL Database', cache: 'OCI Cache', 'object-storage': 'Object Storage', 'file-storage': 'File Storage',
    'data-warehouse': 'Autonomous Data Warehouse', search: 'OCI Search with OpenSearch', queue: 'OCI Queue',
    pubsub: 'Notifications', 'event-bus': 'Events', stream: 'Streaming', email: 'Email Delivery', secrets: 'OCI Vault (secrets)',
    kms: 'OCI Vault (keys)', identity: 'Identity Domains', iam: 'IAM policies', monitoring: 'Monitoring', logging: 'Logging',
    tracing: 'Application Performance Monitoring', 'ci-cd': 'OCI DevOps',
  }).map(([k, n]) => [k, [n, { card: true }]])),
  groups: {
    tenancy: { label: 'Tenancy', parents: [null], style: `${BOX}${OCI_FONT}rounded=0;dashed=1;strokeWidth=1;fillColor=none;strokeColor=#9E9892;fontColor=#312D2A;fontStyle=1;spacingLeft=5;` },
    region: { label: 'OCI region', parents: ['tenancy', null], style: `${BOX}${OCI_FONT}rounded=1;arcSize=10;fillColor=#F5F4F2;strokeColor=#9E9892;fontColor=#312D2A;fontStyle=1;align=center;` },
    compartment: { label: 'Compartment', parents: ['region', 'tenancy'], style: `${BOX}${OCI_FONT}rounded=0;dashed=1;dashPattern=1 1;fillColor=none;strokeColor=#AE562C;fontColor=#AE562C;fontStyle=1;spacingLeft=5;` },
    vcn: { label: 'VCN', parents: ['compartment', 'region'], style: `${BOX}${OCI_FONT}rounded=0;dashed=1;strokeWidth=2;fillColor=none;strokeColor=#AE562C;fontColor=#AE562C;fontStyle=1;spacingLeft=5;` },
    'availability-domain': { label: 'Availability domain', parents: ['vcn', 'region'], style: `${BOX}${OCI_FONT}rounded=1;arcSize=8;fillColor=#DFDCD8;strokeColor=#9E9892;fontColor=#312D2A;fontStyle=1;align=center;` },
    'fault-domain': { label: 'Fault domain', parents: ['availability-domain'], style: `${BOX}${OCI_FONT}rounded=1;arcSize=7;fillColor=#FCFBFA;strokeColor=#9E9892;fontColor=#312D2A;fontStyle=1;align=center;` },
    subnet: { label: 'Subnet', parents: ['vcn', 'availability-domain'], style: `${BOX}${OCI_FONT}rounded=0;dashed=1;strokeWidth=1;fillColor=none;strokeColor=#AE562C;fontColor=#AE562C;fontStyle=1;spacingLeft=5;` },
    onprem: { label: 'On-premises', parents: [null], style: `${BOX}${OCI_FONT}rounded=1;arcSize=10;fillColor=#F5F4F2;strokeColor=#9E9892;fontColor=#312D2A;fontStyle=1;align=center;` },
  },
  required: ['region'],
};

/**
 * Kubernetes is a runtime, not a provider: a `cluster` group and its objects can sit inside any
 * provider's network groups, and draw with the Kubernetes community icons (draw.io `kubernetes2`).
 */
export const K8S = {
  services: {
    'k8s-deployment': ['Deployment', 'deploy'], 'k8s-statefulset': ['StatefulSet', 'sts'], 'k8s-daemonset': ['DaemonSet', 'ds'],
    'k8s-pod': ['Pod', 'pod'], 'k8s-service': ['Service', 'svc'], 'k8s-ingress': ['Ingress', 'ing'], 'k8s-hpa': ['HPA', 'hpa'],
    'k8s-job': ['Job', 'job'], 'k8s-cronjob': ['CronJob', 'cronjob'], 'k8s-configmap': ['ConfigMap', 'cm'],
    'k8s-secret': ['Secret', 'secret'], 'k8s-pvc': ['PersistentVolumeClaim', 'pvc'], 'k8s-netpol': ['NetworkPolicy', 'netpol'],
    'k8s-sa': ['ServiceAccount', 'sa'],
  },
  groups: {
    cluster: { label: 'Kubernetes cluster', parents: ['*'], style: `${BOX}rounded=1;arcSize=4;absoluteArcSize=1;dashed=0;fillColor=#F2F7FE;strokeColor=#326CE5;strokeWidth=2;fontColor=#326CE5;fontStyle=1;` },
    namespace: { label: 'Namespace', parents: ['cluster'], style: `${BOX}rounded=1;arcSize=4;absoluteArcSize=1;dashed=1;fillColor=#FFFFFF;strokeColor=#326CE5;fontColor=#326CE5;` },
    'node-pool': { label: 'Node pool', parents: ['cluster'], style: `${BOX}rounded=1;arcSize=4;absoluteArcSize=1;dashed=1;fillColor=none;strokeColor=#7A7A7A;fontColor=#505050;` },
  },
};

for (const k of Object.keys(K8S.services)) KINDS[k] = `Kubernetes ${K8S.services[k][0]}`;

export const PROVIDERS = [aws, azure, gcp, alibaba, oci];

/**
 * Neutral group kinds. A topology written with these draws on any provider (`topology.mjs render
 * --as <provider>`), which is how one model becomes the five-cloud comparison an ADR needs. A
 * provider's own kinds (`vnet`, `vswitch`, `availability-domain`) are accepted too, and pin the
 * topology to that provider.
 */
export const NEUTRAL_GROUPS = {
  root: { aws: 'cloud', azure: 'subscription', gcp: 'cloud', alibaba: 'cloud', oci: 'tenancy' },
  region: { aws: 'region', azure: 'region', gcp: 'region', alibaba: 'region', oci: 'region' },
  network: { aws: 'vpc', azure: 'vnet', gcp: 'vpc', alibaba: 'vpc', oci: 'vcn' },
  zone: { aws: 'zone', azure: 'zone', gcp: 'zone', alibaba: 'zone', oci: 'availability-domain' },
  subnet: { aws: 'private-subnet', azure: 'subnet', gcp: 'subnet', alibaba: 'vswitch', oci: 'subnet' },
  'public-subnet': { aws: 'public-subnet', azure: 'subnet', gcp: 'subnet', alibaba: 'vswitch', oci: 'subnet' },
};

/** The provider's own group kind for a (possibly neutral) kind. */
export function groupKindOn(provider, kind) {
  return NEUTRAL_GROUPS[kind]?.[provider.id] ?? kind;
}

/** Group kinds that are public by definition; any other group is public only with `public: true`. */
export const PUBLIC_GROUPS = new Set(['public-subnet']);

/** Kinds that hold data, so belong in a private network: one in a public subnet is a finding (W731). */
export const DATA_KINDS = new Set(['sql-database', 'nosql-database', 'cache', 'file-storage', 'data-warehouse', 'search', 'k8s-statefulset', 'k8s-pvc']);

/** Kinds that sit outside every provider group by nature, and so may be drawn at the top level. */
export const OUTSIDE_KINDS = new Set(['users', 'mobile', 'client', 'internet', 'onprem', 'external']);

/** The adapter for a provider id (`aws`, `azure`, `gcp`, `alibaba`, `oci`), or null. */
export function providerOf(id) {
  return PROVIDERS.find((p) => p.id === String(id ?? '').toLowerCase()) ?? null;
}

/** [service name, stencil] for a kind on a provider, K8s and generic kinds included; null if unknown. */
export function serviceOf(provider, kind) {
  if (K8S.services[kind]) return [K8S.services[kind][0], { k8s: K8S.services[kind][1] }];
  return provider.services[kind] ?? GENERIC[kind] ?? null;
}

/** The group definition of a kind on a provider — its own groups first, then the Kubernetes ones. */
export function groupOf(provider, kind) {
  return provider.groups[kind] ?? K8S.groups[kind] ?? null;
}

/**
 * The draw.io style of a service node. Every style ends with the label below the icon, so a
 * diagram reads the same across providers: icon, then name, then the service under it.
 */
export function nodeStyle(provider, stencil) {
  const lab = 'verticalLabelPosition=bottom;verticalAlign=top;labelBackgroundColor=none;';
  if (stencil.r) return `${ICON}points=[];fontColor=#232F3E;gradientColor=none;strokeColor=#ffffff;fillColor=${stencil.fill};shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.${stencil.r};`;
  if (stencil.s && !stencil.lib) return `${ICON}fontColor=#232F3E;gradientColor=none;strokeColor=none;pointerEvents=1;fillColor=${stencil.fill};shape=mxgraph.aws4.${stencil.s};`;
  if (stencil.s) return `${ICON}${lab}html=1;shadow=0;strokeColor=none;fillColor=${stencil.fill};shape=mxgraph.${stencil.lib}.${stencil.s};`;
  if (stencil.img) return `image;aspect=fixed;html=1;align=center;fontSize=12;${lab}image=${stencil.img};`;
  if (stencil.hex) return `sketch=0;html=1;aspect=fixed;dashed=0;fillColor=#5184F3;strokeColor=none;${lab}fontSize=12;shape=mxgraph.gcp2.hexIcon;prIcon=${stencil.hex};`;
  if (stencil.k8s) return `aspect=fixed;sketch=0;html=1;dashed=0;whitespace=wrap;${lab}fontSize=12;fillColor=#326CE5;strokeColor=#ffffff;shape=mxgraph.kubernetes.icon2;prIcon=${stencil.k8s};`;
  if (stencil.card) return `rounded=1;whiteSpace=wrap;html=1;${OCI_FONT}fillColor=#FCFBFA;strokeColor=#759C6C;fontColor=#161513;labelBackgroundColor=none;align=center;verticalAlign=middle;fontSize=11;`;
  if (stencil.box) return `whiteSpace=wrap;html=1;align=center;verticalAlign=middle;fontSize=11;${stencil.box}`;
  throw new Error(`unknown stencil ${JSON.stringify(stencil)}`);
}

/** Width and height the node is drawn at: square tiles at 48, others scaled to 48 on the long side. */
export function nodeSize(stencil) {
  if (stencil.card || stencil.box) return { w: 120, h: 56 };
  const w = stencil.w ?? 48, h = stencil.h ?? 48;
  const k = 48 / Math.max(w, h);
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/**
 * IaC resource types that declare each kind, per provider, for `topology.mjs drift`: Terraform /
 * OpenTofu resource types, and for Azure the Bicep / ARM type as well. A kind with no row (users,
 * internet, an external SaaS) is not expected in IaC. The patterns are anchored by the reader.
 */
export const IAC = {
  aws: {
    vm: 'aws_instance|aws_launch_template|aws_autoscaling_group', 'container-service': 'aws_ecs_service',
    kubernetes: 'aws_eks_cluster', 'serverless-function': 'aws_lambda_function', 'container-registry': 'aws_ecr_repository',
    'sql-database': 'aws_db_instance|aws_rds_cluster', 'nosql-database': 'aws_dynamodb_table',
    cache: 'aws_elasticache_cluster|aws_elasticache_replication_group|aws_elasticache_serverless_cache',
    'object-storage': 'aws_s3_bucket', 'file-storage': 'aws_efs_file_system', 'data-warehouse': 'aws_redshift_cluster|aws_redshiftserverless_workgroup',
    search: 'aws_opensearch_domain', queue: 'aws_sqs_queue', pubsub: 'aws_sns_topic', 'event-bus': 'aws_cloudwatch_event_bus',
    stream: 'aws_kinesis_stream', email: 'aws_sesv2_email_identity|aws_ses_domain_identity', 'load-balancer': 'aws_lb|aws_alb',
    'network-load-balancer': 'aws_lb', cdn: 'aws_cloudfront_distribution', dns: 'aws_route53_zone|aws_route53_record',
    waf: 'aws_wafv2_web_acl', ddos: 'aws_shield_protection', 'api-gateway': 'aws_api_gateway_rest_api|aws_apigatewayv2_api',
    'nat-gateway': 'aws_nat_gateway', 'internet-gateway': 'aws_internet_gateway', vpn: 'aws_vpn_connection',
    secrets: 'aws_secretsmanager_secret', kms: 'aws_kms_key', identity: 'aws_cognito_user_pool',
    logging: 'aws_cloudwatch_log_group', monitoring: 'aws_cloudwatch_metric_alarm|aws_cloudwatch_dashboard',
    vpc: 'aws_vpc', 'public-subnet': 'aws_subnet', 'private-subnet': 'aws_subnet', 'security-group': 'aws_security_group',
    'auto-scaling': 'aws_autoscaling_group',
  },
  azure: {
    vm: 'azurerm_linux_virtual_machine|azurerm_windows_virtual_machine|azurerm_linux_virtual_machine_scale_set|azurerm_orchestrated_virtual_machine_scale_set|Microsoft\.Compute/virtualMachines|Microsoft\.Compute/virtualMachineScaleSets',
    'container-service': 'azurerm_container_app|Microsoft\.App/containerApps', kubernetes: 'azurerm_kubernetes_cluster|Microsoft\.ContainerService/managedClusters',
    'serverless-function': 'azurerm_linux_function_app|azurerm_windows_function_app|azurerm_function_app_flex_consumption',
    'container-registry': 'azurerm_container_registry|Microsoft\.ContainerRegistry/registries',
    'sql-database': 'azurerm_postgresql_flexible_server|azurerm_mssql_server|azurerm_mysql_flexible_server|Microsoft\.DBforPostgreSQL/flexibleServers|Microsoft\.Sql/servers|Microsoft\.DBforMySQL/flexibleServers',
    'nosql-database': 'azurerm_cosmosdb_account|Microsoft\.DocumentDB/databaseAccounts', cache: 'azurerm_redis_cache|azurerm_managed_redis|Microsoft\.Cache/redis',
    'object-storage': 'azurerm_storage_account|Microsoft\.Storage/storageAccounts', 'file-storage': 'azurerm_storage_share',
    'data-warehouse': 'azurerm_synapse_workspace|Microsoft\.Synapse/workspaces', search: 'azurerm_search_service|Microsoft\.Search/searchServices',
    queue: 'azurerm_servicebus_queue|azurerm_servicebus_namespace|Microsoft\.ServiceBus/namespaces', pubsub: 'azurerm_servicebus_topic|azurerm_servicebus_namespace|Microsoft\.ServiceBus/namespaces',
    'event-bus': 'azurerm_eventgrid_topic|azurerm_eventgrid_namespace|Microsoft\.EventGrid/topics', stream: 'azurerm_eventhub_namespace|azurerm_eventhub|Microsoft\.EventHub/namespaces',
    email: 'azurerm_communication_service|azurerm_email_communication_service', 'load-balancer': 'azurerm_application_gateway|Microsoft\.Network/applicationGateways',
    'network-load-balancer': 'azurerm_lb|Microsoft\.Network/loadBalancers', cdn: 'azurerm_cdn_frontdoor_profile|Microsoft\.Cdn/profiles',
    dns: 'azurerm_dns_zone|Microsoft\.Network/dnsZones', waf: 'azurerm_web_application_firewall_policy|azurerm_cdn_frontdoor_firewall_policy',
    ddos: 'azurerm_network_ddos_protection_plan', 'api-gateway': 'azurerm_api_management|Microsoft\.ApiManagement/service',
    'nat-gateway': 'azurerm_nat_gateway|Microsoft\.Network/natGateways', 'internet-gateway': 'azurerm_public_ip|Microsoft\.Network/publicIPAddresses',
    vpn: 'azurerm_virtual_network_gateway', secrets: 'azurerm_key_vault|Microsoft\.KeyVault/vaults', kms: 'azurerm_key_vault|azurerm_key_vault_key|Microsoft\.KeyVault/vaults',
    iam: 'azurerm_user_assigned_identity|Microsoft\.ManagedIdentity/userAssignedIdentities',
    logging: 'azurerm_log_analytics_workspace|Microsoft\.OperationalInsights/workspaces', tracing: 'azurerm_application_insights|Microsoft\.Insights/components',
    vnet: 'azurerm_virtual_network|Microsoft\.Network/virtualNetworks', subnet: 'azurerm_subnet|Microsoft\.Network/virtualNetworks/subnets',
    'resource-group': 'azurerm_resource_group|Microsoft\.Resources/resourceGroups',
  },
  gcp: {
    vm: 'google_compute_instance|google_compute_instance_template|google_compute_instance_group_manager|google_compute_region_instance_group_manager',
    'container-service': 'google_cloud_run_v2_service|google_cloud_run_service', kubernetes: 'google_container_cluster',
    'serverless-function': 'google_cloudfunctions2_function|google_cloudfunctions_function', 'container-registry': 'google_artifact_registry_repository',
    'sql-database': 'google_sql_database_instance|google_alloydb_cluster|google_spanner_instance', 'nosql-database': 'google_firestore_database',
    cache: 'google_redis_instance|google_memorystore_instance', 'object-storage': 'google_storage_bucket', 'file-storage': 'google_filestore_instance',
    'data-warehouse': 'google_bigquery_dataset', queue: 'google_cloud_tasks_queue', pubsub: 'google_pubsub_topic', stream: 'google_pubsub_topic',
    'event-bus': 'google_eventarc_trigger', 'load-balancer': 'google_compute_url_map|google_compute_region_url_map',
    'network-load-balancer': 'google_compute_forwarding_rule', cdn: 'google_compute_backend_bucket|google_compute_backend_service',
    dns: 'google_dns_managed_zone', waf: 'google_compute_security_policy', ddos: 'google_compute_security_policy',
    'api-gateway': 'google_apigee_organization|google_api_gateway_gateway', 'nat-gateway': 'google_compute_router_nat',
    'internet-gateway': 'google_compute_global_address|google_compute_address', vpn: 'google_compute_ha_vpn_gateway|google_compute_vpn_gateway',
    vpn: 'google_compute_ha_vpn_gateway|google_compute_vpn_gateway',
    secrets: 'google_secret_manager_secret', kms: 'google_kms_crypto_key|google_kms_key_ring', identity: 'google_identity_platform_config',
    vpc: 'google_compute_network', subnet: 'google_compute_subnetwork', project: 'google_project',
    'instance-group': 'google_compute_instance_group_manager|google_compute_region_instance_group_manager',
  },
  alibaba: {
    vm: 'alicloud_instance|alicloud_ess_scaling_group', 'container-service': 'alicloud_sae_application',
    kubernetes: 'alicloud_cs_managed_kubernetes|alicloud_cs_kubernetes', 'serverless-function': 'alicloud_fcv3_function|alicloud_fcv2_function|alicloud_fc_function',
    'container-registry': 'alicloud_cr_ee_instance|alicloud_cr_repo', 'sql-database': 'alicloud_polardb_cluster|alicloud_db_instance',
    'nosql-database': 'alicloud_mongodb_instance', cache: 'alicloud_kvstore_instance', 'object-storage': 'alicloud_oss_bucket',
    'file-storage': 'alicloud_nas_file_system', 'data-warehouse': 'alicloud_maxcompute_project', search: 'alicloud_elasticsearch_instance',
    queue: 'alicloud_message_service_queue|alicloud_mns_queue|alicloud_rocketmq_instance', pubsub: 'alicloud_message_service_topic|alicloud_mns_topic',
    stream: 'alicloud_alikafka_instance', 'load-balancer': 'alicloud_alb_load_balancer', 'network-load-balancer': 'alicloud_nlb_load_balancer|alicloud_slb_load_balancer',
    cdn: 'alicloud_cdn_domain_new', dns: 'alicloud_alidns_domain|alicloud_alidns_record', waf: 'alicloud_wafv3_instance|alicloud_waf_instance',
    'api-gateway': 'alicloud_api_gateway_group', 'nat-gateway': 'alicloud_nat_gateway', 'internet-gateway': 'alicloud_eip_address',
    vpn: 'alicloud_vpn_gateway', secrets: 'alicloud_kms_secret', kms: 'alicloud_kms_key', iam: 'alicloud_ram_role',
    logging: 'alicloud_log_project|alicloud_log_store', vpc: 'alicloud_vpc', vswitch: 'alicloud_vswitch',
  },
  oci: {
    vm: 'oci_core_instance|oci_core_instance_pool', 'container-service': 'oci_container_instances_container_instance',
    kubernetes: 'oci_containerengine_cluster', 'serverless-function': 'oci_functions_function', 'container-registry': 'oci_artifacts_container_repository',
    'sql-database': 'oci_database_autonomous_database|oci_mysql_mysql_db_system|oci_psql_db_system', 'nosql-database': 'oci_nosql_table',
    cache: 'oci_redis_redis_cluster', 'object-storage': 'oci_objectstorage_bucket', 'file-storage': 'oci_file_storage_file_system',
    queue: 'oci_queue_queue', pubsub: 'oci_ons_notification_topic', 'event-bus': 'oci_events_rule', stream: 'oci_streaming_stream',
    email: 'oci_email_sender', 'load-balancer': 'oci_load_balancer_load_balancer|oci_load_balancer',
    'network-load-balancer': 'oci_network_load_balancer_network_load_balancer', dns: 'oci_dns_zone',
    waf: 'oci_waf_web_app_firewall|oci_waf_web_app_firewall_policy', 'api-gateway': 'oci_apigateway_gateway',
    'nat-gateway': 'oci_core_nat_gateway', 'internet-gateway': 'oci_core_internet_gateway', vpn: 'oci_core_ipsec',
    secrets: 'oci_vault_secret', kms: 'oci_kms_key|oci_kms_vault', iam: 'oci_identity_policy', logging: 'oci_logging_log|oci_logging_log_group',
    vcn: 'oci_core_vcn', subnet: 'oci_core_subnet', compartment: 'oci_identity_compartment',
  },
};

/** Kubernetes objects as they appear in a manifest (`kind: Deployment`) or a Terraform `kubernetes_*` resource. */
export const K8S_IAC = {
  'k8s-deployment': 'Deployment|kubernetes_deployment(?:_v1)?', 'k8s-statefulset': 'StatefulSet|kubernetes_stateful_set(?:_v1)?',
  'k8s-daemonset': 'DaemonSet|kubernetes_daemon_set_v1|kubernetes_daemonset', 'k8s-service': 'Service|kubernetes_service(?:_v1)?',
  'k8s-ingress': 'Ingress|kubernetes_ingress(?:_v1)?', 'k8s-hpa': 'HorizontalPodAutoscaler|kubernetes_horizontal_pod_autoscaler(?:_v2)?',
  'k8s-job': 'Job|kubernetes_job(?:_v1)?', 'k8s-cronjob': 'CronJob|kubernetes_cron_job(?:_v1)?', 'k8s-configmap': 'ConfigMap|kubernetes_config_map(?:_v1)?',
  'k8s-secret': 'Secret|ExternalSecret|SealedSecret|kubernetes_secret(?:_v1)?', 'k8s-pvc': 'PersistentVolumeClaim|kubernetes_persistent_volume_claim(?:_v1)?',
  'k8s-netpol': 'NetworkPolicy|kubernetes_network_policy(?:_v1)?', 'k8s-sa': 'ServiceAccount|kubernetes_service_account(?:_v1)?',
  namespace: 'Namespace|kubernetes_namespace(?:_v1)?',
};
