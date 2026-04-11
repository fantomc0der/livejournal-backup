import { buildCli } from "./cli.ts";

const program = buildCli();
program.parse(process.argv);
