/*
 * The NepoTest runner of the Tests tab, in a module Web Worker (started with {type: 'module'}; the file itself is a plain script, not AMD).
 *
 * It loads Pyodide (CPython compiled to WebAssembly) with a dynamic import of pyodide.mjs. That is a CORS request; classic importScripts()
 * of a cross-origin script is a no-cors request, which some browser setups block (verified: a Chrome where importScripts from the CDN failed
 * while import() worked). Then it loads the nepotest Python package (bundled by gulp into nepotest/nepotest-files.json),
 * then answers requests from nepoTest.runner.ts. All data crosses the JS/Python boundary as JSON strings (see NepoTest/nepotest/browser.py).
 *
 *   {cmd: 'init'}                             -> {event: 'ready', version}
 *   {cmd: 'translate', testsXml, programXml}  -> {event: 'result', data: {spec, problems}}
 *   {cmd: 'run', bundle, testsXml}            -> {event: 'prepared', data}, {event: 'progress', data: {index, report}} per test,
 *                                                {event: 'result', data: {prepared, finish}}
 * Every message carries the request's id and the config {pyodideUrl, filesUrl}; errors come back as {event: 'error', message}.
 */
var nepotest = { py: null, loading: null };
// import() hidden in a Function: tsc would turn a literal import() into an AMD require()
var nepotestImport = new Function('url', 'return import(url)');

function nepotestLoad(config) {
    if (nepotest.loading) {
        return nepotest.loading;
    }
    nepotest.loading = nepotestImport(config.pyodideUrl + 'pyodide.mjs')
        .then(function (module) {
            return module.loadPyodide({ indexURL: config.pyodideUrl });
        })
        .then(function (py) {
            return fetch(config.filesUrl, { cache: 'no-cache' })
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error('could not load ' + config.filesUrl + ' (HTTP ' + response.status + ')');
                    }
                    return response.json();
                })
                .then(function (bundle) {
                    Object.keys(bundle.files).forEach(function (path) {
                        var full = '/home/pyodide/' + path;
                        py.FS.mkdirTree(full.substring(0, full.lastIndexOf('/')));
                        py.FS.writeFile(full, bundle.files[path]);
                    });
                    py.runPython("import sys\nif '/home/pyodide' not in sys.path:\n    sys.path.insert(0, '/home/pyodide')\nimport nepotest.browser");
                    nepotest.py = py;
                    return py;
                });
        })
        .catch(function (err) {
            nepotest.loading = null; // allow a retry, e.g. when the network was down
            throw err;
        });
    return nepotest.loading;
}

function nepotestCall(name, args) {
    var module = nepotest.py.pyimport('nepotest.browser');
    try {
        return JSON.parse(module[name].apply(null, args));
    } finally {
        module.destroy();
    }
}

self.onmessage = function (e) {
    var m = e.data;
    var post = function (event, data) {
        self.postMessage({ id: m.id, event: event, data: data });
    };
    nepotestLoad(m.config)
        .then(function () {
            if (m.cmd === 'init') {
                post('ready', { version: nepotest.py.version });
            } else if (m.cmd === 'translate') {
                post('result', nepotestCall('translate_tests', [m.testsXml, m.programXml || null]));
            } else if (m.cmd === 'run') {
                var prepared = nepotestCall('prepare', [m.bundle, m.testsXml]);
                post('prepared', prepared);
                var blocking = prepared.conversion_errors.length > 0 || prepared.problems.some(function (p) {
                    return p.severity === 'error';
                });
                if (!blocking) {
                    for (var i = 0; i < prepared.tests.length; i++) {
                        post('progress', { index: i, report: nepotestCall('run_one', [i]) });
                    }
                }
                post('result', { prepared: prepared, finish: blocking ? null : nepotestCall('finish', []) });
            } else {
                throw new Error('unknown command ' + m.cmd);
            }
        })
        .catch(function (err) {
            self.postMessage({ id: m.id, event: 'error', message: String((err && err.message) || err) });
        });
};
