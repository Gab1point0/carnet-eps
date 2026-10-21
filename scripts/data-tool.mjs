#!/usr/bin/env node
// Outil en ligne de commande pour modifier proprement le fichier de données du Carnet EPS
// (celui synchronisé avec GitHub), à la main ou par Claude.
//
//   node scripts/data-tool.mjs summary  <fichier.json>
//   node scripts/data-tool.mjs validate <fichier.json>
//   node scripts/data-tool.mjs stamp    <fichier.json> [--base <ancien.json>]
//
// `stamp` compare le fichier à la version précédente (par défaut `git show HEAD:<fichier>`) et :
//   - met `updatedAt` = maintenant sur chaque élément ajouté ou modifié ;
//   - ajoute une « pierre tombale » pour chaque élément supprimé ;
// C'est ce qui permet à l'application de fusionner correctement vos modifications avec celles
// faites depuis le téléphone ou le PC.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const COLLECTIONS = ['years', 'classes', 'cycles', 'lessons', 'exercises'];
const [, , cmd, fileArg, ...rest] = process.argv;

function die(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

if (!cmd || !fileArg) {
  console.log('Usage : node scripts/data-tool.mjs <summary|validate|stamp> <fichier.json> [--base ancien.json]');
  process.exit(cmd ? 1 : 0);
}

const file = resolve(fileArg);
const parse = (text) => JSON.parse(text.replace(/^﻿/, '')); // tolère le BOM ajouté par certains éditeurs Windows
const read = (p) => parse(readFileSync(p, 'utf8'));
const data = (() => {
  try {
    return read(file);
  } catch (e) {
    return die(`Impossible de lire ${file} : ${e.message}`);
  }
})();

const strip = (e) => {
  const { updatedAt, ...r } = e;
  return JSON.stringify(r);
};

function summary() {
  const c = (k) => Object.keys(data[k] ?? {}).length;
  console.log(`Années : ${c('years')} · Classes : ${c('classes')} · Cycles : ${c('cycles')} · Séances : ${c('lessons')} · Situations : ${c('exercises')}`);
  for (const y of Object.values(data.years ?? {})) {
    console.log(`\n■ ${y.label} (${y.start} → ${y.end})`);
    for (const k of Object.values(data.classes ?? {}).filter((k) => k.yearId === y.id)) {
      const cycles = Object.values(data.cycles ?? {}).filter((x) => x.classId === k.id);
      console.log(`  • ${k.name} [${k.id}] — ${cycles.length} cycle(s)`);
      for (const cy of cycles) {
        const n = Object.values(data.lessons ?? {}).filter((l) => l.cycleId === cy.id).length;
        console.log(`      - ${cy.title} [${cy.id}] : ${n} séance(s), ${cy.startDate ?? '?'} → ${cy.endDate ?? '?'}`);
      }
    }
  }
}

function validate() {
  const problems = [];
  const ids = new Set();
  for (const col of COLLECTIONS) {
    for (const [key, e] of Object.entries(data[col] ?? {})) {
      if (e.id !== key) problems.push(`${col}/${key} : l'identifiant interne (${e.id}) ne correspond pas à la clé`);
      if (ids.has(key)) problems.push(`${key} : identifiant en double`);
      ids.add(key);
      if (typeof e.updatedAt !== 'number') problems.push(`${col}/${key} : updatedAt manquant (lancez « stamp »)`);
    }
  }
  const has = (col, id) => !!(data[col] ?? {})[id];
  for (const k of Object.values(data.classes ?? {})) if (!has('years', k.yearId)) problems.push(`classe ${k.name} : année ${k.yearId} introuvable`);
  for (const c of Object.values(data.cycles ?? {})) if (c.classId && !has('classes', c.classId)) problems.push(`cycle ${c.title} : classe ${c.classId} introuvable`);
  for (const l of Object.values(data.lessons ?? {})) {
    if (l.classId && !has('classes', l.classId)) problems.push(`séance ${l.title} : classe ${l.classId} introuvable`);
    if (l.cycleId && !has('cycles', l.cycleId)) problems.push(`séance ${l.title} : cycle ${l.cycleId} introuvable`);
    if (l.date && !/^\d{4}-\d{2}-\d{2}$/.test(l.date)) problems.push(`séance ${l.title} : date invalide « ${l.date} »`);
    for (const b of l.blocks ?? []) {
      if (!b.id) problems.push(`séance ${l.title} : un bloc n'a pas d'id`);
      const a = b.animation;
      if (a) {
        for (const f of a.frames ?? []) for (const t of a.tokens ?? []) if (!f.pos?.[t.id]) problems.push(`séance ${l.title} / bloc ${b.title} : le jeton ${t.id} n'a pas de position dans l'étape ${f.id}`);
      }
    }
  }
  for (const id of Object.keys(data.deleted ?? {})) if (ids.has(id)) problems.push(`${id} : à la fois présent et dans « deleted » (la suppression gagnera si elle est plus récente)`);
  if (problems.length) {
    console.log(problems.map((p) => `✖ ${p}`).join('\n'));
    console.log(`\n${problems.length} problème(s).`);
    process.exit(1);
  }
  console.log('✔ Fichier valide.');
}

function stamp() {
  const baseIdx = rest.indexOf('--base');
  let base;
  try {
    base = baseIdx >= 0 ? read(resolve(rest[baseIdx + 1])) : parse(execFileSync('git', ['show', `HEAD:./${basename(file)}`], { cwd: dirname(file), encoding: 'utf8', maxBuffer: 1 << 28 }));
  } catch {
    base = { years: {}, classes: {}, cycles: {}, lessons: {}, exercises: {}, deleted: {} };
    console.log('(aucune version précédente trouvée : tous les éléments sont considérés comme nouveaux)');
  }
  const now = Date.now();
  let changed = 0;
  let added = 0;
  let removed = 0;
  data.deleted = data.deleted ?? {};
  for (const col of COLLECTIONS) {
    data[col] = data[col] ?? {};
    for (const [id, e] of Object.entries(data[col])) {
      e.id = id;
      const old = (base[col] ?? {})[id];
      if (!old) {
        e.createdAt = e.createdAt ?? now;
        e.updatedAt = now;
        delete data.deleted[id];
        added++;
      } else if (strip(old) !== strip(e)) {
        e.updatedAt = now;
        changed++;
      }
    }
    for (const id of Object.keys(base[col] ?? {})) {
      if (!data[col][id] && !data.deleted[id]) {
        data.deleted[id] = now;
        removed++;
      }
    }
  }
  if (base.settings && JSON.stringify({ ...base.settings, updatedAt: 0 }) !== JSON.stringify({ ...(data.settings ?? {}), updatedAt: 0 })) {
    data.settings = { ...(data.settings ?? {}), updatedAt: now };
  }
  writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
  console.log(`✔ ${added} ajouté(s), ${changed} modifié(s), ${removed} supprimé(s). Fichier mis à jour.`);
}

const commands = { summary, validate, stamp };
if (commands[cmd]) commands[cmd]();
else die(`Commande inconnue : ${cmd}`);
