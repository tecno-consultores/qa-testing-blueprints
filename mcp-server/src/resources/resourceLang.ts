// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { AsyncLocalStorage } from 'node:async_hooks';
import type { ResourceLanguage } from '../types.js';

const resourceLangStorage = new AsyncLocalStorage<ResourceLanguage>();

export function parseResourceUriAndLang(rawUri: string): {
  baseUri: string;
  lang: ResourceLanguage;
} {
  const qIndex = rawUri.indexOf('?');
  if (qIndex === -1) {
    return { baseUri: rawUri, lang: 'en' };
  }
  const baseUri = rawUri.slice(0, qIndex);
  const query = rawUri.slice(qIndex + 1);
  const params = new URLSearchParams(query);
  const rawLang = params.get('lang')?.trim().toLowerCase();
  const lang: ResourceLanguage = rawLang === 'es' ? 'es' : 'en';
  return { baseUri, lang };
}

export function runWithResourceLang<T>(lang: ResourceLanguage, fn: () => T): T {
  return resourceLangStorage.run(lang, fn);
}

export function getActiveResourceLang(
  url?: URL,
  explicitLang?: ResourceLanguage
): ResourceLanguage {
  if (explicitLang) {
    return explicitLang;
  }
  const paramLang = url?.searchParams.get('lang')?.trim().toLowerCase();
  if (paramLang === 'es' || paramLang === 'en') {
    return paramLang;
  }
  return resourceLangStorage.getStore() ?? 'en';
}
