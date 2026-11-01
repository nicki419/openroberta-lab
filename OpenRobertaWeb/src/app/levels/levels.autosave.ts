/**
 * Autosave (Edison, whose simulator plays the levels): once a program has been saved by hand (it has a name and the server's time stamp), every
 * change to it (its blocks, its tests, the progress in the levels: they are saved with it) is saved a few seconds later, without a message.
 * Only for a logged-in user whose program is theirs to write. If a save fails (e.g. the program was saved elsewhere meanwhile), the error is
 * shown once and autosave waits until the program is saved by hand (its time stamp changes).
 */
import * as GUISTATE_C from 'guiState.controller';
import * as PROG_C from 'program.controller';
import * as SUITE from 'nepoTest.suite';
// @ts-ignore (Blockly has no type declarations)
import * as Blockly from 'blockly';

const GROUP = 'edison';
const POLL_MS = 1000;
const DELAY_MS = 3000; // a change is saved this long after the program became unsaved (at most a second later)
const STUCK_MS = 30000; // a save without an answer (the network failed): try again after this long

let dirtySince = 0;
let savingSince = 0;
let pausedAt: any = null; // the program's time stamp when a save failed: no autosave until it changes

export function init(): void {
    setInterval(tick, POLL_MS);
}

/** is the program saved automatically? */
export function isOn(): boolean {
    return (
        GUISTATE_C.getRobotGroup() === GROUP &&
        GUISTATE_C.isUserLoggedIn() &&
        !GUISTATE_C.isProgramStandard() &&
        GUISTATE_C.isProgramWritable() &&
        !!GUISTATE_C.getProgramTimestamp()
    );
}

/** the program as it is saved: its blocks, the tests and the levels' progress */
function programText(): string {
    return SUITE.merge(Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(GUISTATE_C.getBlocklyWorkspace())));
}

function tick(): void {
    const now = Date.now();
    if (savingSince && now - savingSince < STUCK_MS) {
        return;
    }
    savingSince = 0;
    if (GUISTATE_C.isProgramSaved() || !isOn()) {
        dirtySince = 0;
        return;
    }
    if (pausedAt !== null) {
        if (GUISTATE_C.getProgramTimestamp() === pausedAt) {
            return;
        }
        pausedAt = null; // saved by hand (or another program): autosave again
    }
    if (!dirtySince) {
        dirtySince = now;
        return;
    }
    if (now - dirtySince < DELAY_MS) {
        return;
    }
    savingSince = now;
    const timestamp = GUISTATE_C.getProgramTimestamp();
    const sent = programText();
    PROG_C.saveToServer(true, function (result: any) {
        savingSince = 0;
        dirtySince = 0;
        if (result.rc !== 'ok') {
            pausedAt = timestamp; // the error is shown (saveToServer)
        } else if (programText() !== sent) {
            GUISTATE_C.setProgramSaved(false); // changed while it was saved: once more
        }
    });
}
