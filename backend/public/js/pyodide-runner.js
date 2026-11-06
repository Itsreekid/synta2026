(() => {
    const channel = 'synta-pyodide';
    const pyodideVersion = '0.29.2';
    const pyodideBaseUrl = `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`;
    const promptInput = () => window.prompt('Saisis la valeur demandée par input() :') ?? '';
    let pyodidePromise = null;
    let pyodideReady = false;
    let activeRunId = null;

    function send(type, runId, payload = {}) {
        window.parent.postMessage({ channel, type, runId, ...payload }, '*');
    }

    function loadPyodideScript() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${pyodideBaseUrl}pyodide.js`;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Le téléchargement de Pyodide a échoué.'));
            document.head.appendChild(script);
        });
    }

    function codeNeedsImportedPackages(code) {
        return /^\s*(?:from\s+[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\s+import\b|import\s+[A-Za-z_]\w*)/m.test(code);
    }

    async function getPyodide(runId) {
        if (!pyodidePromise) {
            send('output', runId, { text: 'Préparation de l’environnement Python…\n' });
            pyodidePromise = (async () => {
                await loadPyodideScript();
                return window.loadPyodide({
                    indexURL: pyodideBaseUrl,
                    stdin: promptInput
                });
            })().catch(error => {
                pyodidePromise = null;
                pyodideReady = false;
                throw error;
            });
        } else if (!pyodideReady) {
            send('output', runId, { text: 'Préparation de l’environnement Python…\n' });
        }

        const pyodide = await pyodidePromise;
        pyodideReady = true;
        return pyodide;
    }

    function getVariables(pyodide, namespace) {
        const json = pyodide.runPython(`
__import__('json').dumps([
    {
        'name': name,
        'type': type(value).__name__,
        'value': repr(value)[:180]
    }
    for name, value in globals().items()
    if not name.startswith('__')
    and not callable(value)
    and type(value).__name__ != 'module'
])
`, { globals: namespace, locals: namespace });
        return JSON.parse(json);
    }

    async function runCode({ runId, code }) {
        activeRunId = runId;
        let namespace;
        try {
            const pyodide = await getPyodide(runId);
            if (activeRunId !== runId) return;

            pyodide.setStdout({
                batched: text => {
                    if (activeRunId === runId) send('output', runId, { text });
                }
            });
            pyodide.setStderr({
                batched: text => {
                    if (activeRunId === runId) send('stderr', runId, { text });
                }
            });
            pyodide.setStdin({ stdin: promptInput });

            if (codeNeedsImportedPackages(code)) {
                send('output', runId, { text: 'Chargement des modules utilisés par le programme…\n' });
                await pyodide.loadPackagesFromImports(code);
                if (activeRunId !== runId) return;
            }

            const makeDict = pyodide.globals.get('dict');
            namespace = makeDict();
            makeDict.destroy();

            await pyodide.runPythonAsync(code, {
                globals: namespace,
                locals: namespace,
                filename: '<Code Pratique>'
            });
            if (activeRunId !== runId) return;

            send('complete', runId, { ok: true, variables: getVariables(pyodide, namespace) });
        } catch (error) {
            if (activeRunId !== runId) return;
            let variables = [];
            if (namespace) {
                try {
                    const pyodide = await pyodidePromise;
                    variables = getVariables(pyodide, namespace);
                } catch {}
            }
            send('complete', runId, {
                ok: false,
                error: error?.message || String(error),
                variables
            });
        } finally {
            namespace?.destroy();
        }
    }

    window.addEventListener('message', event => {
        if (event.source !== window.parent) return;
        const message = event.data;
        if (!message || message.channel !== channel || message.type !== 'run') return;
        runCode(message);
    });

    send('ready', 0);
})();
