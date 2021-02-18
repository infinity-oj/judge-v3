import tar = require("tar");
import lockfile = require("lockfile");
import Bluebird = require("bluebird");
import pathLib = require("path");
import fse = require("fs-extra");
import msgpack = require("msgpack-lite");
import winston = require("winston");

import { streamToBuffer } from "../utils";
import { get as getRedis, put as putRedis } from "./redis";
import { globalConfig as Cfg } from "./config";
import { getLanguage, Language } from "../languages";
import { redisBinarySuffix, redisMetadataSuffix } from "../interfaces";
import fs = require("fs");
import { http } from "./ioj-api";
Bluebird.promisifyAll(lockfile);

const FormData = require("form-data");

export interface BinaryMetadata {
  language: string;
  code: string;
}

export async function newVolume() {
  const res = await http.post("/volume");
  console.log(res.data);
  return res.data.name;
}

export async function pushBinary(
  name: string,
  language: Language,
  code: string,
  path: string
): Promise<void> {
  winston.verbose(`Pushing binary ${name}, creating tar archive...`);
  const binary = await streamToBuffer(
    tar.create(
      {
        gzip: true,
        cwd: path,
        portable: true,
      },
      ["."]
    )
  );
  const data: BinaryMetadata = {
    language: language.name,
    code: code,
  };

  const form = new FormData();
  form.append("file", binary, name + redisBinarySuffix);

  try {
    const volumeName = await newVolume();

    const res = await http({
      method: "post",
      url: `/volume/${volumeName}/file`,
      data: form,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${form._boundary}`,
      },
    });
    console.log(res);
  } catch (err) {
    console.log(err);
  }
  // console.log(res)

  // await putRedis(name + redisMetadataSuffix, msgpack.encode(data));
}

// Return value: [path, language, code]
export async function fetchBinary(
  spj: boolean,
  task: any
): Promise<[string, Language, string]> {
  let binary: Buffer;
  if (spj) {
    binary = task.spjExecutable;
  } else {
    binary = task.executable;
  }

  // TODO: binary to local path
  let path: string;
  return [path, task.metaData.language, task.metaData.code];
}
