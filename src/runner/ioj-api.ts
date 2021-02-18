import {RPCRequest} from "../interfaces";
import winston = require("winston");
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
    const url = `/task/${task.taskId}/reservation`
    axios.post(url).then(function (rsp) {
        if (rsp.status == axios.OK) {
            winston.info('Success')
        } else {
            winston.info(`Reserve response code: ${rsp.status}`)
        }
    }).catch(function (err) {
        winston.error(`Error occur when reserve posting: ${err.message}`)
    })
    return null;
}

export async function push(task: RPCRequest): Promise<RPCRequest> {
    return null;
}
