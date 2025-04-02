import { ContractKit, CeloContract, newKit } from "@celo/contractkit";
import * as Address from "@celo/utils/lib/address";
import { AddressRegistry } from "@celo/contractkit/lib/address-registry";
import { IGroupMembership } from "../utils/types";
import {
	GroupMembership,
	ValidatorsWrapper,
} from "@celo/contractkit/lib/wrappers/Validators";
import * as utils from "../utils";
import { AbiItem } from "web3-utils";
import abi from "./Accounts.json";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function getBlockNumber(kit: ContractKit): Promise<number> {
	const blockNumber = await kit.web3.eth.getBlockNumber();
	return blockNumber;
}
export { getBlockNumber as getCurrentBlockNumber };

export function isValidAddress(address: string): boolean {
	return Address.isValidAddress(address);
}

export function getNewKit(nodeUrl: string): ContractKit {
	if (!nodeUrl) {
		nodeUrl = process.env.NODE_URL;
	}
	return newKit(nodeUrl);
}

export async function getAccountName(
	kit: ContractKit,
	address: string,
	atBlock: number
) {
	let accountName = address;

	if (address === ZERO_ADDRESS) return "Zero Address";

	try {
		const accounts = await kit.contracts.getAccounts();
		const validatorName = await accounts.getName(address, atBlock);
		if (!validatorName) {
			accountName = address;
			utils.log(
				`getAccountName() Name for ${address} at block ${atBlock} is unknown so setting to ${address}...`
			);
		} else {
			accountName = validatorName;
			utils.log(
				`getAccountName() Name for ${address} at block ${atBlock} is ${validatorName}...`
			);
		}
	} catch (e) {
		utils.log(
			`getAccountName() Error retrieving account name for ${address} at block ${atBlock}: ${e}`
		);
		accountName = address;
	}
	return accountName;
}

async function signerToAccount(
	kit: ContractKit,
	signer: string,
	blockNumber?: number
): Promise<string> {
	const registry = new AddressRegistry(kit.connection);
	const accountsAddress = await registry.addressFor(CeloContract.Accounts);
	const accounts = new kit.web3.eth.Contract(
		abi.abi as AbiItem[],
		accountsAddress
	);
	const account = await accounts.methods
		.signerToAccount(signer)
		.call({}, blockNumber);
	return account;
}

export async function getValidatorFromSigner(
	kit: ContractKit,
	signerAddress: string,
	blockNumber?: number
): Promise<string> {
	let validatorAddress;
	try {
		if (!blockNumber) {
			const accounts = await kit.contracts.getAccounts();
			validatorAddress = await accounts.signerToAccount(signerAddress);
		} else {
			validatorAddress = await signerToAccount(
				kit,
				signerAddress,
				blockNumber
			);
		}
	} catch (e) {
		utils.log(
			`getValidatorFromSigner() Error retrieving validator address from signer ${e}`
		);
		if (blockNumber) {
			utils.log(
				`getValidatorFromSigner() Trying again but without a block number specified`
			);
			return await getValidatorFromSigner(kit, signerAddress);
		}
		utils.log(
			`getValidatorFromSigner() Could not find validator address for ${signerAddress}, setting it to ${signerAddress} for now...`
		);
		validatorAddress = signerAddress;
	}
	return validatorAddress;
}

export async function getMinerForBlock(
	blockNumber: number,
	kit: ContractKit
): Promise<string> {
	const block = await kit.web3.eth.getBlock(blockNumber);
	return block.miner || ZERO_ADDRESS;
}

export async function getTimestampForBlock(
	blockNumber: number,
	kit: ContractKit
): Promise<string | number> {
	const block = await kit.web3.eth.getBlock(blockNumber);
	return block.timestamp;
}

export async function getValidatorGroups(
	kit: ContractKit,
	validator: string
): Promise<IGroupMembership[]> {
	const validators: ValidatorsWrapper = await kit.contracts.getValidators();
	const groups: GroupMembership[] =
		await validators.getValidatorMembershipHistory(validator);
	const array: IGroupMembership[] = groups.map((g) => {
		const groupMembership: IGroupMembership = {
			epoch: g.epoch,
			group: g.group,
		};
		return groupMembership;
	});
	return array;
}
