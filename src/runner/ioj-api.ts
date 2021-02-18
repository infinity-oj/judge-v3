import { RPCRequest } from "../interfaces";

import axios from "axios";

export async function login(
  username: String,
  password: String
): Promise<Boolean> {
  return true;
}

export async function pull(type: String): Promise<RPCRequest> {
  axios.get("/user?ID=12345");
  return null;
}

export async function reserve(task: RPCRequest): Promise<RPCRequest> {

  return null;
}

export async function push(task: RPCRequest): Promise<RPCRequest> {
  return null;
}
