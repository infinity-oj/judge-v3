import {RPCRequest} from "../interfaces";
import {BinaryMetadata} from "./executable";

export async function pullTaskFromServer(): Promise<RPCRequest[]> {
    // TODO: pull tasks
    return null
}

export async function pushExecutableToServer(binary: Buffer, metaData: BinaryMetadata): Promise<void> {

}
