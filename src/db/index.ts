import { Network } from "./models/Network";
import { Validator } from "./models/Validator";
import { ValidatorGroup } from "./models/ValidatorGroup";
import { ValidatorName } from "./models/ValidatorName";
import { ValidatorGroupValidator } from "./models/ValidatorGroupValidator";
import { ValidatorRPC } from "./models/ValidatorRPC";
import { RPCMeasurement } from "./models/RPCMeasurement";
import { RPCMeasurementHeader } from "./models/RPCMeasurementHeader";

export {
	Network,
	Validator,
	ValidatorGroup,
	ValidatorName,
	ValidatorGroupValidator,
	ValidatorRPC,
	RPCMeasurementHeader,
	RPCMeasurement,
};

// Order of models is important here for custom scope resolution
//
export const MODELS = [
	Network,

	Validator,
	ValidatorGroup,
	ValidatorGroupValidator,

	ValidatorName,
	ValidatorRPC,
	RPCMeasurementHeader,
	RPCMeasurement,
];
