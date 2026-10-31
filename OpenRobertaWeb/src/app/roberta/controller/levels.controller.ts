/**
 * The Level designer tab, shown if the server's .env has LEVEL_DESIGNER=true: levels for the Program tab's simulator (Edison) are drawn here
 * and downloaded as files (level.model). A level file goes into a set's folder in the repository's levels folder (a folder per set, a file per
 * level, both in the order of their names: "01-first-steps/02-around-the-box.json").
 *
 * - the world is drawn with the Tests tab's world editor in level mode (nepoTest.simEditor): one start, goal areas, soft goal areas, fail
 *   areas, lines, obstacles and walls (in their properties: whether bumping into them loses the level)
 * - beside it: the level's title, instructions and time limit; what is wrong with it (no goal area, the robot starts on something); the
 *   files: new, open a file, open a level of the levels folder, download; "Try in simulator" plays it in the Program tab's simulator
 *   (levels.player) with the program there
 * - the level being drawn is kept in the browser (localStorage), so a reload doesn't lose it
 */
import * as GUISTATE_C from 'guiState.controller';
import * as UTIL from 'util.roberta';
import * as $ from 'jquery';
import * as LEVEL from 'level.model';
import * as PLAYER from 'levels.player';
import { SimEditor } from 'nepoTest.simEditor';

const DRAFT_KEY = 'nepoLevelDraft';

let editor: SimEditor = null;
let level: LEVEL.Level = null;
let file = ''; // the name of the level's file (opened), for its download
let editorId = 0; // a new one per level: the editor's undo history is per level
let lang = 'en';
let sets: LEVEL.LevelSet[] = [];
const ui: { [name: string]: any } = {};

const TEXT: { [lang: string]: { [key: string]: string } } = {
    en: {
        tab: 'Level designer',
        level: 'Level',
        newLevel: 'New',
        newTitle: 'A new level (the one drawn now is replaced)',
        openFile: 'Open file…',
        openFileTitle: 'Open a level file',
        openRepo: 'Open a level of the levels folder…',
        download: 'Download',
        downloadTitle: 'Download the level as a file: put it into a set\'s folder in the repository\'s levels folder',
        tryIt: 'Try in simulator',
        tryItTitle: 'Play the level in the Program tab\'s simulator, with the program there',
        notEdison: 'Levels are played by the Edison: choose it as the robot to try the level.',
        title: 'Title',
        instructions: 'Instructions',
        instructionsHint: 'What the learner sees beside the simulator (optional)',
        timeLimit: 'Time limit',
        seconds: 's',
        noLimit: 'none',
        timeLimitHint: 'The simulator\'s time; empty: no limit',
        problems: 'To check',
        noProblems: 'The level can be played.',
        noGoal: 'There is no goal area: the level can\'t be beaten.',
        startOutside: 'The robot starts (partly) outside the floor.',
        startOnGoal: 'The robot starts on a goal area: it beats the level at once.',
        startOnFail: 'The robot starts on a fail area: it loses the level at once.',
        startOnObstacle: 'The robot starts on an obstacle.',
        notALevel: '"{0}" is not a level: {1}',
        noLevels: 'The levels folder has no levels.',
        levelsError: 'The levels folder can\'t be read: {0}',
        help: 'Levels are files in the repository\'s levels folder: a folder per set, a .json file per level, both in the order of their names ("01-first-steps/02-around-the-box.json"). The Program tab\'s simulator plays them (reload the page after adding one).',
    },
    de: {
        tab: 'Level-Designer',
        level: 'Level',
        newLevel: 'Neu',
        newTitle: 'Ein neues Level (das gezeichnete wird ersetzt)',
        openFile: 'Datei öffnen…',
        openFileTitle: 'Eine Level-Datei öffnen',
        openRepo: 'Ein Level des Level-Ordners öffnen…',
        download: 'Herunterladen',
        downloadTitle: 'Das Level als Datei herunterladen: lege sie in den Ordner eines Sets im Level-Ordner des Repositorys',
        tryIt: 'In der Simulation ausprobieren',
        tryItTitle: 'Das Level in der Simulation des Programm-Tabs spielen, mit dem Programm dort',
        notEdison: 'Level spielt der Edison: wähle ihn als Roboter, um das Level auszuprobieren.',
        title: 'Titel',
        instructions: 'Anleitung',
        instructionsHint: 'Was die Lernenden neben der Simulation sehen (optional)',
        timeLimit: 'Zeitlimit',
        seconds: 's',
        noLimit: 'keins',
        timeLimitHint: 'Die Zeit der Simulation; leer: kein Limit',
        problems: 'Zu prüfen',
        noProblems: 'Das Level kann gespielt werden.',
        noGoal: 'Es gibt keinen Zielbereich: das Level kann nicht geschafft werden.',
        startOutside: 'Der Roboter startet (teilweise) außerhalb des Bodens.',
        startOnGoal: 'Der Roboter startet auf einem Zielbereich: er schafft das Level sofort.',
        startOnFail: 'Der Roboter startet auf einem Fehlerbereich: er verliert das Level sofort.',
        startOnObstacle: 'Der Roboter startet auf einem Hindernis.',
        notALevel: '„{0}“ ist kein Level: {1}',
        noLevels: 'Der Level-Ordner hat keine Level.',
        levelsError: 'Der Level-Ordner kann nicht gelesen werden: {0}',
        help: 'Level sind Dateien im Level-Ordner des Repositorys: ein Ordner pro Set, eine .json-Datei pro Level, beide in der Reihenfolge ihrer Namen („01-erste-schritte/02-um-die-kiste.json“). Die Simulation im Programm-Tab spielt sie (lade die Seite neu, wenn eins dazukommt).',
    },
};

function text(key: string, ...args: any[]): string {
    const table = TEXT[lang] || TEXT.en;
    let s = table[key] !== undefined ? table[key] : TEXT.en[key] || key;
    args.forEach((a, i) => (s = s.replace('{' + i + '}', String(a))));
    return s;
}

function html(tag: string, cls: string, parent: Element): any {
    const e = document.createElement(tag);
    cls && (e.className = cls);
    parent && parent.appendChild(e);
    return e;
}

// ------------------------------------------------------------------------------------------------ setup

export function init(): void {
    if (!GUISTATE_C.isLevelDesignerOn()) {
        return; // the tab stays hidden
    }
    $('#tabLevels').parent().removeClass('hidden');
    lang = GUISTATE_C.getLanguage();
    build();
    editor = new SimEditor(
        document.getElementById('levelsEditor'),
        {
            changed: changed,
            tests: () => [],
            select: () => {},
            run: () => {},
            blockLabel: (blockId: string) => blockId,
            showBlock: () => {},
            replayed: () => {},
        },
        'level'
    );
    const draft = readDraft();
    open(draft ? draft.level : LEVEL.newLevel(), draft ? draft.file : '');
    setLanguage(lang);
    initEvents();
    GUISTATE_C.addLanguageListener(setLanguage);
}

function initEvents(): void {
    $('#tabLevels').onWrap('show.bs.tab', function () {
        GUISTATE_C.setView('tabLevels');
    });
    $('#tabLevels').onWrap(
        'shown.bs.tab',
        function () {
            editor.resize();
            loadSets();
        },
        'tabLevels clicked'
    );
    $(window).on('resize', function () {
        $('#levels').hasClass('active') && editor.resize();
    });
}

/** the panel beside the editor: the files, the level's texts and time limit, what is wrong with it */
function build(): void {
    const side = document.getElementById('levelsSide');
    side.innerHTML = '';
    ui.heading = html('h4', 'nepoLevelHeading', side);
    const files = html('div', 'nepoLevelFiles', side);
    const button = (name: string, cls: string, action: () => void) => {
        const b = html('button', 'btn ' + cls, files);
        b.type = 'button';
        b.addEventListener('click', (e: Event) => {
            e.preventDefault();
            action();
        });
        ui[name] = b;
    };
    button('newLevel', 'btn-default', () => open(LEVEL.newLevel(), ''));
    button('openFile', 'btn-default', () => ui.fileInput.click());
    button('download', 'btn-primary', download);
    button('tryIt', 'btn-default', () => showMessage(PLAYER.tryLevel(LEVEL.parseLevel(level)) ? '' : text('notEdison'), true));
    ui.repo = html('select', 'nepoLevelRepo', side);
    ui.repo.addEventListener('change', () => {
        const id = ui.repo.value;
        ui.repo.value = '';
        for (const set of sets) {
            const entry = set.levels.filter((l) => l.id === id)[0];
            entry && open(LEVEL.parseLevel(entry.level), entry.file.substring(entry.file.lastIndexOf('/') + 1)); // a copy
        }
    });
    ui.fileInput = html('input', '', side);
    ui.fileInput.type = 'file';
    ui.fileInput.accept = '.json';
    ui.fileInput.style.display = 'none';
    ui.fileInput.addEventListener('change', () => {
        const chosen: File = ui.fileInput.files && ui.fileInput.files[0];
        ui.fileInput.value = '';
        if (!chosen) {
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            try {
                open(LEVEL.parseLevel(String(reader.result)), chosen.name);
                showMessage('', false);
            } catch (e) {
                showMessage(text('notALevel', chosen.name, (e && e.message) || e), true);
            }
        };
        reader.readAsText(chosen);
    });
    ui.message = html('div', 'nepoLevelMessage', side);
    const field = (name: string, tag: string) => {
        const label = html('label', 'nepoLevelField', side);
        ui[name + 'Label'] = html('span', '', label);
        const input = html(tag, 'form-control', label);
        input.addEventListener('keydown', (e: KeyboardEvent) => e.stopPropagation()); // not the Lab's shortcuts
        input.addEventListener('input', () => fieldChanged());
        ui[name] = input;
        return label;
    };
    field('title', 'input');
    ui.title.maxLength = 80;
    field('instructions', 'textarea');
    ui.instructions.rows = 5;
    const limit = field('timeLimit', 'input');
    ui.timeLimit.type = 'number';
    ui.timeLimit.min = '1';
    ui.timeLimit.step = '1';
    ui.timeLimitUnit = html('span', 'nepoLevelUnit', limit);
    ui.problemsTitle = html('h5', 'nepoLevelProblemsTitle', side);
    ui.problems = html('ul', 'nepoLevelProblems', side);
    ui.help = html('p', 'nepoLevelHelp', side);
}

function setLanguage(newLang: string): void {
    lang = newLang;
    $('#tabLevels .menuTab').text(text('tab'));
    if (!editor) {
        return;
    }
    editor.setLanguage(lang);
    ui.heading.textContent = text('level');
    ['newLevel', 'openFile', 'download', 'tryIt'].forEach((name) => (ui[name].textContent = text(name)));
    ui.tryIt.title = text('tryItTitle');
    ui.newLevel.title = text('newTitle');
    ui.openFile.title = text('openFileTitle');
    ui.download.title = text('downloadTitle');
    ui.titleLabel.textContent = text('title');
    ui.instructionsLabel.textContent = text('instructions');
    ui.instructions.placeholder = text('instructionsHint');
    ui.timeLimitLabel.textContent = text('timeLimit');
    ui.timeLimit.placeholder = text('noLimit');
    ui.timeLimit.title = text('timeLimitHint');
    ui.timeLimitUnit.textContent = text('seconds');
    ui.problemsTitle.textContent = text('problems');
    ui.help.textContent = text('help');
    renderRepo();
    renderProblems();
}

// ------------------------------------------------------------------------------------------------ the level

/** shows a level to draw (a copy) */
function open(newLevel: LEVEL.Level, fileName: string): void {
    level = newLevel;
    file = fileName || '';
    editorId++;
    editor.show('level' + editorId, LEVEL.toSimData(level), level.title);
    ui.title.value = level.title || '';
    ui.instructions.value = level.instructions || '';
    ui.timeLimit.value = level.timeLimit > 0 ? String(level.timeLimit) : '';
    renderProblems();
    saveDraft();
}

/** the editor changed the world (or only the view) */
function changed(data: any): void {
    level.world = data.world;
    level.view = data.view;
    renderProblems();
    saveDraft();
}

function fieldChanged(): void {
    level.title = String(ui.title.value).trim();
    level.instructions = String(ui.instructions.value).trim();
    const limit = Number(ui.timeLimit.value);
    if (limit > 0) {
        level.timeLimit = limit;
    } else {
        delete level.timeLimit;
    }
    editor.setTitle(level.title);
    renderProblems();
    saveDraft();
}

function download(): void {
    UTIL.download(file || LEVEL.fileName(level), LEVEL.serialize(level));
}

function renderProblems(): void {
    if (!level || !ui.problems) {
        return;
    }
    const problems = LEVEL.levelProblems(level);
    ui.problems.innerHTML = '';
    if (!problems.length) {
        html('li', 'nepoLevelOk', ui.problems).textContent = text('noProblems');
    }
    problems.forEach((key) => (html('li', 'nepoLevelProblem', ui.problems).textContent = text(key)));
}

function showMessage(message: string, isError: boolean): void {
    ui.message.textContent = message;
    ui.message.className = 'nepoLevelMessage' + (isError ? ' error' : '');
}

// ------------------------------------------------------------------------------------------------ the levels folder

/** the levels of the repository's levels folder, to open one */
function loadSets(): void {
    LEVEL.fetchSets().then(
        (listing) => {
            sets = listing.sets;
            renderRepo();
            listing.problems.length && showMessage(listing.problems.map((p) => text('notALevel', p.file, p.message)).join(' '), true);
        },
        (e) => {
            sets = [];
            renderRepo();
            showMessage(text('levelsError', (e && e.message) || e), true);
        }
    );
}

function renderRepo(): void {
    const select = ui.repo;
    select.innerHTML = '';
    const first = html('option', '', select);
    first.value = '';
    first.textContent = text(sets.length ? 'openRepo' : 'noLevels');
    for (const set of sets) {
        const group = html('optgroup', '', select);
        group.label = set.name;
        set.levels.forEach((entry, i) => {
            const option = html('option', '', group);
            option.value = entry.id;
            option.textContent = i + 1 + '. ' + (entry.level.title || entry.file);
        });
    }
    select.value = '';
}

// ------------------------------------------------------------------------------------------------ the draft (this browser)

function saveDraft(): void {
    try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ level: level, file: file }));
    } catch (e) {
        // no storage (a private window): the level is only lost on a reload
    }
}

function readDraft(): { level: LEVEL.Level; file: string } {
    try {
        const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
        return draft && draft.level ? { level: LEVEL.parseLevel(draft.level), file: draft.file || '' } : null;
    } catch (e) {
        return null;
    }
}
