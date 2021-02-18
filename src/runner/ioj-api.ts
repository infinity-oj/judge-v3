import { CompileTask, RPCRequest, RPCTaskType } from "../interfaces";
import winston = require("winston");
import axios from "axios";

let cookie = null;

export const http = axios.create({
  baseURL: "http://192.168.1.9:8888/api/v1",
  withCredentials: true,
});

http.interceptors.request.use(function (config) {
  // Do something before request is sent
  config.headers.cookie = cookie
  return config;
}, function (error) {
  // Do something with request error
  return Promise.reject(error);
});


export async function login(
  username: String,
  password: String
): Promise<Boolean> {
  const login = await http.post(
    "/session/principal",
    {
      username: "judger1",
      password: "judger1",
    },
    {
      withCredentials: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    }
  );
  cookie = login.headers["set-cookie"][0]
  await http.get("/session/principal")
  return true;
}

export async function pull(type: String): Promise<RPCRequest> {
  try {
    const res = await http.get("/task", {
      params: {
        type,
      },
    });
    // console.log("?", res);
    // console.log(res.data);
    if (res.data) {
      const data = res.data[0];
      let rpc: RPCRequest;
      if (data.type.startsWith("builder")) {
        const task: CompileTask = {
          code: "int main() { return 0;}",
          language: "cpp",
          extraFiles: [],
          binaryName: "abc",
        };

        rpc = {
          task: task,
          taskId: data.taskId,
          type: RPCTaskType.Compile,
          token: "",
        };
      }
      return rpc;
    }
  } catch (err) {
    winston.error(`Error occur when pull: ${err.message}`);
    return null;
  }
}

export async function reserve(task: RPCRequest): Promise<Boolean> {
  const url = `/task/${task.taskId}/reservation`;
  try {
    const res = await http.post(url);
    task.token = res.data.token;
    winston.info("Reserve task success");
    return true;
  } catch (err) {
    winston.error(`Error occur when reserve posting: ${err.message}`);
  }
  return false;
}

export async function push(task: RPCRequest): Promise<RPCRequest> {
  return null;
}
