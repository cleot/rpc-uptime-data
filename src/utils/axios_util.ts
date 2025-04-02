import axios from "axios";

const TIMEOUT = 5000;
const HEADERS = {
	"Content-Type": "application/json;charset=utf-8",
	Accept: "*/*",
};

export function createAxiosInstance(host: string) {
	return axios.create({
		baseURL: host,
		timeout: TIMEOUT,
		headers: HEADERS,
	});
}
