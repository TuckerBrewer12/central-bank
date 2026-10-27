#!/usr/bin/env node
// Runs the TypeScript CLI directly, so `npx github:TuckerBrewer12/central-bank` needs no build step.
import { register } from "tsx/esm/api";

register();
await import("../src/cli.ts");
