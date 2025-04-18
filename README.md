# RPC Uptime Data

A service for monitoring and reporting RPC endpoint uptime and performance metrics for the Celo blockchain networks (mainnet, baklava).

## Overview

This project consists of:

1. **API Service**: Express-based REST API for retrieving RPC uptime data
2. **Indexers**: Services that collect and store RPC performance metrics
3. **Database**: MySQL database for persistent storage
4. **Cache**: Redis for API performance optimization

## Project Structure

```
src/
├── index.ts                 # Main application entry point for Express API and routes
├── indexer/                 
│   ├── validator.ts         # Validator group membership tracking
│   ├── rpc.ts               # RPC functions
│   ├── types.ts             # TypeScript type definitions for indexer
│   └── index.ts             # Entrypoint for RPC indexer 
├── service/                 
│   ├── blockchain.ts        # Blockchain interaction service
│   ├── database.ts          # Database access service
│   ├── Accounts.ts          # Accounts ABI for naming validators
│   └── cache.ts             # Caching service
├── utils/                   
│   ├── types.ts             # TypeScript type definitions (shared across services)
│   ├── axios_util.ts        # Axios utility functions
│   └── index.ts             # Main utility functions
└── db/                  
│   ├── models/             # Sequelize models
│   └── index.ts            # Main database service
└── .env.template           # Environment variables
└── docker-compose.yml      # Docker Compose configuration
└── Dockerfile              # Dockerfile for building the Docker image
└── package.json            # Node.js package configuration
└── tsconfig.json           # TypeScript configuration
└── README.md               # This file
└── yarn.lock               # Yarn package lock file
└── .gitignore              # Git ignore file
└── gitattributes           # Git attributes
└── .prettierrc             # Prettier configuration
└── prettierignore          # Prettier ignore file
└── eslintignore            # ESLint ignore file
└── eslintrc.js             # ESLint configuration
└── LICENSE                 # License
└── .sequelizerc            # Sequelize configuration
```
## Features

- REST API for querying RPC endpoint performance metrics
- Indexers for mainnet and baklava networks
- Health check endpoints
- Data filtering by time range and validator addresses
- Data export functionality
- Redis caching for improved performance

## API Endpoints

- `GET /:networkName/health` - Health check for a specific network
- `GET /:networkName/rpcMeasurements` - Get RPC performance measurements
- `GET /:networkName/exportRpcMeasurements` - Export RPC measurements data
- `GET /:networkName/rpcValidators` - Get validator to RPC endpoint mappings

## Setup and Running

1. Clone the repository
2. Install dependencies:
   ```
   yarn
   ```
3. Create a `.env` file from `.env.template`
4. Run Redis locally:
   ```
   docker run -p 6379:6379 -it redis/redis-stack-server:latest
   ```
5. Start the development server:
   ```
   yarn dev
   ```

### Using Docker Compose

To run the entire stack (API, indexers, MySQL, Redis):

```
docker-compose up -d
```

This will start:
- API service on port 3006
- MySQL database
- Redis cache
- RPC indexers for mainnet and baklava networks

## Environment Variables

Key environment variables:
- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PWD`: Database connection details
- `REDIS_URL`: Redis connection string
- `MAINNET_EXTERNAL_NODE`, `BAKLAVA_EXTERNAL_NODE`: RPC node URLs
- `FORCE_SYNC`: Whether to force database sync (boolean)
- `RPC_TIMER_MS`: Interval for RPC checks (default: 300000ms)
- `CORS_URLS`: Allowed CORS origins

## Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## Related Projects

This service is part of the Celo blockchain monitoring infrastructure and serves the [Vido](https://github.com/celo-org/vido) front-end and will be duplicated by Score Management committee members to have multiple sources of truth for RPC endpoint uptime and performance metrics.


