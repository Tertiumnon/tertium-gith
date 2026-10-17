#!/usr/bin/env bun
import { exit } from "node:process";
import { onlyOne, parseFlags } from "./args";
import { create, merge } from "./commands";
import { release } from "./release";

const USAGE = `gf - git branch flow

Usage:
  gf create -b <branch>      work branch from develop, named by its goal
  gf create -r <version>     release/<version> from develop
  gf create --release        release, version = minor after the latest tag (local or origin)
  gf create -h <version>     hotfix/<version> from main
  gf create --hotfix         hotfix, version = patch after the latest tag (local or origin)
  gf merge                   merge this branch into develop
  gf merge -r <version>      merge this branch into release/<version>
  gf merge -h <version>      merge this branch into hotfix/<version>
  gf release --patch         bump the patch version, publish through main
  gf release --minor         bump the minor version, from develop into main
  gf release --major         bump the major version, from develop into main
  gf help                    show this help

Dashes decide how a flag takes its value:
  -r <v>, -release <v>, -h <v>, -hotfix <v>   explicit version
  --release, --hotfix                         auto version from the latest tag
  -b <name>, -branch <name>, --branch <name>  branch name
  --patch | -patch, --minor | -minor, --major | -major`;

const [command, ...rest] = process.argv.slice(2);

try {
  switch (command) {
    case "create":
      create(parseFlags(rest));
      break;
    case "merge":
      merge(parseFlags(rest));
      break;
    case "release": {
      const flags = parseFlags(rest);
      const kind = onlyOne(flags, ["patch", "minor", "major"]);
      if (!kind)
        throw new Error("usage: gf release --patch | --minor | --major");
      release(kind);
      break;
    }
    case undefined:
    case "help":
    case "--help":
      console.log(USAGE);
      break;
    default:
      console.error(`Unknown command '${command}'.\n\n${USAGE}`);
      exit(1);
  }
} catch (error) {
  console.error(`❌ ${error instanceof Error ? error.message : error}`);
  exit(1);
}
