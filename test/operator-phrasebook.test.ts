import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatOperatorPhraseNudges,
  matchOperatorPhrases,
  OPERATOR_PHRASE_RULES
} from '@rarusoft/dendrite-memory';

test('B3: matchOperatorPhrases returns no matches for empty/missing prompt', () => {
  assert.deepEqual(matchOperatorPhrases(''), []);
  assert.deepEqual(matchOperatorPhrases('   '), []);
  assert.deepEqual(matchOperatorPhrases(undefined), []);
  assert.deepEqual(matchOperatorPhrases(null), []);
});

test('B3: durable-intent patterns fire on "from now on" and "the reason we"', () => {
  const matches = matchOperatorPhrases('From now on, validate all session tokens because the legal team flagged it.');
  const phrases = matches.map((match) => match.rule.pattern);
  assert.ok(phrases.includes('from now on'), `expected "from now on" match; got ${phrases.join(', ')}`);
  for (const match of matches.filter((m) => m.rule.pattern === 'from now on')) {
    assert.equal(match.rule.category, 'durable-intent');
    assert.match(match.rule.nudge, /memory_remember/);
  }

  const reasonMatches = matchOperatorPhrases('The reason we use composition API is that Options API has lifecycle pitfalls.');
  assert.ok(reasonMatches.some((match) => match.rule.pattern === 'the reason we'));
});

test('B3: scope-setting patterns fire on "whenever you\'re editing" / "when editing"', () => {
  const matches = matchOperatorPhrases("Whenever you're editing the auth module, also update the integration test.");
  const phrases = matches.map((match) => match.rule.pattern);
  assert.ok(phrases.includes("whenever you're editing"), `expected scope match; got ${phrases.join(', ')}`);
  const scopeMatch = matches.find((m) => m.rule.pattern === "whenever you're editing");
  assert.equal(scopeMatch?.rule.category, 'scope-setting');
  assert.match(scopeMatch?.rule.nudge ?? '', /kind:\s*"skill"/);
});

test('B3: session-boundary patterns fire on "wrapping up" and "starting fresh"', () => {
  const wrapping = matchOperatorPhrases("OK I'm wrapping up for the day.");
  assert.ok(wrapping.some((match) => match.rule.pattern === 'wrapping up' && match.rule.category === 'session-boundary'));
  assert.ok(wrapping.some((match) => /memory_handoff/.test(match.rule.nudge)));

  const fresh = matchOperatorPhrases('Starting fresh on the search-graph refactor.');
  assert.ok(fresh.some((match) => match.rule.pattern === 'starting fresh' && match.rule.category === 'session-boundary'));
  assert.ok(fresh.some((match) => /wiki_context/.test(match.rule.nudge)));
});

test('B3: reviewer-control verbs fire on "pin that", "promote that", "forget that"', () => {
  const pin = matchOperatorPhrases('Pin that one — it just saved me 2 hours.');
  assert.ok(pin.some((match) => match.rule.pattern === 'pin that' && /memory_pin/.test(match.rule.nudge)));

  const promote = matchOperatorPhrases('Promote that to a wiki page.');
  assert.ok(promote.some((match) => match.rule.pattern === 'promote that'));

  const forget = matchOperatorPhrases("Forget that one — it's outdated.");
  assert.ok(forget.some((match) => match.rule.pattern === 'forget that'));
});

test('B3: word-boundary check prevents "from now on" matching "from now once"', () => {
  // "from now once" should NOT match "from now on" because the pattern would have to
  // be followed by a non-letter — the "c" in "once" continues the word.
  const matches = matchOperatorPhrases('From now once we are confident, we will ship.');
  assert.ok(
    !matches.some((match) => match.rule.pattern === 'from now on'),
    'word-boundary check must reject "from now once" as a "from now on" match'
  );
});

test('B3: multiple categories can fire on a single prompt', () => {
  const prompt = "I'm wrapping up. From now on, pin that memory about the auth bug because we keep relearning it.";
  const matches = matchOperatorPhrases(prompt);
  const categories = new Set(matches.map((match) => match.rule.category));
  assert.ok(categories.has('session-boundary'), 'session-boundary should fire on "wrapping up"');
  assert.ok(categories.has('durable-intent'), 'durable-intent should fire on "from now on"');
  assert.ok(categories.has('reviewer-control'), 'reviewer-control should fire on "pin that"');
});

test('B3: matching is case-insensitive', () => {
  assert.ok(matchOperatorPhrases('FROM NOW ON, validate tokens.').some((m) => m.rule.pattern === 'from now on'));
  assert.ok(matchOperatorPhrases('From Now On, validate tokens.').some((m) => m.rule.pattern === 'from now on'));
});

test('B3: matched text preserves the original casing of the prompt', () => {
  const matches = matchOperatorPhrases('FROM NOW ON, do X.');
  const fromNowOn = matches.find((m) => m.rule.pattern === 'from now on');
  assert.equal(fromNowOn?.matchedText, 'FROM NOW ON', 'matchedText should preserve the casing of the user prompt');
});

test('B3: routine prose triggers no nudges', () => {
  // Sanity check that the phrasebook is quiet on ordinary task descriptions.
  const ordinary = [
    'Can you fix the bug in src/auth.ts?',
    'Run the tests and tell me if anything fails.',
    'What does the new ritual gate do?',
    'Show me the architecture page.'
  ];
  for (const prompt of ordinary) {
    const matches = matchOperatorPhrases(prompt);
    assert.equal(matches.length, 0, `expected no phrasebook matches on routine prose; got ${matches.length} for "${prompt}"`);
  }
});

test('B3: formatOperatorPhraseNudges returns empty string for no matches', () => {
  assert.equal(formatOperatorPhraseNudges([]), '');
});

test('B3: formatOperatorPhraseNudges produces a labelled multi-line block', () => {
  const matches = matchOperatorPhrases('From now on, pin that one.');
  const block = formatOperatorPhraseNudges(matches);
  assert.match(block, /^\[DENDRITE OPERATOR PHRASEBOOK\]/);
  assert.match(block, /\(durable-intent\)/);
  assert.match(block, /\(reviewer-control\)/);
  assert.match(block, /from now on/i);
  assert.match(block, /pin that/i);
});

test('B3: every category in OPERATOR_PHRASE_RULES has at least one rule', () => {
  const categories = new Set(OPERATOR_PHRASE_RULES.map((rule) => rule.category));
  assert.ok(categories.has('durable-intent'));
  assert.ok(categories.has('scope-setting'));
  assert.ok(categories.has('session-boundary'));
  assert.ok(categories.has('reviewer-control'));
});
