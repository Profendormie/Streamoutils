const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Exercise the actual inline script, including its analysis and export handlers.
const html = readFileSync(path.join(__dirname, '..', 'insertwitch.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1, 'Expected the analyzer inline script');

function loadAnalyzer() {
  function element() {
    const listeners = new Map();
    return {
      value: '', textContent: '', className: '', children: [],
      addEventListener(event, handler) { listeners.set(event, handler); },
      appendChild(child) { this.children.push(child); },
      click() { return listeners.get('click')?.(); },
      remove() {},
    };
  }
  const elements = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)]
    .map((match) => [match[1], element()]));
  const downloads = [], links = [];
  const document = {
    getElementById: (id) => elements[id],
    createElement(tag) {
      const node = element();
      if (tag === 'a') links.push(node);
      return node;
    },
    body: element(),
  };
  const context = vm.createContext({
    ...elements, document, window: {}, Blob,
    URL: {
      createObjectURL(blob) { downloads.push(blob); return 'blob:test-report'; },
      revokeObjectURL() {},
    },
  });
  vm.runInContext(scripts[0][1], context, { filename: 'insertwitch.html' });
  return {
    elements,
    parse: (movetext) => structuredClone(context.splitMainAndVariations(movetext)),
    analyze(pgn) {
      elements.pgnInput.value = pgn;
      elements.analyzeBtn.click();
      return structuredClone(context.window.__analysisState);
    },
    async exportReport() {
      elements.reportBtn.click();
      assert.equal(downloads.length, 1);
      assert.equal(links[0].download, 'rapport_chess_ai_analyzer_v1_beta.txt');
      return downloads[0].text();
    },
  };
}

const parserCases = [
  {
    name: 'empty movetext', pgn: ' \n ', main: [], variations: [],
  },
  {
    name: 'spaced move numbers', pgn: '1. e4 e5 2. Nf3 Nc6 *',
    main: ['e4', 'e5', 'Nf3', 'Nc6'], variations: [],
  },
  {
    name: 'two closing parentheses attached to a move',
    pgn: '1. e4 (1. d4 d5 (1... e6)) e5 2. Nf3 Nc6 *',
    main: ['e4', 'e5', 'Nf3', 'Nc6'], variations: ['d4 d5', 'e6'],
  },
  {
    name: 'three nested variations ending together',
    pgn: '1. e4 (1. d4 d5 (1... Nf6 (1... e6))) e5 2. Nf3 Nc6 *',
    main: ['e4', 'e5', 'Nf3', 'Nc6'], variations: ['d4 d5', 'Nf6', 'e6'],
  },
  {
    name: 'outer variation resumes after a nested variation',
    pgn: '1.e4(1.d4 d5(1...Nf6)2.c4 e6)e5 2.Nf3 Nc6 *',
    main: ['e4', 'e5', 'Nf3', 'Nc6'], variations: ['d4 d5 c4 e6', 'Nf6'],
  },
  {
    name: 'adjacent sibling variations and main-line moves',
    pgn: '1.e4(1.d4 d5)(1.c4 e5)e5 2.Nf3 Nc6 *',
    main: ['e4', 'e5', 'Nf3', 'Nc6'], variations: ['d4 d5', 'c4 e5'],
  },
  {
    name: 'compact white and black move numbers preserve SAN',
    pgn: '23...Qe7+ 24.exd8=Q# *',
    main: ['Qe7+', 'exd8=Q#'], variations: [],
  },
  {
    name: 'standalone move numbers are never moves',
    pgn: '1. 1... 23... *', main: [], variations: [],
  },
];

for (const { name, pgn, main, variations } of parserCases) {
  test(name, () => assert.deepEqual(loadAnalyzer().parse(pgn), { main, variations }));
}

for (const result of ['1-0', '0-1', '1/2-1/2', '*']) {
  test(`compact numbering keeps result ${result} out of the main line`, () => {
    assert.deepEqual(loadAnalyzer().parse(`1.e4 1...e5 2.Nf3 2...Nc6 ${result}`), {
      main: ['e4', 'e5', 'Nf3', 'Nc6'], variations: [],
    });
  });
}

const integrationCases = [
  {
    name: 'nested variations', event: 'Variantes imbriquées', result: '*',
    compact: '1.e4 {Alice: attaque (variante)} (1.d4 d5 (1...e6)) e5 2.Nf3 Nc6 3.Bb5 a6 4.Bxc6+ dxc6 5.Nxe5 Qe7 *',
    spaced: '1. e4 {Alice: attaque (variante)} ( 1. d4 d5 ( 1... e6 ) ) e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6+ dxc6 5. Nxe5 Qe7 *',
    main: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6+', 'dxc6', 'Nxe5', 'Qe7'],
    variations: ['d4 d5', 'e6'], comments: ['Alice: attaque (variante)'],
    metrics: {
      captures: 3, checks: 1, promotions: 0, castles: 0, pieceMoves: 6, pawnMoves: 4,
      tacticalScore: 14, positionalScore: 4, profile: 'Style tactique / dynamique',
      sameCommentatorAsPlayer: true,
    },
  },
  {
    name: 'compact numbering from move 23', event: 'Numéros compacts', result: '0-1',
    compact: '23...Qe7 24.Nxe5 Qxe5+ 25.Qe2 Qxe2+ 0-1',
    spaced: '23... Qe7 24. Nxe5 Qxe5+ 25. Qe2 Qxe2+ 0-1',
    main: ['Qe7', 'Nxe5', 'Qxe5+', 'Qe2', 'Qxe2+'],
    variations: [], comments: [],
    metrics: {
      captures: 3, checks: 2, promotions: 0, castles: 0, pieceMoves: 5, pawnMoves: 0,
      tacticalScore: 10, positionalScore: 0, profile: 'Style tactique / dynamique',
      sameCommentatorAsPlayer: false,
    },
  },
];

for (const fixture of integrationCases) {
  test(`${fixture.name}: metrics, displayed values and exported report agree`, async () => {
    const headers = `[Event "${fixture.event}"]\n[White "Alice"]\n[Black "Bob"]\n[Result "${fixture.result}"]\n\n`;
    const reports = [];
    for (const movetext of [fixture.compact, fixture.spaced]) {
      const app = loadAnalyzer();
      const state = app.analyze(headers + movetext);
      assert.deepEqual(state.main, fixture.main);
      assert.deepEqual(state.variations, fixture.variations);
      assert.deepEqual(state.comments, fixture.comments);
      assert.deepEqual(state.metrics, fixture.metrics);
      assert.deepEqual(state.headers, {
        Event: fixture.event, White: 'Alice', Black: 'Bob', Result: fixture.result,
      });

      const ui = app.elements;
      const expectedKpis = {
        kMoves: fixture.main.length, kCaptures: fixture.metrics.captures,
        kChecks: fixture.metrics.checks, kPromo: fixture.metrics.promotions,
        kVars: fixture.variations.length, varCount: fixture.variations.length,
        kCom: fixture.comments.length,
      };
      for (const [id, value] of Object.entries(expectedKpis)) {
        assert.equal(ui[id].textContent, String(value), id);
      }
      assert.equal(ui.mainLine.textContent, fixture.main.join(' '));
      assert.equal(ui.styleSummary.textContent, fixture.metrics.profile);
      assert.equal(ui.styleDetails.children[0].textContent,
        `Tactique: ${fixture.metrics.tacticalScore} | Positionnel: ${fixture.metrics.positionalScore}`);
      assert.equal(ui.styleDetails.children[1].textContent,
        `Activité pièces: ${fixture.metrics.pieceMoves} | Pions: ${fixture.metrics.pawnMoves}`);

      const report = await app.exportReport();
      const lines = report.split('\n');
      for (const expected of [
        `Événement: ${fixture.event}`, 'Blancs: Alice', 'Noirs: Bob',
        `Résultat: ${fixture.result}`,
        `- Coups valides (ligne principale): ${fixture.main.length}`,
        `- Captures: ${fixture.metrics.captures}`, `- Checks/mats: ${fixture.metrics.checks}`,
        `- Promotions: ${fixture.metrics.promotions}`, `- Variantes: ${fixture.variations.length}`,
        `- Commentaires: ${fixture.comments.length}`, `- Profil: ${fixture.metrics.profile}`,
        `- Score tactique: ${fixture.metrics.tacticalScore}`,
        `- Score positionnel: ${fixture.metrics.positionalScore}`,
        `- Commentateur potentiellement joueur analysé: ${fixture.metrics.sameCommentatorAsPlayer ? 'Oui' : 'Non'}`,
      ]) assert.ok(lines.includes(expected), `Missing report line: ${expected}`);
      reports.push(report);
    }
    assert.equal(reports[0], reports[1], 'Formatting must not change the exported report');
  });
}
