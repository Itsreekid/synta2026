import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

export async function runMigrations(db, files) {
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const logs = [];
  const context = vm.createContext({ process: {}, console: {
    log: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' '))
  } });
  const file = new URL('../scripts/migrate.js', import.meta.url);
  const module = new vm.SourceTextModule(await readFile(file, 'utf8'), {
    context, initializeImportMeta: meta => { meta.url = file.href; }
  });
  await module.link(async specifier => {
    const values = specifier === '../config/db.js' ? { default: { connect: () => db.connect(), end: async () => finish() } }
      : specifier === '../loadEnv.js' ? {}
      : specifier === 'node:fs/promises' ? {
        access: async () => {}, readdir: async () => [...files.keys()],
        readFile: async path => files.get(String(path).split(/[\\/]/).at(-1))
      } : await import(specifier);
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  await finished;
  await new Promise(resolve => setTimeout(resolve, 0));
  return { code: context.process.exitCode || 0, logs };
}
