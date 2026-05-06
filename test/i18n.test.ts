import test from 'node:test';
import assert from 'node:assert/strict';
import { listAvailableDendriteLangs, resolveDendriteLang, translate } from '../src/wiki/i18n.js';

const ORIGINAL_LANG = process.env.DENDRITE_LANG;

function setLang(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.DENDRITE_LANG;
  } else {
    process.env.DENDRITE_LANG = value;
  }
}

function restoreLang(): void {
  setLang(ORIGINAL_LANG);
}

test('resolveDendriteLang defaults to en when DENDRITE_LANG is unset', () => {
  setLang(undefined);
  try {
    assert.equal(resolveDendriteLang(), 'en');
  } finally {
    restoreLang();
  }
});

test('resolveDendriteLang lowercases the env var and strips region suffix', () => {
  setLang('en-US');
  try {
    assert.equal(resolveDendriteLang(), 'en');
  } finally {
    restoreLang();
  }
  setLang('ZH-Hans');
  try {
    assert.equal(resolveDendriteLang(), 'zh');
  } finally {
    restoreLang();
  }
});

test('translate returns English by default', () => {
  setLang(undefined);
  try {
    const text = translate('observation-cluster-template-header', {
      kind: 'edit',
      target: 'src/foo.ts',
      observationCount: 4,
      distinctSessionCount: 2,
      lastSeen: '2026-05-05T12:00:00Z'
    });
    assert.match(text, /Recurring activity detected: edit on src\/foo\.ts/);
    assert.match(text, /4 observations across 2 sessions/);
  } finally {
    restoreLang();
  }
});

test('translate returns Spanish when DENDRITE_LANG=es and key is localized', () => {
  setLang('es');
  try {
    const text = translate('observation-cluster-template-header', {
      kind: 'edit',
      target: 'src/foo.ts',
      observationCount: 1,
      distinctSessionCount: 1,
      lastSeen: '2026-05-05T12:00:00Z'
    });
    assert.match(text, /Actividad recurrente detectada/);
    assert.match(text, /1 observación en 1 sesión/);
  } finally {
    restoreLang();
  }
});

test('translate falls back to English when the requested language has no entry for the key', () => {
  setLang('es');
  try {
    // The Spanish bundle intentionally does not localize this key — should fall back.
    const text = translate('observation-cluster-template-options-edit-or-read', {});
    assert.match(text, /a setup or onboarding gotcha/);
  } finally {
    restoreLang();
  }
});

test('translate returns the key itself if neither the requested language nor English has it', () => {
  setLang(undefined);
  try {
    // @ts-expect-error -- intentionally pass an unknown key to verify no-throw fallback.
    const text = translate('some-key-that-does-not-exist', {});
    assert.equal(text, 'some-key-that-does-not-exist');
  } finally {
    restoreLang();
  }
});

test('listAvailableDendriteLangs returns a sorted list of registered language codes', () => {
  const langs = listAvailableDendriteLangs();
  assert.ok(langs.includes('en'));
  assert.ok(langs.includes('es'));
  assert.deepEqual(langs, [...langs].sort());
});
