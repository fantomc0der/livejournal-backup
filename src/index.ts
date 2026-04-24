import { buildCli } from "./cli.ts";

const program = buildCli();
try {
  await program.parseAsync(process.argv);
} catch (err) {
  if (err instanceof Error && err.message) {
    console.error(err.message);
  }
  process.exit(1);
}
