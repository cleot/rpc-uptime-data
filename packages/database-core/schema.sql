-- D1 Database Schema for RPC Uptime Monitoring

-- Drop tables if they exist (useful for development/resetting)
DROP TABLE IF EXISTS ValidatorRPC;
DROP TABLE IF EXISTS RPCMeasurement;
DROP TABLE IF EXISTS RPCMeasurementHeader;
DROP TABLE IF EXISTS ValidatorGroupValidator;
DROP TABLE IF EXISTS ValidatorGroup;
DROP TABLE IF EXISTS ValidatorName;
DROP TABLE IF EXISTS Validator;
DROP TABLE IF EXISTS Network;

-- Networks table
CREATE TABLE Network (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    networkName TEXT NOT NULL UNIQUE,
    -- createdAt TEXT DEFAULT CURRENT_TIMESTAMP, -- Optional: Add if needed
    -- updatedAt TEXT DEFAULT CURRENT_TIMESTAMP  -- Optional: Add if needed
);

-- Validators table
CREATE TABLE Validator (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    networkId INTEGER NOT NULL,
    address TEXT NOT NULL,
    rpcUrl TEXT, -- Store the last known RPC URL here
    -- createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    -- updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (networkId) REFERENCES Network(id) ON DELETE CASCADE,
    UNIQUE (networkId, address)
);
CREATE INDEX IDX_Validator_networkId ON Validator(networkId);
CREATE INDEX IDX_Validator_address ON Validator(address);

-- Validator Names table (tracks historical names)
CREATE TABLE ValidatorName (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    networkId INTEGER NOT NULL,
    validatorId INTEGER NOT NULL,
    validatorName TEXT NOT NULL, -- Stored as plain text
    fromBlock INTEGER NOT NULL,
    toBlock INTEGER, -- NULL indicates current name
    -- createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    -- updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (networkId) REFERENCES Network(id) ON DELETE CASCADE,
    FOREIGN KEY (validatorId) REFERENCES Validator(id) ON DELETE CASCADE,
    UNIQUE (networkId, validatorId, fromBlock)
);
CREATE INDEX IDX_ValidatorName_lookup ON ValidatorName(networkId, validatorId, fromBlock, toBlock);

-- Validator Groups table
CREATE TABLE ValidatorGroup (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    networkId INTEGER NOT NULL,
    address TEXT NOT NULL,
    name TEXT, -- Stored as plain text
    -- createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    -- updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (networkId) REFERENCES Network(id) ON DELETE CASCADE,
    UNIQUE (networkId, address)
);
CREATE INDEX IDX_ValidatorGroup_networkId ON ValidatorGroup(networkId);

-- Validator Group Membership table (tracks historical membership)
CREATE TABLE ValidatorGroupValidator (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    networkId INTEGER NOT NULL,
    validatorId INTEGER NOT NULL,
    validatorGroupId INTEGER NOT NULL,
    fromEpoch INTEGER NOT NULL,
    toEpoch INTEGER, -- NULL indicates current membership
    -- createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    -- updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (networkId) REFERENCES Network(id) ON DELETE CASCADE,
    FOREIGN KEY (validatorId) REFERENCES Validator(id) ON DELETE CASCADE,
    FOREIGN KEY (validatorGroupId) REFERENCES ValidatorGroup(id) ON DELETE CASCADE,
    UNIQUE (networkId, validatorId, validatorGroupId, fromEpoch)
);
CREATE INDEX IDX_ValidatorGroupValidator_lookup ON ValidatorGroupValidator(networkId, validatorId, fromEpoch, toEpoch);
CREATE INDEX IDX_ValidatorGroupValidator_group ON ValidatorGroupValidator(networkId, validatorGroupId, fromEpoch, toEpoch);


-- RPC Measurement Header table (represents one monitoring run)
CREATE TABLE RPCMeasurementHeader (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    networkId INTEGER NOT NULL,
    measurementId TEXT NOT NULL UNIQUE, -- UUID for the run
    executedAt TEXT NOT NULL, -- ISO 8601 timestamp
    -- createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (networkId) REFERENCES Network(id) ON DELETE CASCADE
);
CREATE INDEX IDX_RPCMeasurementHeader_executedAt ON RPCMeasurementHeader(executedAt);

-- RPC Measurement table (stores individual check results for a run)
CREATE TABLE RPCMeasurement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    networkId INTEGER NOT NULL,
    validatorId INTEGER NOT NULL,
    rpcMeasurementHeaderId INTEGER NOT NULL,
    up INTEGER NOT NULL, -- 0 for false, 1 for true
    blockNumber INTEGER,
    statusCode INTEGER,
    responseTimeMs INTEGER,
    -- createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (networkId) REFERENCES Network(id) ON DELETE CASCADE,
    FOREIGN KEY (validatorId) REFERENCES Validator(id) ON DELETE CASCADE,
    FOREIGN KEY (rpcMeasurementHeaderId) REFERENCES RPCMeasurementHeader(id) ON DELETE CASCADE
);
CREATE INDEX IDX_RPCMeasurement_lookup ON RPCMeasurement(networkId, validatorId, rpcMeasurementHeaderId);
CREATE INDEX IDX_RPCMeasurement_header ON RPCMeasurement(rpcMeasurementHeaderId);

-- Validator RPC table (tracks RPC URL used during a specific measurement run)
CREATE TABLE ValidatorRPC (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    networkId INTEGER NOT NULL,
    validatorId INTEGER NOT NULL,
    rpcMeasurementHeaderId INTEGER NOT NULL,
    rpcUrl TEXT NOT NULL,
    -- createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (networkId) REFERENCES Network(id) ON DELETE CASCADE,
    FOREIGN KEY (validatorId) REFERENCES Validator(id) ON DELETE CASCADE,
    FOREIGN KEY (rpcMeasurementHeaderId) REFERENCES RPCMeasurementHeader(id) ON DELETE CASCADE
);
CREATE INDEX IDX_ValidatorRPC_lookup ON ValidatorRPC(networkId, validatorId, rpcMeasurementHeaderId);