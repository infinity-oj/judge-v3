import { CompileTask, RPCRequest, RPCTaskType, StandardRunTask } from "../interfaces";
import winston = require("winston");
import axios from "axios";
import { Stream } from "stream";
const unzip = require("unzip");
let cookie = null;

export const http = axios.create({
  baseURL: "http://192.168.1.9:8888/api/v1",
  withCredentials: true,
});

http.interceptors.request.use(
  function (config) {
    // Do something before request is sent
    config.headers.cookie = cookie;
    return config;
  },
  function (error) {
    // Do something with request error
    return Promise.reject(error);
  }
);

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
  cookie = login.headers["set-cookie"][0];
  await http.get("/session/principal");
  return true;
}

function streamToString(stream): Promise<string> {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: any) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

export async function pull(type: String): Promise<RPCRequest> {
  try {
    const res = await http.get("/task", {
      params: {
        type,
      },
    });
    // console.log(JSON.stringify(res.data));
    if (res.data) {
      const data = res.data[0];
      let rpc: RPCRequest;
      if (data.type === "syzoj/compilor") {
        const codeStream = await fetchFile(data.inputs[0].value);

        const task: CompileTask = {
          code: await streamToString(codeStream),
          language: data.inputs[1].value,
          extraFiles: [],
          binaryName: "abc",
        };

        rpc = {
          task: task,
          taskId: data.taskId,
          type: RPCTaskType.Compile,
          token: "",
          inputs: data.inputs,
          outputs: [],
        };
      }
      if (data.type === "syzoj/standard") {

        const task: StandardRunTask = {
          time: 1000,
          memory: 256,
        };

        rpc = {
          task: task,
          taskId: data.taskId,
          type: RPCTaskType.RunStandard,
          token: "",
          inputs: data.inputs,
          outputs: [],
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

export async function fetchFile(uri: string): Promise<Stream> {
  const tmp = uri.split(":");
  let volumeName, volumePath, wanted: String;
  volumeName = tmp[0];
  volumePath = "/";
  if (tmp.length !== 1) {
    wanted = tmp[1];
  }

  const url = `/volume/${volumeName}/download`;

  const res = await http({
    method: "get",
    url: url,
    params: {
      dirname: "/",
    },
    responseType: "stream",
  });

  return new Promise((resolve, reject) => {
    res.data
      .pipe(unzip.Parse())
      .on("entry", function (entry) {
        var fileName = entry.path;
        if (
          require("path").relative(
            "/" + fileName,
            "/" + volumeName + wanted
          ) === ""
        ) {
          resolve(entry as Stream);
        } else {
          entry.autodrain();
        }
      })
      .on("close", reject);
  });
}

export async function push(task: RPCRequest): Promise<void> {
  const url = `/task/${task.taskId}`;
  try {
    await http.put(url, {
      token: task.token,
      outputs: task.outputs,
      warning: "",
      error: "",
    });
  } catch (err) {
    winston.error(`Error occur when push task: ${err.message}`);
  }
}
