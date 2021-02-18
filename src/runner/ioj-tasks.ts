import winston = require("winston");
import { RPCRequest } from "../interfaces";
import { BinaryMetadata } from "./executable";
import { pull, reserve } from "./ioj-api";

export async function pullTaskFromServer(): Promise<RPCRequest[]> {
  // TODO: pull tasks
  return null;
}

export async function pushExecutableToServer(
  binary: Buffer,
  metaData: BinaryMetadata
): Promise<void> {}

export async function waitForTask(): Promise<RPCRequest> {
  const interval = setInterval(async () => {
    const task = await pull("builder/clang");

    if (await reserve(task)) {
      winston.info(`Got runner task`);
      clearInterval(interval);
      return task;
    }
  }, 1500);
}
