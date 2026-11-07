// tiny CDP driver for a headless Chrome on port $CDP_PORT (default 9333; started separately, see chrome.sh)
// node cdp.mjs nav <url> [ms] | eval <js-file-or-expr> | click x y | clicks x1 y1 ... | dbl x y | drag x1 y1 x2 y2 | key <key> [mods] | wheel x y dy | shot <png> | dialog
import fs from 'node:fs';

const [cmd, ...args] = process.argv.slice(2);
const targets = await (await fetch('http://127.0.0.1:' + (process.env.CDP_PORT || '9333') + '/json/list')).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
});
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
    }
};
function send(method, params = {}) {
    return new Promise((res) => {
        const i = ++id;
        pending.set(i, res);
        ws.send(JSON.stringify({ id: i, method, params }));
    });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function mouse(type, x, y, buttons = 1, clickCount = 1) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount });
}

if (cmd === 'nav') {
    await send('Page.enable');
    await send('Page.navigate', { url: args[0] });
    await sleep(Number(args[1] || 8000));
    console.log('navigated');
} else if (cmd === 'cookies') {
    // a new server session: the AI's limits are per session
    await send('Network.enable');
    await send('Network.clearBrowserCookies');
    console.log('cookies cleared');
} else if (cmd === 'dialog') {
    await send('Page.enable');
    const r = await send('Page.handleJavaScriptDialog', { accept: true });
    console.log(JSON.stringify(r).slice(0, 200));
} else if (cmd === 'eval') {
    const src = fs.existsSync(args[0]) ? fs.readFileSync(args[0], 'utf8') : args[0];
    const r = await send('Runtime.evaluate', { expression: '(async () => {' + src + '})()', awaitPromise: true, returnByValue: true });
    console.log(JSON.stringify(r.result.result ? r.result.result.value : r.result, null, 1));
    if (r.result.exceptionDetails) console.log('EXC', JSON.stringify(r.result.exceptionDetails).slice(0, 1500));
} else if (cmd === 'click') {
    const [x, y] = args.map(Number);
    await mouse('mouseMoved', x, y, 0);
    await mouse('mousePressed', x, y);
    await sleep(60);
    await mouse('mouseReleased', x, y, 0);
    await sleep(300);
    console.log('clicked', x, y);
} else if (cmd === 'rclick') {
    const [x, y] = args.map(Number);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
    await sleep(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(300);
    console.log('right-clicked', x, y);
} else if (cmd === 'clicks') {
    for (let i = 0; i < args.length; i += 2) {
        const x = Number(args[i]);
        const y = Number(args[i + 1]);
        await mouse('mouseMoved', x, y, 0);
        await mouse('mousePressed', x, y);
        await sleep(40);
        await mouse('mouseReleased', x, y, 0);
        await sleep(250);
    }
    console.log('clicked', args.length / 2);
} else if (cmd === 'dbl') {
    const [x, y] = args.map(Number);
    await mouse('mouseMoved', x, y, 0);
    for (const count of [1, 2]) {
        await mouse('mousePressed', x, y, 1, count);
        await mouse('mouseReleased', x, y, 0, count);
        await sleep(30);
    }
    await sleep(300);
    console.log('double-clicked', x, y);
} else if (cmd === 'drag') {
    const [x1, y1, x2, y2] = args.map(Number);
    await mouse('mouseMoved', x1, y1, 0);
    await mouse('mousePressed', x1, y1);
    const steps = 12;
    for (let s = 1; s <= steps; s++) {
        await mouse('mouseMoved', x1 + ((x2 - x1) * s) / steps, y1 + ((y2 - y1) * s) / steps);
        await sleep(30);
    }
    await mouse('mouseReleased', x2, y2, 0);
    await sleep(400);
    console.log('dragged');
} else if (cmd === 'type') {
    await send('Input.insertText', { text: args[0] });
    await sleep(200);
    console.log('typed', args[0]);
} else if (cmd === 'key') {
    const key = args[0];
    const codes = { Enter: 13, Delete: 46, Escape: 27, Backspace: 8, z: 90, y: 89, a: 65 };
    const modifiers = Number(args[1] || 0);
    const code = key.length === 1 ? 'Key' + key.toUpperCase() : key;
    const text = key === 'Enter' ? '\r' : undefined;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: codes[key], modifiers, text });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: codes[key], modifiers });
    await sleep(300);
    console.log('key', key);
} else if (cmd === 'wheel') {
    const [x, y, dy] = args.map(Number);
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy });
    await sleep(300);
    console.log('wheel', dy);
} else if (cmd === 'shotclip') {
    const [x, y, width, height] = args.slice(1).map(Number);
    const r = await send('Page.captureScreenshot', { format: 'png', clip: { x, y, width, height, scale: 2 } });
    fs.writeFileSync(args[0], Buffer.from(r.result.data, 'base64'));
    console.log('saved', args[0]);
} else if (cmd === 'shot') {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(args[0], Buffer.from(r.result.data, 'base64'));
    console.log('saved', args[0]);
}
ws.close();
process.exit(0);
