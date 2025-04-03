import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { D1DataAccessLayer, IDataAccessLayer, MeasurementFilter, ValidatorRecord } from '@rpc-uptime/database-core';
import { validator } from 'hono/validator'; // Import Hono's validator middleware
import { ApiValidator } from '@rpc-uptime/shared-types';

// Define the expected environment bindings based on wrangler.toml
export type Env = {
	DB: D1Database;
	CACHE_KV: KVNamespace;
	// API_KEY: string;
	// EXAMPLE_VAR: string;
};

// Instantiate the Hono app with the environment types
const app = new Hono<{ Bindings: Env }>();

// --- Middleware ---

// Add CORS middleware
app.use('*', cors({
	origin: '*', // TODO: Restrict this in production!
	allowMethods: ['GET', 'OPTIONS'], // Limit allowed methods
	allowHeaders: ['Content-Type', 'Authorization'],
}));

// Simple request logging middleware
app.use('*', async (c, next) => {
	const start = Date.now();
	await next();
	const duration = Date.now() - start;
	console.log(
		`Request: ${c.req.method} ${c.req.url} - Status: ${c.res.status} - Duration: ${duration}ms`
	);
});

// --- Routes ---

// Basic root route
app.get('/', (c) => {
	return c.json({ message: 'RPC Uptime API Worker is running!' });
});

// Health check endpoint (basic)
app.get('/health', (c) => {
	// TODO: Implement a proper health check that verifies DB/KV connections
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- RPC Measurements Routes ---

const networks = ['mainnet', 'alfajores', 'baklava']; // Allowed network names

// Middleware to validate network parameter
const validateNetwork = () =>
	validator('param', (value, c) => {
		const networkName = value['networkName'];
		if (!networkName || !networks.includes(networkName)) {
			return c.json({ error: 'Invalid network name specified. Use mainnet, alfajores, or baklava.' }, 400);
		}
		return { networkName }; // Return validated value
	});

// Common validator for measurement query parameters
const measurementQueryValidator = validator('query', (value, c) => {
	// Basic validation/parsing for query params
	let fromEpochSeconds: number | undefined = undefined;
	const fromRaw = value['fromEpochSeconds'];
	if (fromRaw) {
		// Handle potential array from query string, take the first element if array
		const fromStr = Array.isArray(fromRaw) ? fromRaw[0] : fromRaw;
		if (typeof fromStr === 'string') {
			fromEpochSeconds = parseInt(fromStr, 10);
			if (isNaN(fromEpochSeconds)) {
				return c.json({ error: 'Invalid fromEpochSeconds parameter: Must be a number.' }, 400);
			}
		} else {
			// Handle case where it's not a string or array (unexpected)
			return c.json({ error: 'Invalid format for fromEpochSeconds parameter.' }, 400);
		}
	}

	let toEpochSeconds: number | undefined = undefined;
	const toRaw = value['toEpochSeconds'];
	if (toRaw) {
		// Handle potential array from query string, take the first element if array
		const toStr = Array.isArray(toRaw) ? toRaw[0] : toRaw;
		if (typeof toStr === 'string') {
			toEpochSeconds = parseInt(toStr, 10);
			if (isNaN(toEpochSeconds)) {
				return c.json({ error: 'Invalid toEpochSeconds parameter: Must be a number.' }, 400);
			}
		} else {
			// Handle case where it's not a string or array (unexpected)
			return c.json({ error: 'Invalid format for toEpochSeconds parameter.' }, 400);
		}
	}

	// Handle filterAddresses (can be string or array, we want array)
	let filterAddresses: string[] | undefined = undefined;
	const filterRaw = value['filterAddresses'];
	if (typeof filterRaw === 'string') {
		filterAddresses = filterRaw.split(',').map(addr => addr.trim()).filter(addr => addr.length > 0);
	} else if (Array.isArray(filterRaw)) {
		// If it's already an array (e.g., ?filterAddresses=a&filterAddresses=b)
		// flatten it and split any comma-separated values within elements
		filterAddresses = filterRaw.flatMap(item =>
			typeof item === 'string' ? item.split(',').map(addr => addr.trim()).filter(addr => addr.length > 0) : []
		);
	}
	// Ensure unique addresses if needed
	if (filterAddresses) {
		filterAddresses = [...new Set(filterAddresses)];
	}

	// Optional: Add further validation like checking date ranges if needed

	return { fromEpochSeconds, toEpochSeconds, filterAddresses };
});


// GET /:networkName/rpcMeasurements
app.get(
	'/:networkName/rpcMeasurements',
	validateNetwork(),
	measurementQueryValidator, // Use common query validator
	async (c) => {
		const { networkName } = c.req.valid('param');
		const { fromEpochSeconds, toEpochSeconds, filterAddresses } = c.req.valid('query');
		const dal: IDataAccessLayer = new D1DataAccessLayer(c.env.DB);

		try {
			const filter: MeasurementFilter = {
				networkName,
				fromEpochSeconds,
				toEpochSeconds,
				validatorAddresses: filterAddresses,
			};

			// TODO: Implement caching using c.env.CACHE_KV

			const measurements = await dal.getMeasurements(filter);

			if (!measurements || measurements.length === 0) { // Check for empty array too
				return c.json({ message: 'RPC Measurements not found for the specified criteria.' }, 404);
			}

			return c.json(measurements);
		} catch (error: any) {
			console.error(`Error fetching RPC measurements for ${networkName}:`, error);
			return c.json({ error: 'Failed to fetch RPC measurements', message: error.message }, 500);
		}
	}
);

// GET /:networkName/rpcValidators
app.get(
	'/:networkName/rpcValidators',
	validateNetwork(),
	async (c) => {
		const { networkName } = c.req.valid('param');
		const dal: IDataAccessLayer = new D1DataAccessLayer(c.env.DB);

		try {
			const network = await dal.getOrInsertNetwork(networkName);
			if (!network) {
				// Should not happen due to getOrInsertNetwork logic, but good practice
				return c.json({ error: `Network ${networkName} configuration not found.` }, 404);
			}

			// TODO: Implement caching for validator details

			// Fetch all validators first to get their IDs
			const allValidators: ValidatorRecord[] = await dal.getAllValidators(network.id);
			if (!allValidators || allValidators.length === 0) {
				return c.json([]); // Return empty array if no validators found
			}

			const validatorIds = allValidators.map(v => v.id);

			// Fetch enriched details (name, group, rpcUrl) for these validators
			const validatorDetails: ApiValidator[] = await dal.getValidatorDetails(network.id, validatorIds);

			return c.json(validatorDetails);

		} catch (error: any) {
			console.error(`Error fetching RPC validators for ${networkName}:`, error);
			return c.json({ error: 'Failed to fetch RPC validators', message: error.message }, 500);
		}
	}
);

// GET /:networkName/exportRpcMeasurements
app.get(
	'/:networkName/exportRpcMeasurements',
	validateNetwork(),
	measurementQueryValidator, // Use common query validator
	async (c) => {
		const { networkName } = c.req.valid('param');
		const { fromEpochSeconds, toEpochSeconds, filterAddresses } = c.req.valid('query');
		const dal: IDataAccessLayer = new D1DataAccessLayer(c.env.DB);

		try {
			const filter: MeasurementFilter = {
				networkName,
				fromEpochSeconds,
				toEpochSeconds,
				validatorAddresses: filterAddresses,
			};

			// Caching might not be suitable for export endpoint, or use a different strategy

			const exportData = await dal.getMeasurementsForExport(filter);

			if (!exportData || exportData.length === 0) {
				return c.json({ message: 'RPC Measurements not found for export for the specified criteria.' }, 404);
			}

			// Optional: Could format as CSV here instead of JSON
			return c.json(exportData);

		} catch (error: any) {
			console.error(`Error exporting RPC measurements for ${networkName}:`, error);
			return c.json({ error: 'Failed to export RPC measurements', message: error.message }, 500);
		}
	}
);


// --- Error Handling ---

// Generic error handler
app.onError((err, c) => {
	console.error(`Unhandled Error: ${err}`, err.stack);
	return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

// Not Found handler
app.notFound((c) => {
	return c.json({ error: 'Not Found', message: `Route ${c.req.method} ${c.req.url} not found.` }, 404);
});


// Export the app's fetch handler
export default app;