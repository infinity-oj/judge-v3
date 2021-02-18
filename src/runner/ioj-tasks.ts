import winston = require("winston");
import {RPCRequest} from "../interfaces";
import {BinaryMetadata} from "./executable";
import {pull, reserve} from "./ioj-api";

export async function pullTaskFromServer(): Promise<RPCRequest> {
    const interval = setInterval(async () => {
        const task = await pull("builder/clang");
        if (await reserve(task)) {
            winston.info(`Got runner task`);
            clearInterval(interval);
            return task;
        } else {
            winston.info('Runner task not got')
        }
    }, 1500);
    return null;
}

export async function pushExecutableToServer(
    binary: Buffer,
    metaData: BinaryMetadata
): Promise<void> {
}

export async function waitForTask(handle: (task: RPCRequest) => Promise<any>) {
    const task = await pullTaskFromServer();
    if (task == null) {
        return null
    }
    try {
        const result = await handle(task);
    } catch (err) {
        winston.error(`Fail to handle task ${task.type}, error message: ${err.message}`)
    }
}
