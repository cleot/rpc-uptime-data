/**
 * Represents a single measurement cycle for multiple validators.
 */
export interface ApiRPCMeasurement {
  measurementId: string; // Unique ID for this measurement run
  executedAt: Date; // Timestamp when the measurement was taken
  validators: ApiValidatorMeasurement[]; // Array of measurements for each validator in this run
}

/**
 * Represents the measurement result for a single validator within a measurement cycle.
 */
export interface ApiValidatorMeasurement {
  validatorAddress: string; // Address of the validator
  up: boolean; // Whether the RPC endpoint was reachable and responsive
  blockNumber: number | null; // Block number reported by the RPC (null if down)
  responseTimeMs: number | null; // Response time in milliseconds (null if down)
  statusCode: number | null; // HTTP status code received (null if request failed)
}

/**
 * Represents a flattened structure for exporting a single validator's measurement.
 */
export interface ApiRPCMeasurementExport {
  measurementId: string; // Unique ID for the measurement run
  timestamp: Date; // Timestamp when the measurement was taken
  validatorAddress: string; // Address of the validator
  responseTimeMs: number | null;
  blockNumber: number | null;
  up: boolean;
  statusCode: number | null;
}

/**
 * Represents basic information about a validator, potentially including its RPC URL.
 */
export interface ApiValidator {
  address: string; // Validator's address
  validatorName: string | null; // Validator's name (if known)
  validatorGroup: string | null; // Validator group name (if known)
  rpcUrl?: string | null; // Validator's advertised RPC URL (if available)
}