const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const LEGACY_KEY = 'manmul_inquiries';
const NAME = 'TEST_NAME_XSS<img src=x onerror="window.__xss=(window.__xss||0)+1">';
const PHONE = '010-1234-5678';
const MEMO = 'TEST_MEMO_MARK<svg onload="window.__xss=(window.__xss||0)+1"></svg>';
const SYMPTOM = 'TEST_SYMPTOM_MARK<img src=x onerror="window.__xss=(window.__xss||0)+1">';
const PII_MARKERS = ['TEST_NAME_XSS', PHONE, '01012345678', 'TEST_MEMO_MARK', 'TEST_SYMPTOM_MARK'];
const PUBLIC_LEAK_CASE = Object.freeze({
  slug: 'apartment-upper-lower-rain-pipe-repair',
  title: '대전 목양마을아파트 상·하층 우수관 보수 — 우수 배수부품 교체',
  service: 'leak', published: true,
});
const INTERIOR_CASE = Object.freeze({
  slug: 'interior-waterproof-case',
  title: '일반 욕실 방수 공정',
  service: 'interior', category: '방수·설비', published: true,
});
const DRAFT_LEAK_CASE = Object.freeze({
  slug: 'draft-leak-case',
  title: '비공개 누수 초안',
  service: 'leak', published: false,
});
const REFERENCE_MARKERS = [PUBLIC_LEAK_CASE.slug, PUBLIC_LEAK_CASE.title];
const ADMIN_THROW_MARKER = 'TASK4_REMOVE_THROWN_ONCE';
const ADMIN_CONFIG_MARKERS = [
  'TASK4_N8N_ENDPOINT_MARKER',
  'TASK4_FORM_ENDPOINT_MARKER',
  'TASK4_ACCESS_KEY_MARKER',
];

function installPrivacyWriteInstrumentation(sink, awaitName, legacyKey = null) {
  const NativeRequest = window.Request;
  const NativeResponse = window.Response;
  const NativeHeaders = window.Headers;
  const NativeFormData = window.FormData;
  const NativeBlob = window.Blob;
  const NativeFile = window.File;
  const NativeFileList = window.FileList;
  const NativeDOMException = window.DOMException;
  const NativeErrorStackDescriptor = Object.getOwnPropertyDescriptor(new Error(), 'stack');
  const AUDIT_FAILURE_KIND = 'PrivacyAuditFailure';
  const MAX_INSPECTION_DEPTH = 12;
  const MAX_INSPECTION_ENTRIES = 512;
  const pendingPrivacyInspections = new Set();
  const auditFailure = (reason) => ({ kind: AUDIT_FAILURE_KIND, reason });
  const consumeBudget = (budget, depth) => {
    if (depth >= MAX_INSPECTION_DEPTH) return auditFailure('depth-limit');
    budget.entries += 1;
    if (budget.entries >= MAX_INSPECTION_ENTRIES) return auditFailure('entry-limit');
    return null;
  };
  const propertyLabel = (key) => (
    typeof key === 'symbol' ? `[symbol:${String(key.description || '')}]` : String(key)
  );
  const ownEnumerableEntries = (value) => {
    try {
      return Reflect.ownKeys(value).map((key) => [key, Object.getOwnPropertyDescriptor(value, key)])
        .filter((entry) => entry[1] && entry[1].enumerable);
    } catch (_) {
      return auditFailure('property-descriptor-failed');
    }
  };
  const snapshotArrayWith = (value, seen, budget, depth, snapshotItem) => {
    const descriptors = ownEnumerableEntries(value);
    if (descriptors && descriptors.kind === AUDIT_FAILURE_KIND) return descriptors;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    const indexedKeys = new Set();
    const items = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const exhausted = consumeBudget(budget, depth + 1);
      if (exhausted) return exhausted;
      const key = String(index);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) {
        items.push('[empty]');
        continue;
      }
      indexedKeys.add(key);
      if (!('value' in descriptor)) {
        return auditFailure(`array-accessor-property:${propertyLabel(key)}`);
      }
      items.push(snapshotItem(descriptor.value, seen, budget, depth + 1));
    }
    const properties = [];
    for (const [key, descriptor] of descriptors) {
      if (typeof key === 'string' && indexedKeys.has(key)) continue;
      const exhausted = consumeBudget(budget, depth + 1);
      if (exhausted) return exhausted;
      if (!('value' in descriptor)) {
        return auditFailure(`array-accessor-property:${propertyLabel(key)}`);
      }
      properties.push([
        propertyLabel(key),
        snapshotItem(descriptor.value, seen, budget, depth + 1),
      ]);
    }
    return { snapshotKind: 'Array', items, properties };
  };
  const snapshotHeaderEntries = (headers, budget, depth) => {
    const entries = [];
    let failure = null;
    NativeHeaders.prototype.forEach.call(headers, (value, key) => {
      if (failure) return;
      const exhausted = consumeBudget(budget, depth + 1);
      if (exhausted) {
        failure = exhausted;
        return;
      }
      entries.push([key, value]);
    });
    return failure || entries;
  };
  const inspectHeaderEntries = (entries, budget, depth) => {
    if (entries && entries.kind === AUDIT_FAILURE_KIND) return entries;
    const inspected = [];
    for (const entry of entries) {
      const exhausted = consumeBudget(budget, depth + 1);
      if (exhausted) return exhausted;
      inspected.push(entry);
    }
    return inspected;
  };
  const snapshotPrivacyValue = (value, seen = new WeakSet(), budget = { entries: 0 }, depth = 0) => {
    const exhausted = consumeBudget(budget, depth);
    if (exhausted) return exhausted;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    if (typeof value === 'undefined') return '[undefined]';
    if (typeof value === 'bigint') return { snapshotKind: 'BigInt', value: String(value) };
    if (['symbol', 'function'].includes(typeof value)) return auditFailure('uncloneable-type');
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    try {
      if (typeof NativeRequest === 'function' && value instanceof NativeRequest) {
        const clone = NativeRequest.prototype.clone.call(value);
        return {
          snapshotKind: 'Request',
          url: String(clone.url || ''),
          method: String(clone.method || ''),
          referrer: String(clone.referrer || ''),
          headers: snapshotHeaderEntries(clone.headers, budget, depth),
          body: clone,
        };
      }
      if (typeof NativeResponse === 'function' && value instanceof NativeResponse) {
        const clone = NativeResponse.prototype.clone.call(value);
        return {
          snapshotKind: 'Response',
          url: String(clone.url || ''),
          status: clone.status,
          statusText: String(clone.statusText || ''),
          headers: snapshotHeaderEntries(clone.headers, budget, depth),
          body: clone,
        };
      }
      if (typeof NativeHeaders === 'function' && value instanceof NativeHeaders) {
        return {
          snapshotKind: 'Headers',
          entries: snapshotHeaderEntries(value, budget, depth),
        };
      }
      if (typeof NativeFormData === 'function' && value instanceof NativeFormData) {
        const entries = [];
        NativeFormData.prototype.forEach.call(value, (item, key) => {
          entries.push([String(key), snapshotPrivacyValue(item, seen, budget, depth + 1)]);
        });
        return { snapshotKind: 'FormData', entries };
      }
      if (typeof NativeFileList === 'function' && value instanceof NativeFileList) {
        const length = Object.getOwnPropertyDescriptor(NativeFileList.prototype, 'length').get.call(value);
        const files = [];
        for (let index = 0; index < length; index += 1) {
          files.push(snapshotPrivacyValue(
            NativeFileList.prototype.item.call(value, index),
            seen,
            budget,
            depth + 1
          ));
        }
        return { snapshotKind: 'FileList', files };
      }
      if (typeof NativeFile === 'function' && value instanceof NativeFile) {
        return {
          snapshotKind: 'File',
          name: String(value.name || ''),
          type: String(value.type || ''),
          lastModified: value.lastModified,
          body: NativeBlob.prototype.slice.call(value, 0, value.size, value.type),
        };
      }
      if (typeof NativeBlob === 'function' && value instanceof NativeBlob) {
        return {
          snapshotKind: 'Blob',
          type: String(value.type || ''),
          body: NativeBlob.prototype.slice.call(value, 0, value.size, value.type),
        };
      }
      if (typeof NativeDOMException === 'function' && value instanceof NativeDOMException) {
        const metadata = ownEnumerableEntries(value);
        if (metadata && metadata.kind === AUDIT_FAILURE_KIND) return metadata;
        for (const [, descriptor] of metadata) {
          if (!('value' in descriptor)) return auditFailure('accessor-property');
        }
        const domField = (field) => {
          const own = Object.getOwnPropertyDescriptor(value, field);
          if (own) return 'value' in own ? own.value : auditFailure('accessor-property');
          return Object.getOwnPropertyDescriptor(NativeDOMException.prototype, field).get.call(value);
        };
        const fields = [domField('name'), domField('message'), domField('code')];
        if (fields.some((field) => field && field.kind === AUDIT_FAILURE_KIND)) {
          return auditFailure('accessor-property');
        }
        return {
          snapshotKind: 'DOMException',
          name: String(fields[0] || ''),
          message: String(fields[1] || ''),
          code: fields[2],
          metadata: metadata.map(([key, descriptor]) => [
            propertyLabel(key),
            snapshotPrivacyValue(descriptor.value, seen, budget, depth + 1),
          ]),
        };
      }
      if (value instanceof Error) {
        const descriptors = ownEnumerableEntries(value);
        if (descriptors && descriptors.kind === AUDIT_FAILURE_KIND) return descriptors;
        for (const [key, descriptor] of descriptors) {
          if (!('value' in descriptor)) {
            return auditFailure(`accessor-metadata:${propertyLabel(key)}`);
          }
        }
        const readDataProperty = (field, fallback = '') => {
          let target = value;
          while (target) {
            const descriptor = Object.getOwnPropertyDescriptor(target, field);
            if (descriptor) {
              if (
                field === 'stack'
                && target === value
                && NativeErrorStackDescriptor
                && descriptor.get === NativeErrorStackDescriptor.get
                && descriptor.set === NativeErrorStackDescriptor.set
              ) {
                return descriptor.get.call(value);
              }
              return 'value' in descriptor
                ? descriptor.value
                : auditFailure(`accessor-property:${field}`);
            }
            target = Object.getPrototypeOf(target);
          }
          return fallback;
        };
        const name = readDataProperty('name');
        const message = readDataProperty('message');
        const stack = readDataProperty('stack');
        const fieldFailure = [name, message, stack]
          .find((field) => field && field.kind === AUDIT_FAILURE_KIND);
        if (fieldFailure) return fieldFailure;
        const causeDescriptor = Object.getOwnPropertyDescriptor(value, 'cause');
        if (causeDescriptor && !('value' in causeDescriptor)) return auditFailure('accessor-property');
        const errorsDescriptor = typeof AggregateError === 'function' && value instanceof AggregateError
          ? Object.getOwnPropertyDescriptor(value, 'errors')
          : null;
        if (errorsDescriptor && !('value' in errorsDescriptor)) return auditFailure('accessor-property');
        const excluded = new Set(['name', 'message', 'stack', 'cause', 'errors']);
        return {
          snapshotKind: typeof AggregateError === 'function' && value instanceof AggregateError
            ? 'AggregateError'
            : 'Error',
          name: String(name || ''),
          message: String(message || ''),
          stack: String(stack || ''),
          cause: causeDescriptor
            ? snapshotPrivacyValue(causeDescriptor.value, seen, budget, depth + 1)
            : '[no-cause]',
          errors: errorsDescriptor
            ? snapshotPrivacyValue(errorsDescriptor.value, seen, budget, depth + 1)
            : '[no-errors]',
          metadata: descriptors.filter(([key]) => !excluded.has(String(key))).map(([key, descriptor]) => [
            propertyLabel(key),
            snapshotPrivacyValue(descriptor.value, seen, budget, depth + 1),
          ]),
        };
      }
      if (typeof URL === 'function' && value instanceof URL) {
        return { snapshotKind: 'URL', href: String(value.href) };
      }
      if (typeof URLSearchParams === 'function' && value instanceof URLSearchParams) {
        return { snapshotKind: 'URLSearchParams', value: URLSearchParams.prototype.toString.call(value) };
      }
      if (Array.isArray(value)) {
        return snapshotArrayWith(value, seen, budget, depth, snapshotPrivacyValue);
      }
      const descriptors = ownEnumerableEntries(value);
      if (descriptors && descriptors.kind === AUDIT_FAILURE_KIND) return descriptors;
      for (const [, descriptor] of descriptors) {
        if (!('value' in descriptor)) return auditFailure('accessor-property');
      }
      const auditNested = (item, nestedSeen = new WeakSet(), nestedDepth = depth + 1) => {
        const nestedExhausted = consumeBudget(budget, nestedDepth);
        if (nestedExhausted) return nestedExhausted;
        if (item === null || !['object', 'function'].includes(typeof item)) {
          return ['symbol', 'function'].includes(typeof item)
            ? auditFailure('uncloneable-type')
            : null;
        }
        if (nestedSeen.has(item)) return null;
        nestedSeen.add(item);
        if (
          (typeof NativeRequest === 'function' && item instanceof NativeRequest)
          || (typeof NativeResponse === 'function' && item instanceof NativeResponse)
          || (typeof NativeHeaders === 'function' && item instanceof NativeHeaders)
          || (typeof NativeFormData === 'function' && item instanceof NativeFormData)
          || (typeof NativeFileList === 'function' && item instanceof NativeFileList)
          || (typeof NativeDOMException === 'function' && item instanceof NativeDOMException)
          || item instanceof Error
          || (typeof URL === 'function' && item instanceof URL)
          || (typeof URLSearchParams === 'function' && item instanceof URLSearchParams)
        ) return auditFailure('nested-special-value');
        const nestedDescriptors = ownEnumerableEntries(item);
        if (nestedDescriptors && nestedDescriptors.kind === AUDIT_FAILURE_KIND) return nestedDescriptors;
        for (const [, descriptor] of nestedDescriptors) {
          if (!('value' in descriptor)) return auditFailure('accessor-property');
          const problem = auditNested(descriptor.value, nestedSeen, nestedDepth + 1);
          if (problem) return problem;
        }
        if (item instanceof Map) {
          let problem = null;
          Map.prototype.forEach.call(item, (mapValue, mapKey) => {
            if (!problem) problem = auditNested(mapKey, nestedSeen, nestedDepth + 1);
            if (!problem) problem = auditNested(mapValue, nestedSeen, nestedDepth + 1);
          });
          if (problem) return problem;
        }
        if (item instanceof Set) {
          let problem = null;
          Set.prototype.forEach.call(item, (setValue) => {
            if (!problem) problem = auditNested(setValue, nestedSeen, nestedDepth + 1);
          });
          if (problem) return problem;
        }
        return null;
      };
      const cloneProblem = auditNested(value);
      if (cloneProblem) return cloneProblem;
      try {
        return { snapshotKind: 'StructuredClone', value: structuredClone(value) };
      } catch (_) {
        return auditFailure('structured-clone-failed');
      }
    } catch (_) {
      return auditFailure('snapshot-failed');
    } finally {
      seen.delete(value);
    }
  };
  const snapshotDomStringArgument = (value, seen, budget, depth, method, argument) => {
    if (
      value === null
      || ['undefined', 'string', 'number', 'boolean', 'bigint'].includes(typeof value)
    ) {
      return snapshotPrivacyValue(value, seen, budget, depth);
    }
    return auditFailure(`domstring-coercion-ambiguity:${method}:${argument}`);
  };
  const snapshotBoundarySequence = (
    value,
    seen,
    budget,
    depth,
    itemSnapshot,
    ambiguityReason
  ) => {
    if (!Array.isArray(value)) return auditFailure(ambiguityReason);
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    try {
      return snapshotArrayWith(value, seen, budget, depth, itemSnapshot);
    } catch (_) {
      return auditFailure('snapshot-failed');
    } finally {
      seen.delete(value);
    }
  };
  const snapshotIdbKeyPath = (value, seen, budget, depth, method) => {
    if (value === null) return null;
    if (Array.isArray(value)) {
      return snapshotBoundarySequence(
        value,
        seen,
        budget,
        depth,
        (item, itemSeen, itemBudget, itemDepth) => snapshotDomStringArgument(
          item,
          itemSeen,
          itemBudget,
          itemDepth,
          method,
          'keyPath'
        ),
        `domstring-coercion-ambiguity:${method}:keyPath`
      );
    }
    return snapshotDomStringArgument(value, seen, budget, depth, method, 'keyPath');
  };
  const inheritedPropertyDescriptor = (value, key) => {
    let target = value;
    while (target !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (descriptor) return descriptor;
      target = Object.getPrototypeOf(target);
    }
    return null;
  };
  const snapshotObjectStoreOptions = (value, seen, budget, depth) => {
    const snapshot = snapshotPrivacyValue(value, seen, budget, depth);
    if (value === null || !['object', 'function'].includes(typeof value)) return snapshot;
    try {
      const keyPathDescriptor = inheritedPropertyDescriptor(value, 'keyPath');
      if (!keyPathDescriptor) return snapshot;
      if (!('value' in keyPathDescriptor)) return auditFailure('accessor-property:keyPath');
      const keyPathSnapshot = snapshotIdbKeyPath(
        keyPathDescriptor.value,
        new WeakSet(),
        { entries: 0 },
        0,
        'createObjectStore'
      );
      return keyPathSnapshot && keyPathSnapshot.kind === AUDIT_FAILURE_KIND
        ? keyPathSnapshot
        : snapshot;
    } catch (_) {
      return auditFailure('property-descriptor-failed');
    }
  };
  const snapshotIdbKey = (value, seen, budget, depth, method) => {
    if (typeof value === 'string' || typeof value === 'number') {
      return snapshotPrivacyValue(value, seen, budget, depth);
    }
    if (
      value instanceof Date
      || value instanceof ArrayBuffer
      || ArrayBuffer.isView(value)
    ) {
      return snapshotPrivacyValue(value, seen, budget, depth);
    }
    if (Array.isArray(value)) {
      return snapshotBoundarySequence(
        value,
        seen,
        budget,
        depth,
        (item, itemSeen, itemBudget, itemDepth) => snapshotIdbKey(
          item,
          itemSeen,
          itemBudget,
          itemDepth,
          method
        ),
        `idb-key-type-ambiguity:${method}:key`
      );
    }
    return auditFailure(`idb-key-type-ambiguity:${method}:key`);
  };
  const snapshotCacheRequest = (value, seen, budget, depth, method) => {
    if (typeof NativeRequest === 'function' && value instanceof NativeRequest) {
      return snapshotPrivacyValue(value, seen, budget, depth);
    }
    return snapshotDomStringArgument(value, seen, budget, depth, method, 'request');
  };
  const snapshotCacheRequestSequence = (value, seen, budget, depth) => snapshotBoundarySequence(
    value,
    seen,
    budget,
    depth,
    (item, itemSeen, itemBudget, itemDepth) => snapshotCacheRequest(
      item,
      itemSeen,
      itemBudget,
      itemDepth,
      'Cache.addAll'
    ),
    'domstring-coercion-ambiguity:Cache.addAll:requests'
  );
  const inspectStableValue = async (value, seen = new WeakSet(), budget = { entries: 0 }, depth = 0) => {
    const exhausted = consumeBudget(budget, depth);
    if (exhausted) return exhausted;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    if (typeof value === 'undefined') return '[undefined]';
    if (value && value.kind === AUDIT_FAILURE_KIND) return value;
    if (value && value.snapshotKind === 'BigInt') return { kind: 'BigInt', value: value.value };
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    try {
      if (value.snapshotKind === 'Request' || value.snapshotKind === 'Response') {
        let body;
        try { body = await value.body.text(); }
        catch (_) { body = auditFailure('body-read-failed'); }
        return {
          kind: value.snapshotKind,
          url: value.url,
          method: value.method,
          referrer: value.referrer,
          status: value.status,
          statusText: value.statusText,
          headers: inspectHeaderEntries(value.headers, budget, depth),
          body,
        };
      }
      if (value.snapshotKind === 'Headers') {
        return { kind: 'Headers', entries: inspectHeaderEntries(value.entries, budget, depth) };
      }
      if (value.snapshotKind === 'FormData') {
        const entries = [];
        for (const [key, item] of value.entries) {
          entries.push([key, await inspectStableValue(item, seen, budget, depth + 1)]);
        }
        return { kind: 'FormData', entries };
      }
      if (value.snapshotKind === 'FileList') {
        const files = [];
        for (const file of value.files) files.push(await inspectStableValue(file, seen, budget, depth + 1));
        return { kind: 'FileList', files };
      }
      if (value.snapshotKind === 'File' || value.snapshotKind === 'Blob') {
        let text;
        try { text = await NativeBlob.prototype.text.call(value.body); }
        catch (_) { text = auditFailure('body-read-failed'); }
        return {
          kind: value.snapshotKind,
          name: value.name,
          type: value.type,
          lastModified: value.lastModified,
          text,
        };
      }
      if (['Error', 'AggregateError', 'DOMException'].includes(value.snapshotKind)) {
        return {
          kind: value.snapshotKind,
          name: value.name,
          message: value.message,
          stack: value.stack,
          code: value.code,
          cause: await inspectStableValue(value.cause, seen, budget, depth + 1),
          errors: await inspectStableValue(value.errors, seen, budget, depth + 1),
          metadata: await inspectStableValue(value.metadata, seen, budget, depth + 1),
        };
      }
      if (value.snapshotKind === 'URL') return { kind: 'URL', href: value.href };
      if (value.snapshotKind === 'URLSearchParams') return { kind: 'URLSearchParams', value: value.value };
      if (value.snapshotKind === 'Array') {
        const items = [];
        for (const item of value.items) {
          items.push(await inspectStableValue(item, seen, budget, depth + 1));
        }
        const properties = [];
        for (const [key, item] of value.properties || []) {
          properties.push([key, await inspectStableValue(item, seen, budget, depth + 1)]);
        }
        return { kind: 'Array', items, properties };
      }
      if (value.snapshotKind === 'StructuredClone') {
        return inspectStableValue(value.value, seen, budget, depth + 1);
      }
      if (value instanceof Date) {
        const time = Date.prototype.getTime.call(value);
        return Number.isFinite(time)
          ? { kind: 'Date', value: new Date(time).toISOString() }
          : auditFailure('invalid-date');
      }
      if (value instanceof RegExp) {
        return {
          kind: 'RegExp',
          source: Object.getOwnPropertyDescriptor(RegExp.prototype, 'source').get.call(value),
          flags: Object.getOwnPropertyDescriptor(RegExp.prototype, 'flags').get.call(value),
        };
      }
      if (value instanceof Map) {
        const rawEntries = [];
        Map.prototype.forEach.call(value, (item, key) => rawEntries.push([key, item]));
        const entries = [];
        for (const [key, item] of rawEntries) {
          entries.push([
            await inspectStableValue(key, seen, budget, depth + 1),
            await inspectStableValue(item, seen, budget, depth + 1),
          ]);
        }
        return { kind: 'Map', entries };
      }
      if (value instanceof Set) {
        const rawValues = [];
        Set.prototype.forEach.call(value, (item) => rawValues.push(item));
        const values = [];
        for (const item of rawValues) values.push(await inspectStableValue(item, seen, budget, depth + 1));
        return { kind: 'Set', values };
      }
      if (typeof NativeFile === 'function' && value instanceof NativeFile) {
        return inspectStableValue(snapshotPrivacyValue(value), seen, budget, depth + 1);
      }
      if (typeof NativeBlob === 'function' && value instanceof NativeBlob) {
        return inspectStableValue(snapshotPrivacyValue(value), seen, budget, depth + 1);
      }
      if (value instanceof ArrayBuffer) {
        return { kind: 'ArrayBuffer', text: new TextDecoder().decode(new Uint8Array(value)) };
      }
      if (ArrayBuffer.isView(value)) {
        return {
          kind: String(value.constructor && value.constructor.name || 'ArrayBufferView'),
          text: new TextDecoder().decode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
        };
      }
      const descriptors = ownEnumerableEntries(value);
      if (descriptors && descriptors.kind === AUDIT_FAILURE_KIND) return descriptors;
      for (const [, descriptor] of descriptors) {
        if (!('value' in descriptor)) return auditFailure('accessor-property');
      }
      if (Array.isArray(value)) {
        const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
        const indexedKeys = new Set();
        const items = [];
        for (let index = 0; index < lengthDescriptor.value; index += 1) {
          const exhausted = consumeBudget(budget, depth + 1);
          if (exhausted) return exhausted;
          const key = String(index);
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (!descriptor) {
            items.push('[empty]');
            continue;
          }
          indexedKeys.add(key);
          if (!('value' in descriptor)) {
            return auditFailure(`array-accessor-property:${propertyLabel(key)}`);
          }
          items.push(await inspectStableValue(descriptor.value, seen, budget, depth + 1));
        }
        const properties = [];
        for (const [key, descriptor] of descriptors) {
          if (typeof key === 'string' && indexedKeys.has(key)) continue;
          const exhausted = consumeBudget(budget, depth + 1);
          if (exhausted) return exhausted;
          if (!('value' in descriptor)) {
            return auditFailure(`array-accessor-property:${propertyLabel(key)}`);
          }
          properties.push([
            propertyLabel(key),
            await inspectStableValue(descriptor.value, seen, budget, depth + 1),
          ]);
        }
        return { kind: 'Array', items, properties };
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype === Object.prototype || prototype === null) {
        const entries = [];
        for (const [key, descriptor] of descriptors) {
          entries.push([
            propertyLabel(key),
            await inspectStableValue(descriptor.value, seen, budget, depth + 1),
          ]);
        }
        return { kind: 'Object', entries };
      }
      return auditFailure('unsupported-type');
    } catch (_) {
      return auditFailure('inspection-failed');
    } finally {
      seen.delete(value);
    }
  };
  const queuePrivacyInspection = (sink, method, args, snapshotters = []) => {
    let snapshots;
    try {
      snapshots = args.map((value, index) => {
        const snapshotter = snapshotters[index] || snapshotPrivacyValue;
        return snapshotter(value, new WeakSet(), { entries: 0 }, 0);
      });
    } catch (_) {
      snapshots = [auditFailure('snapshot-queue-failed')];
    }
    const inspection = Promise.all(snapshots.map((value) => inspectStableValue(value))).then(
      (values) => { sink.push([method, values]); },
      () => { sink.push([method, [auditFailure('privacy-inspection-rejected')]]); }
    );
    pendingPrivacyInspections.add(inspection);
    inspection.then(
      () => pendingPrivacyInspections.delete(inspection),
      () => pendingPrivacyInspections.delete(inspection)
    );
  };
  window[awaitName] = async () => {
    while (pendingPrivacyInspections.size) {
      await Promise.all(Array.from(pendingPrivacyInspections));
    }
  };
  window.__xss = 0;
  window.__retryCallCount = 0;
  window.__rememberCallCount = 0;
  window.__clearFailureArgs = [];
  window.__successTransitions = 0;

  const originalStorageSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (...args) {
    if (args.length < 2) return originalStorageSet.apply(this, args);
    const stringKey = String(args[0]);
    const stringValue = String(args[1]);
    if (legacyKey !== null && stringKey === legacyKey && typeof sink.legacySets === 'number') {
      sink.legacySets += 1;
    }
    sink.storage.push([stringKey, stringValue]);
    return originalStorageSet.call(this, stringKey, stringValue);
  };

  if (window.IDBObjectStore) {
    for (const method of ['add', 'put']) {
      const original = IDBObjectStore.prototype[method];
      if (!original) continue;
      IDBObjectStore.prototype[method] = function (...args) {
        queuePrivacyInspection(sink.idb, method, args, [
          snapshotPrivacyValue,
          (value, seen, budget, depth) => snapshotIdbKey(value, seen, budget, depth, method),
        ]);
        return original.apply(this, args);
      };
    }
    if (IDBObjectStore.prototype.createIndex) {
      const originalCreateIndex = IDBObjectStore.prototype.createIndex;
      IDBObjectStore.prototype.createIndex = function (...args) {
        queuePrivacyInspection(sink.idb, 'createIndex', args, [
          (value, seen, budget, depth) => snapshotDomStringArgument(
            value,
            seen,
            budget,
            depth,
            'createIndex',
            'name'
          ),
          (value, seen, budget, depth) => snapshotIdbKeyPath(
            value,
            seen,
            budget,
            depth,
            'createIndex'
          ),
          snapshotPrivacyValue,
        ]);
        return originalCreateIndex.apply(this, args);
      };
    }
  }
  if (window.IDBDatabase && IDBDatabase.prototype.createObjectStore) {
    const originalCreateObjectStore = IDBDatabase.prototype.createObjectStore;
    IDBDatabase.prototype.createObjectStore = function (...args) {
      queuePrivacyInspection(sink.idb, 'createObjectStore', args, [
        (value, seen, budget, depth) => snapshotDomStringArgument(
          value,
          seen,
          budget,
          depth,
          'createObjectStore',
          'name'
        ),
        snapshotObjectStoreOptions,
      ]);
      return originalCreateObjectStore.apply(this, args);
    };
  }
  if (window.IDBFactory && IDBFactory.prototype.open) {
    const originalIdbOpen = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) {
      queuePrivacyInspection(sink.idb, 'indexedDB.open', args, [
        (value, seen, budget, depth) => snapshotDomStringArgument(
          value,
          seen,
          budget,
          depth,
          'indexedDB.open',
          'name'
        ),
        snapshotPrivacyValue,
      ]);
      return originalIdbOpen.apply(this, args);
    };
  }
  if (window.IDBCursor && IDBCursor.prototype.update) {
    const originalCursorUpdate = IDBCursor.prototype.update;
    IDBCursor.prototype.update = function (...args) {
      queuePrivacyInspection(sink.idb, 'cursor.update', args);
      return originalCursorUpdate.apply(this, args);
    };
  }

  if (window.CacheStorage && CacheStorage.prototype.open) {
    const originalCacheOpen = CacheStorage.prototype.open;
    CacheStorage.prototype.open = function (...args) {
      queuePrivacyInspection(sink.cache, 'storage.open', args, [
        (value, seen, budget, depth) => snapshotDomStringArgument(
          value,
          seen,
          budget,
          depth,
          'CacheStorage.open',
          'cacheName'
        ),
      ]);
      return originalCacheOpen.apply(this, args);
    };
  }
  if (window.Cache) {
    for (const method of ['put', 'add', 'addAll']) {
      const original = Cache.prototype[method];
      if (!original) continue;
      Cache.prototype[method] = function (...args) {
        const snapshotters = method === 'put'
          ? [
            (value, seen, budget, depth) => snapshotCacheRequest(
              value,
              seen,
              budget,
              depth,
              'Cache.put'
            ),
            snapshotPrivacyValue,
          ]
          : method === 'add'
            ? [(value, seen, budget, depth) => snapshotCacheRequest(
              value,
              seen,
              budget,
              depth,
              'Cache.add'
            )]
            : [snapshotCacheRequestSequence];
        queuePrivacyInspection(sink.cache, method, args, snapshotters);
        return original.apply(this, args);
      };
    }
  }

  for (const method of ['log', 'info', 'warn', 'error']) {
    const original = console[method];
    console[method] = function (...args) {
      queuePrivacyInspection(sink.console, method, args);
      return original.apply(this, args);
    };
  }

}

const PRIVACY_BOOTSTRAP_SOURCE = `(${installPrivacyWriteInstrumentation.toString()})`;


const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

let server;
let browser;
let origin;

before(async () => {
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(ROOT, rel);
    if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

function n8nConfig() {
  return {
    demoMode: false,
    n8n: { enabled: true, inquiryWebhookUrl: `${origin}/__lead` },
    forms: { enabled: false, provider: '', endpoint: '', accessKey: '' },
    kakao: { ready: true, chatUrl: 'https://chat.test.invalid/channel' },
  };
}

function formsConfig(provider) {
  return {
    demoMode: false,
    n8n: { enabled: false, inquiryWebhookUrl: '' },
    forms: { enabled: true, provider, endpoint: `${origin}/__lead`, accessKey: 'TEST_ONLY_KEY' },
    kakao: { ready: true, chatUrl: 'https://chat.test.invalid/channel' },
  };
}

function adminSiteFixture() {
  return {
    company: {
      name: 'SAFE_COMPANY', brandEn: 'SAFE BRAND', specialty: 'SAFE SPECIALTY',
      tagline: 'SAFE TAGLINE', description: 'SAFE DESCRIPTION', rep: 'SAFE REP',
      repTitle: 'SAFE TITLE', phone: '000-0000-0000', email: 'safe@example.invalid',
      hours: 'SAFE HOURS', address: 'SAFE ADDRESS', bizno: '000-00-00000',
    },
    about: { headline: 'SAFE HEADLINE', lead: 'SAFE LEAD' },
    services: Array.from({ length: 4 }, (_, index) => ({
      title: `SAFE SERVICE ${index + 1}`,
      desc: `SAFE SERVICE DESCRIPTION ${index + 1}`,
      tags: ['SAFE'],
    })),
    actualWork: Array.from({ length: 3 }, (_, index) => ({
      label: `SAFE LABEL ${index + 1}`,
      cta: 'SAFE CTA',
      title: `SAFE WORK ${index + 1}`,
      desc: `SAFE WORK DESCRIPTION ${index + 1}`,
      image: `assets/safe-${index + 1}.jpg`,
      imageAlt: `SAFE ALT ${index + 1}`,
      href: `posts/safe-${index + 1}.html`,
    })),
    faq: Array.from({ length: 4 }, (_, index) => ({
      q: `SAFE QUESTION ${index + 1}`,
      a: `SAFE ANSWER ${index + 1}`,
    })),
    portfolio: Array.from({ length: 300 }, (_, index) => ({ id: `SAFE-${index + 1}` })),
  };
}

function adminConfig({ provider = '', n8n = false, both = false } = {}) {
  return {
    demoMode: false,
    n8n: {
      enabled: n8n || both,
      inquiryWebhookUrl: n8n || both ? `${origin}/__lead` : '',
    },
    forms: {
      enabled: !!provider || both,
      provider: both ? 'web3forms' : provider,
      endpoint: provider || both ? `${origin}/__lead` : '',
      accessKey: provider || both ? 'TEST_ONLY_KEY' : '',
    },
    kakao: { ready: false, chatUrl: '', channelAddUrl: '', channelPublicId: '' },
    hyeonjang: { appUrl: '' },
  };
}

function json(body, status = 200) {
  return { kind: 'response', status, body: JSON.stringify(body) };
}

function raw(body, status = 200) {
  return { kind: 'response', status, body };
}

function deferredResponse() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { kind: 'deferred', promise, resolve };
}

async function openForm(kind, options = {}) {
  const viewport = options.viewport || { width: 1280, height: 900 };
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const controller = {
    responses: [...(options.responses || [json({ ok: false })])],
    requests: [],
    urls: [],
    configRequests: [],
    configResponse: options.configResponse || null,
    caseIndexResponse: options.caseIndexResponse || (options.caseIndex ? json(options.caseIndex) : null),
  };

  await context.addInitScript((privacyBootstrapSource) => {
    const serialise = (value) => {
      try { return typeof value === 'string' ? value : JSON.stringify(value); }
      catch (_) { return String(value); }
    };
    const sinks = window.__leadSinks = {
      storage: [], idb: [], cache: [], console: [], urls: [], clipboard: [], actions: [],
    };
    const installPrivacyWrites = (0, eval)(privacyBootstrapSource);
    installPrivacyWrites(sinks, '__leadAwaitPrivacyInspections');

    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      const value = input && typeof input === 'object' && 'url' in input ? input.url : input;
      sinks.urls.push(['fetch', String(value)]);
      return originalFetch.call(this, input, init);
    };

    const OriginalRequest = window.Request;
    window.Request = class InstrumentedRequest extends OriginalRequest {
      constructor(input, init) {
        const value = input && typeof input === 'object' && 'url' in input ? input.url : input;
        sinks.urls.push(['Request', String(value)]);
        super(input, init);
      }
    };

    window.open = function (url, ...args) {
      sinks.urls.push(['window.open', String(url)]);
      sinks.actions.push(['window.open', String(url), args.map(serialise)]);
      return null;
    };

    document.addEventListener('click', (event) => {
      const anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
      if (!anchor) return;
      const href = anchor.href || anchor.getAttribute('href') || '';
      if (/^(?:tel:|sms:)/i.test(href) || /^https:\/\/chat\.test\.invalid\//i.test(href)) {
        sinks.actions.push(['link', href]);
        event.preventDefault();
      }
    }, true);

    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function (state, title, url) {
        if (url != null) sinks.urls.push([`history.${method}`, String(url)]);
        return original.call(this, state, title, url);
      };
    }

    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText(text) { sinks.clipboard.push(String(text)); return Promise.resolve(); } },
      });
    } catch (_) {}

    let leadApi;
    Object.defineProperty(window, 'ManmulLead', {
      configurable: true,
      get() { return leadApi; },
      set(value) {
        if (value && typeof value.retryLatest === 'function') {
          const retryLatest = value.retryLatest;
          value.retryLatest = function (...args) {
            window.__retryCallCount += 1;
            return retryLatest.apply(this, args);
          };
        }
        if (value && typeof value.clearFailure === 'function') {
          const clearFailure = value.clearFailure;
          value.clearFailure = function (...args) {
            window.__clearFailureArgs.push(args[0]);
            return clearFailure.apply(this, args);
          };
        }
        if (value && typeof value.rememberFailure === 'function') {
          const rememberFailure = value.rememberFailure;
          value.rememberFailure = function (...args) {
            window.__rememberCallCount += 1;
            return rememberFailure.apply(this, args);
          };
        }
        leadApi = value;
      },
    });

    document.addEventListener('DOMContentLoaded', () => {
      let wasSuccess = false;
      const observe = () => {
        const text = document.body ? document.body.innerText : '';
        const isSuccess = /상담 신청이 전달되었습니다|접수됐습니다\./.test(text);
        if (isSuccess && !wasSuccess) window.__successTransitions += 1;
        wasSuccess = isSuccess;
      };
      const observer = new MutationObserver(observe);
      observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
      observe();
    });
  }, PRIVACY_BOOTSTRAP_SOURCE);

  const config = options.config || n8nConfig();
  await context.route('**/*', async (route) => {
    const request = route.request();
    controller.urls.push(request.url());
    const url = new URL(request.url());
    if (url.origin === origin && url.pathname === '/data/config.json') {
      controller.configRequests.push(request.url());
      const response = controller.configResponse;
      if (response && response.kind === 'abort') {
        await route.abort('failed');
        return;
      }
      const resolved = response && response.kind === 'deferred' ? await response.promise : response;
      await route.fulfill({
        status: resolved && resolved.status != null ? resolved.status : 200,
        contentType: 'application/json',
        body: resolved && resolved.body != null ? resolved.body : JSON.stringify(config),
      });
      return;
    }
    if (url.origin === origin && url.pathname === '/data/leak-case-index.json' && controller.caseIndexResponse) {
      const response = controller.caseIndexResponse;
      if (response.kind === 'abort') {
        await route.abort('failed');
        return;
      }
      const resolved = response.kind === 'deferred' ? await response.promise : response;
      await route.fulfill({
        status: resolved.status == null ? 200 : resolved.status,
        contentType: 'application/json',
        body: resolved.body == null ? '' : resolved.body,
      });
      return;
    }
    if (url.origin === origin && url.pathname === '/__lead') {
      controller.requests.push({ url: request.url(), method: request.method(), body: request.postData() || '' });
      const response = controller.responses.shift() || json({ ok: false });
      if (response.kind === 'abort') {
        await route.abort('failed');
        return;
      }
      const resolved = response.kind === 'deferred' ? await response.promise : response;
      await route.fulfill({
        status: resolved.status == null ? 200 : resolved.status,
        contentType: 'application/json',
        body: resolved.body == null ? '' : resolved.body,
      });
      return;
    }
    if (url.origin === origin) {
      await route.continue();
      return;
    }
    await route.abort('blockedbyclient');
  });

  const page = await context.newPage();
  page.setDefaultTimeout(4000);
  const caseQuery = kind === 'leak' && options.case != null
    ? `?case=${encodeURIComponent(options.case)}#leakInquiry`
    : '';
  await page.goto(`${origin}/${kind === 'general' ? 'index.html' : 'leak.html'}${caseQuery}`, { waitUntil: options.waitUntil || 'networkidle' });
  if (kind === 'general') {
    await page.waitForFunction(() => window.MANMUL && document.querySelectorAll('#worksGroup input').length > 0);
  } else {
    await page.waitForFunction(() => window.ManmulLead && document.querySelector('#lkSubmit'));
  }
  return { context, page, controller, kind };
}

async function closeForm(handle) {
  if (handle.controller.configResponse && handle.controller.configResponse.kind === 'deferred') {
    handle.controller.configResponse.resolve(json({}));
  }
  if (handle.controller.caseIndexResponse && handle.controller.caseIndexResponse.kind === 'deferred') {
    handle.controller.caseIndexResponse.resolve(json({ version: 1, cases: [] }));
  }
  for (const response of handle.controller.responses) {
    if (response && response.kind === 'deferred') response.resolve(json({ ok: false }));
  }
  await handle.context.close();
}

async function installAdminInstrumentation(context, { throwOnce = false } = {}) {
  await context.addInitScript(({
    legacyKey,
    throwOnceEnabled,
    throwMarker,
    privacyBootstrapSource,
  }) => {
    const serialise = (value) => {
      try { return typeof value === 'string' ? value : JSON.stringify(value); }
      catch (_) { return String(value); }
    };
    const state = window.__adminPrivacy = {
      legacyGets: 0,
      legacySets: 0,
      removeAttempts: 0,
      storage: [],
      idb: [],
      cache: [],
      console: [],
      urls: [],
    };
    const installPrivacyWrites = (0, eval)(privacyBootstrapSource);
    installPrivacyWrites(state, '__adminAwaitPrivacyInspections', legacyKey);

    const originalGet = Storage.prototype.getItem;
    const originalRemove = Storage.prototype.removeItem;
    window.__adminHasLegacy = () => originalGet.call(localStorage, legacyKey) !== null;

    Storage.prototype.getItem = function (key) {
      const stringKey = String(key);
      if (stringKey === legacyKey) state.legacyGets += 1;
      return originalGet.call(this, stringKey);
    };
    Storage.prototype.removeItem = function (key) {
      const stringKey = String(key);
      if (stringKey === legacyKey) {
        state.removeAttempts += 1;
        if (throwOnceEnabled && window.name !== throwMarker) {
          window.name = throwMarker;
          throw new Error('task4-test-remove-once');
        }
      }
      return originalRemove.call(this, stringKey);
    };

    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      const value = input && typeof input === 'object' && 'url' in input ? input.url : input;
      state.urls.push(['fetch', String(value)]);
      return originalFetch.call(this, input, init);
    };
    const OriginalRequest = window.Request;
    window.Request = class InstrumentedAdminRequest extends OriginalRequest {
      constructor(input, init) {
        const value = input && typeof input === 'object' && 'url' in input ? input.url : input;
        state.urls.push(['Request', String(value)]);
        super(input, init);
      }
    };
    window.open = function (url) {
      state.urls.push(['window.open', String(url)]);
      return null;
    };
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function (value, title, url) {
        if (url != null) state.urls.push([`history.${method}`, String(url)]);
        return original.call(this, value, title, url);
      };
    }
  }, {
    legacyKey: LEGACY_KEY,
    throwOnceEnabled: throwOnce,
    throwMarker: ADMIN_THROW_MARKER,
    privacyBootstrapSource: PRIVACY_BOOTSTRAP_SOURCE,
  });
}

async function openAdmin(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1280, height: 1000 },
    serviceWorkers: 'block',
  });
  const controller = { requests: [], urls: [] };
  const config = options.config || adminConfig({ n8n: true });
  const site = adminSiteFixture();

  await context.route('**/*', async (route) => {
    const request = route.request();
    controller.urls.push(request.url());
    const url = new URL(request.url());
    if (url.origin === origin && url.pathname === '/data/config.json') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
      return;
    }
    if (url.origin === origin && url.pathname === '/data/site.json') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(site) });
      return;
    }
    if (url.origin === origin && url.pathname === '/__lead') {
      controller.requests.push({ method: request.method() });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }
    if (url.origin === origin) {
      await route.continue();
      return;
    }
    await route.abort('blockedbyclient');
  });

  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(`${origin}/privacy.html`, { waitUntil: 'networkidle' });
  await page.evaluate(({ key, seed }) => {
    window.name = '';
    if (seed) {
      localStorage.setItem(key, JSON.stringify([{
        name: 'TEST_NAME_XSS',
        phone: '010-1234-5678',
        memo: 'TEST_MEMO_MARK',
        status: '신규',
        works: [],
      }]));
    } else {
      localStorage.removeItem(key);
    }
  }, { key: LEGACY_KEY, seed: options.seedLegacy !== false });

  await installAdminInstrumentation(context, { throwOnce: options.throwOnce === true });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error && error.message || error)));
  await page.goto(`${origin}/admin.html`, { waitUntil: 'networkidle' });
  return { context, page, controller, pageErrors };
}

async function closeAdmin(handle) {
  await handle.context.close();
}

async function adminPrivacySnapshot(handle) {
  return handle.page.evaluate(async ({ legacyKey, markers }) => {
    await window.__adminAwaitPrivacyInspections();
    const bodyText = document.body ? document.body.innerText : '';
    return {
      hasLegacy: window.__adminHasLegacy(),
      bodyHasPii: markers.some((marker) => bodyText.includes(marker)),
      xss: window.__xss,
      state: {
        legacyGets: window.__adminPrivacy.legacyGets,
        legacySets: window.__adminPrivacy.legacySets,
        removeAttempts: window.__adminPrivacy.removeAttempts,
        storage: window.__adminPrivacy.storage.slice(),
        idb: window.__adminPrivacy.idb.slice(),
        cache: window.__adminPrivacy.cache.slice(),
        console: window.__adminPrivacy.console.slice(),
        urls: window.__adminPrivacy.urls.slice(),
      },
    };
  }, { legacyKey: LEGACY_KEY, markers: PII_MARKERS });
}

function assertAdminNoPii(snapshot, controller, pageUrl) {
  assert.equal(snapshot.bodyHasPii, false, 'admin rendered legacy inquiry PII');
  assert.equal(snapshot.xss, 0, 'legacy inquiry markup executed in admin');
  assert.equal(snapshot.state.legacyGets, 0, 'admin read the legacy inquiry key');
  assert.equal(snapshot.state.legacySets, 0, 'admin rewrote the legacy inquiry key');
  for (const sink of ['storage', 'idb', 'cache', 'console', 'urls']) {
    assert.equal(containsPii(snapshot.state[sink]), false, `admin ${sink} sink exposed legacy PII`);
    assert.deepEqual(
      privacyAuditReasons(snapshot.state[sink]),
      [],
      `admin ${sink} sink contained a privacy audit failure`
    );
  }
  assert.equal(containsPii(controller.urls), false, 'admin request URL exposed legacy PII');
  assert.equal(containsPii(pageUrl), false, 'admin page URL exposed legacy PII');
}

async function prepare(handle, { honeypot = false } = {}) {
  const { page, kind } = handle;
  if (kind === 'general') {
    await page.fill('#iRegion', 'TEST_REGION');
    await page.click('#nextStep');
    await page.locator('#worksGroup input').first().check();
    await page.click('#nextStep');
    await page.fill('#iName', NAME);
    await page.fill('#iPhone', PHONE);
    await page.click('#nextStep');
    await page.fill('#iMemo', MEMO);
    await page.check('#iConsent');
    if (honeypot) await page.fill('#iCompanyUrl', 'https://bot.invalid');
  } else {
    await page.fill('#lkName', NAME);
    await page.fill('#lkPhone', PHONE);
    await page.locator('#lkSymptoms input').first().check();
    await page.locator('#lkSymptoms input').first().evaluate((input, value) => { input.value = value; }, SYMPTOM);
    await page.fill('#lkMemo', MEMO);
    await page.check('#lkConsent');
    if (honeypot) await page.fill('#lkCompanyUrl', 'https://bot.invalid');
  }
}

async function submit(handle) {
  const selector = handle.kind === 'general' ? '#submitInquiry' : '#lkSubmit';
  await handle.page.click(selector);
}

async function waitForRequestCount(handle, count) {
  const started = Date.now();
  while (handle.controller.requests.length < count && Date.now() - started < 5000) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(handle.controller.requests.length, count, `expected ${count} provider requests`);
}

async function waitForConfigRequest(handle, count = 1) {
  const started = Date.now();
  while (handle.controller.configRequests.length < count && Date.now() - started < 5000) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(handle.controller.configRequests.length, count, `expected ${count} config requests`);
}

async function resultText(handle, timeout = 4000) {
  const selector = handle.kind === 'general' ? '.inquiry-done' : '#lkDone';
  await handle.page.locator(selector).waitFor({ state: 'visible', timeout });
  return handle.page.locator(selector).innerText();
}

async function assertNotDelivered(handle, timeout) {
  const text = await resultText(handle, timeout);
  assert.match(text, /아직.*전송|전송.*되지/);
  assert.doesNotMatch(text, /상담 신청이 전달되었습니다|접수됐습니다\./);
  return text;
}

function containsPii(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return PII_MARKERS.some((marker) => text.includes(marker));
}

function containsReference(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return REFERENCE_MARKERS.some((marker) => text.includes(marker));
}

function privacyAuditReasons(value) {
  const reasons = [];
  const visit = (item, seen = new WeakSet()) => {
    if (!item || typeof item !== 'object' || seen.has(item)) return;
    seen.add(item);
    if (item.kind === 'PrivacyAuditFailure') reasons.push(String(item.reason || 'unspecified'));
    if (Array.isArray(item)) {
      for (const child of item) visit(child, seen);
      return;
    }
    for (const child of Object.values(item)) visit(child, seen);
  };
  visit(value);
  return reasons;
}

async function assertPrivacyInspectionCoverage(page, sinkName, awaitName, label) {
  const result = await page.evaluate(async ({ sinkName: stateName, awaitName: drainName, label: probeLabel }) => {
    const cacheName = `CACHE_STORAGE_NAME_PROBE_${probeLabel}`;
    const databaseName = `IDB_DATABASE_NAME_PROBE_${probeLabel}`;
    const metadataStoreName = `IDB_STORE_NAME_PROBE_${probeLabel}`;
    const writeStoreName = `IDB_WRITE_STORE_PROBE_${probeLabel}`;
    const indexName = `IDB_INDEX_NAME_PROBE_${probeLabel}`;
    const state = window[stateName];
    const drain = async () => {
      if (typeof window[drainName] === 'function') await window[drainName]();
    };
    const requestResult = (request) => new Promise((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error || new Error('idb-request-failed')), { once: true });
    });
    const transactionDone = (transaction) => new Promise((resolve, reject) => {
      transaction.addEventListener('complete', resolve, { once: true });
      transaction.addEventListener('abort', () => reject(transaction.error || new Error('idb-transaction-aborted')), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error || new Error('idb-transaction-failed')), { once: true });
    });
    const deleteDatabase = (name) => new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.addEventListener('success', () => resolve(true), { once: true });
      request.addEventListener('error', () => reject(request.error || new Error('idb-delete-failed')), { once: true });
      request.addEventListener('blocked', () => reject(new Error('idb-delete-blocked')), { once: true });
    });
    let cache;
    let database;
    let snapshot = { storage: [], cache: [], idb: [], console: [] };
    let storageKeyCoercions = 0;
    let storageValueCoercions = 0;
    let storedCoercedValue = null;
    let storageZeroArgErrorName = '';
    let storageOneArgErrorName = '';
    let storageZeroArgStoredValue = null;
    let storageOneArgStoredValue = null;
    let storageExtraArgCoercions = 0;
    let storageExtraArgStoredValue = null;
    const boundaryCoercions = {
      cacheStorageName: 0,
      cacheRequest: 0,
      idbDatabaseName: 0,
      idbStoreName: 0,
      idbStoreKeyPath: 0,
      idbIndexName: 0,
      idbIndexKeyPath: 0,
      idbInvalidKey: 0,
    };
    const boundaryNativeReceipts = {
      cacheStorageName: false,
      cacheRequest: false,
      idbDatabaseName: false,
      idbStoreSchema: false,
      idbIndexSchema: false,
      idbInvalidKeyThrew: false,
    };
    const assertThisIs = (expected, actual) => {
      if (actual !== expected) throw new Error('native boundary received a different object');
    };
    let accessorGetterCalls = 0;
    let fileListSupported = false;
    let cacheDeleted = false;
    let cacheHasAfterDelete = true;
    let databaseDeleted = false;
    let databaseHasAfterDelete = true;
    try {
      const storageKey = {
        toString() {
          storageKeyCoercions += 1;
          return `STORAGE_COERCION_KEY_PROBE_${probeLabel}`;
        },
      };
      const storageValue = {
        toString() {
          storageValueCoercions += 1;
          return 'TEST_NAME_XSS';
        },
      };
      localStorage.setItem(storageKey, storageValue);
      storedCoercedValue = localStorage.getItem(`STORAGE_COERCION_KEY_PROBE_${probeLabel}`);
      localStorage.removeItem(`STORAGE_COERCION_KEY_PROBE_${probeLabel}`);

      localStorage.removeItem('undefined');
      try { localStorage.setItem(); }
      catch (error) { storageZeroArgErrorName = error && error.name || ''; }
      storageZeroArgStoredValue = localStorage.getItem('undefined');
      localStorage.removeItem('undefined');
      const oneArgKey = `STORAGE_ONE_ARG_KEY_PROBE_${probeLabel}`;
      localStorage.removeItem(oneArgKey);
      try { localStorage.setItem(oneArgKey); }
      catch (error) { storageOneArgErrorName = error && error.name || ''; }
      storageOneArgStoredValue = localStorage.getItem(oneArgKey);
      localStorage.removeItem(oneArgKey);
      const extraArg = {
        toString() {
          storageExtraArgCoercions += 1;
          return 'TEST_NAME_XSS';
        },
      };
      const extraArgKey = `STORAGE_EXTRA_ARG_KEY_PROBE_${probeLabel}`;
      localStorage.setItem(extraArgKey, 'STORAGE_EXTRA_ARG_VALUE_PROBE', extraArg);
      storageExtraArgStoredValue = localStorage.getItem(extraArgKey);
      localStorage.removeItem(extraArgKey);

      const cacheBoundaryName = `CACHE_DOMSTRING_NATIVE_NAME_PROBE_${probeLabel}`;
      class CacheStorageNameBoundaryProbe {}
      const cacheStorageNameObject = new CacheStorageNameBoundaryProbe();
      CacheStorageNameBoundaryProbe.prototype.toString = function () {
        boundaryCoercions.cacheStorageName += 1;
        assertThisIs(cacheStorageNameObject, this);
        return cacheBoundaryName;
      };
      await caches.open(cacheStorageNameObject);
      boundaryNativeReceipts.cacheStorageName = await caches.has(cacheBoundaryName);
      await caches.delete(cacheBoundaryName);

      const idbBoundaryName = `IDB_DOMSTRING_NATIVE_NAME_PROBE_${probeLabel}`;
      class IdbDatabaseNameBoundaryProbe {}
      const idbDatabaseNameObject = new IdbDatabaseNameBoundaryProbe();
      IdbDatabaseNameBoundaryProbe.prototype.toString = function () {
        boundaryCoercions.idbDatabaseName += 1;
        assertThisIs(idbDatabaseNameObject, this);
        return idbBoundaryName;
      };
      const boundaryOpenRequest = indexedDB.open(idbDatabaseNameObject, 1);
      const boundaryDatabase = await requestResult(boundaryOpenRequest);
      boundaryNativeReceipts.idbDatabaseName = boundaryDatabase.name === idbBoundaryName;
      boundaryDatabase.close();
      await deleteDatabase(idbBoundaryName);

      cache = await caches.open(cacheName);
      const cacheRequestUrl = `${location.origin}/privacy.html?probe=CACHE_REQUEST_DOMSTRING_NATIVE_PROBE`;
      class CacheRequestBoundaryProbe {}
      const cacheRequestObject = new CacheRequestBoundaryProbe();
      CacheRequestBoundaryProbe.prototype.toString = function () {
        boundaryCoercions.cacheRequest += 1;
        assertThisIs(cacheRequestObject, this);
        return cacheRequestUrl;
      };
      await cache.put(cacheRequestObject, new Response('SAFE_CACHE_REQUEST_BOUNDARY_BODY'));
      boundaryNativeReceipts.cacheRequest = !!(await cache.match(cacheRequestUrl));
      const fetchedResponse = await fetch(
        `${location.origin}/privacy.html?cacheProbe=CACHE_RESPONSE_URL_PROBE`,
        { cache: 'no-store' }
      );
      await cache.put(
        new Request(`${location.origin}/privacy.html?cacheProbe=CACHE_PUT_REQUEST_URL_PROBE`, {
          headers: { 'x-cache-request-probe': 'CACHE_REQUEST_HEADER_PROBE' },
        }),
        new Response('TEST_NAME_XSS', {
          headers: {
            'content-type': 'text/plain',
            'x-cache-response-probe': 'CACHE_RESPONSE_HEADER_PROBE',
          },
        })
      );
      await cache.put(
        new Request(`${location.origin}/privacy.html?cacheProbe=CACHE_RESPONSE_CACHE_KEY_PROBE`),
        fetchedResponse
      );
      const mutableCacheRequest = new Request(
        `${location.origin}/privacy.html?cacheProbe=CACHE_MUTABLE_REQUEST_PROBE`,
        { headers: { 'x-cache-mutable-probe': 'CACHE_CALL_TIME_HEADER_PROBE' } }
      );
      const mutableCacheWrite = cache.put(mutableCacheRequest, new Response('SAFE_MUTABLE_RESPONSE'));
      mutableCacheRequest.headers.set('x-cache-mutable-probe', 'SAFE_AFTER_CACHE_CALL');
      await mutableCacheWrite;
      await cache.add(
        new Request(`${location.origin}/privacy.html?cacheProbe=CACHE_ADD_REQUEST_URL_PROBE`)
      );
      await cache.addAll([
        new Request(`${location.origin}/privacy.html?cacheProbe=CACHE_ADD_ALL_REQUEST_URL_PROBE`),
      ]);

      const openRequest = indexedDB.open(databaseName, 1);
      openRequest.addEventListener('upgradeneeded', () => {
        const upgradeDatabase = openRequest.result;
        const metadataStore = upgradeDatabase.createObjectStore(metadataStoreName, {
          keyPath: 'IDB_STORE_KEYPATH_PROBE',
          autoIncrement: true,
        });
        metadataStore.createIndex(indexName, 'IDB_INDEX_KEYPATH_PROBE', {
          unique: false,
          multiEntry: true,
        });
        const customStoreName = `IDB_CUSTOM_STORE_NATIVE_NAME_PROBE_${probeLabel}`;
        const customStoreKeyPath = 'IDB_CUSTOM_STORE_NATIVE_KEYPATH_PROBE';
        class IdbStoreNameBoundaryProbe {}
        class IdbStoreKeyPathBoundaryProbe {}
        const customStoreNameObject = new IdbStoreNameBoundaryProbe();
        const customStoreKeyPathObject = new IdbStoreKeyPathBoundaryProbe();
        IdbStoreNameBoundaryProbe.prototype.toString = function () {
          boundaryCoercions.idbStoreName += 1;
          assertThisIs(customStoreNameObject, this);
          return customStoreName;
        };
        IdbStoreKeyPathBoundaryProbe.prototype.toString = function () {
          boundaryCoercions.idbStoreKeyPath += 1;
          assertThisIs(customStoreKeyPathObject, this);
          return customStoreKeyPath;
        };
        const customStore = upgradeDatabase.createObjectStore(customStoreNameObject, {
          keyPath: customStoreKeyPathObject,
        });
        boundaryNativeReceipts.idbStoreSchema = (
          customStore.name === customStoreName && customStore.keyPath === customStoreKeyPath
        );
        const customIndexName = `IDB_CUSTOM_INDEX_NATIVE_NAME_PROBE_${probeLabel}`;
        const customIndexKeyPath = 'IDB_CUSTOM_INDEX_NATIVE_KEYPATH_PROBE';
        class IdbIndexNameBoundaryProbe {}
        class IdbIndexKeyPathBoundaryProbe {}
        const customIndexNameObject = new IdbIndexNameBoundaryProbe();
        const customIndexKeyPathObject = new IdbIndexKeyPathBoundaryProbe();
        IdbIndexNameBoundaryProbe.prototype.toString = function () {
          boundaryCoercions.idbIndexName += 1;
          assertThisIs(customIndexNameObject, this);
          return customIndexName;
        };
        IdbIndexKeyPathBoundaryProbe.prototype.toString = function () {
          boundaryCoercions.idbIndexKeyPath += 1;
          assertThisIs(customIndexKeyPathObject, this);
          return customIndexKeyPath;
        };
        const customIndex = customStore.createIndex(customIndexNameObject, customIndexKeyPathObject);
        boundaryNativeReceipts.idbIndexSchema = (
          customIndex.name === customIndexName && customIndex.keyPath === customIndexKeyPath
        );
        upgradeDatabase.createObjectStore(writeStoreName);
      }, { once: true });
      database = await requestResult(openRequest);

      const writeTransaction = database.transaction(writeStoreName, 'readwrite');
      const writeDone = transactionDone(writeTransaction);
      const writeStore = writeTransaction.objectStore(writeStoreName);
      writeStore.add(new Map([
        ['IDB_MAP_KEY_PROBE', 'IDB_MAP_VALUE_PROBE'],
      ]), 'IDB_ADD_OUT_OF_LINE_KEY_PROBE');
      writeStore.put({
        nested: { marker: 'IDB_PLAIN_OBJECT_PROBE' },
        array: ['IDB_ARRAY_PROBE'],
        set: new Set(['IDB_SET_VALUE_PROBE']),
        blob: new Blob(['IDB_BLOB_TEXT_PROBE'], { type: 'application/x-idb-blob-probe' }),
      }, 'IDB_PUT_OUT_OF_LINE_KEY_PROBE');
      const mutableIdbValue = {
        delay: new Blob(['SAFE_IDB_DELAY']),
        marker: 'IDB_CALL_TIME_MARKER_PROBE',
      };
      writeStore.put(mutableIdbValue, 'IDB_MUTABLE_VALUE_KEY_PROBE');
      mutableIdbValue.marker = 'SAFE_AFTER_IDB_CALL';
      writeStore.put(/IDB_REGEXP_SOURCE_PROBE/gi, 'IDB_REGEXP_KEY_PROBE');
      writeStore.put(new Date('2026-08-28T12:34:56.000Z'), 'IDB_DATE_KEY_PROBE');
      const domException = new DOMException('IDB_DOMEXCEPTION_MESSAGE_PROBE', 'IDB_DOMEXCEPTION_NAME_PROBE');
      Object.defineProperty(domException, 'metadata', {
        configurable: true,
        enumerable: true,
        value: 'IDB_DOMEXCEPTION_METADATA_PROBE',
      });
      writeStore.put(domException, 'IDB_DOMEXCEPTION_KEY_PROBE');
      class ProbeRecord {
        constructor(marker) { this.marker = marker; }
        toJSON() { throw new Error('custom toJSON must not run'); }
      }
      writeStore.put(new ProbeRecord('IDB_CUSTOM_CLASS_OWN_FIELD_PROBE'), 'IDB_CUSTOM_CLASS_KEY_PROBE');
      class IdbInvalidKeyBoundaryProbe {}
      const invalidKeyObject = new IdbInvalidKeyBoundaryProbe();
      IdbInvalidKeyBoundaryProbe.prototype.toString = function () {
        boundaryCoercions.idbInvalidKey += 1;
        assertThisIs(invalidKeyObject, this);
        return 'IDB_INVALID_KEY_MUST_NOT_COERCE';
      };
      try { writeStore.put({ marker: 'SAFE_INVALID_KEY_VALUE' }, invalidKeyObject); }
      catch (error) { boundaryNativeReceipts.idbInvalidKeyThrew = error && error.name === 'DataError'; }
      if (typeof DataTransfer === 'function' && typeof FileList === 'function') {
        const transfer = new DataTransfer();
        transfer.items.add(new File(['SAFE_FILE_LIST_BODY'], 'IDB_FILE_LIST_NAME_PROBE.txt'));
        try {
          writeStore.put(transfer.files, 'IDB_FILE_LIST_KEY_PROBE');
          fileListSupported = true;
        } catch (_) {}
      }
      await writeDone;

      const cursorTransaction = database.transaction(writeStoreName, 'readwrite');
      const cursorDone = transactionDone(cursorTransaction);
      const cursorRequest = cursorTransaction.objectStore(writeStoreName)
        .openCursor('IDB_PUT_OUT_OF_LINE_KEY_PROBE');
      await new Promise((resolve, reject) => {
        cursorRequest.addEventListener('error', () => reject(cursorRequest.error || new Error('idb-cursor-failed')), { once: true });
        cursorRequest.addEventListener('success', () => {
          const cursor = cursorRequest.result;
          if (!cursor) {
            reject(new Error('idb-cursor-missing'));
            return;
          }
          const updateRequest = cursor.update({ marker: 'IDB_CURSOR_UPDATE_VALUE_PROBE' });
          updateRequest.addEventListener('success', resolve, { once: true });
          updateRequest.addEventListener('error', () => reject(updateRequest.error || new Error('idb-cursor-update-failed')), { once: true });
        }, { once: true });
      });
      await cursorDone;

      const error = new Error('010-1234-5678', { cause: 'CONSOLE_ERROR_CAUSE_PROBE' });
      error.name = 'CONSOLE_ERROR_NAME_PROBE';
      error.stack = 'CONSOLE_ERROR_STACK_PROBE';
      error.metadata = 'CONSOLE_ERROR_METADATA_PROBE';
      const cycle = { marker: 'CONSOLE_CYCLE_PROBE' };
      cycle.self = cycle;
      console.error(error);
      console.error(new AggregateError(
        [new Error('CONSOLE_AGGREGATE_NESTED_ERROR_PROBE')],
        'CONSOLE_AGGREGATE_MESSAGE_PROBE'
      ));
      console.warn(
        new Map([['CONSOLE_MAP_KEY_PROBE', 'CONSOLE_MAP_VALUE_PROBE']]),
        new Set(['CONSOLE_SET_VALUE_PROBE'])
      );
      console.info(
        new Blob(['CONSOLE_BLOB_TEXT_PROBE'], { type: 'application/x-console-blob-probe' }),
        new File(['CONSOLE_FILE_TEXT_PROBE'], 'CONSOLE_FILE_NAME_PROBE', {
          type: 'application/x-console-file-probe',
        }),
        new TextEncoder().encode('CONSOLE_ARRAYBUFFER_PROBE').buffer,
        new TextEncoder().encode('CONSOLE_VIEW_PROBE'),
        new URL(`${location.origin}/privacy.html?rich=CONSOLE_URL_PROBE`),
        new URLSearchParams('rich=CONSOLE_URL_PARAMS_PROBE'),
        ['CONSOLE_ARRAY_PROBE', { nested: 'CONSOLE_PLAIN_OBJECT_PROBE' }],
        cycle
      );
      const headers = new Headers({ 'x-console-rich-probe': 'CONSOLE_HEADERS_VALUE_PROBE' });
      const formData = new FormData();
      formData.append('CONSOLE_FORMDATA_KEY_PROBE', 'CONSOLE_FORMDATA_VALUE_PROBE');
      console.warn(headers, formData);
      const arrayOwnPropertyProbe = [];
      arrayOwnPropertyProbe.length = 3;
      arrayOwnPropertyProbe[1] = 'ARRAY_ORDERED_INDEX_PROBE';
      arrayOwnPropertyProbe.secret = 'ARRAY_OWN_PROPERTY_PROBE';
      console.log(arrayOwnPropertyProbe);
      const arrayAccessorProbe = ['ARRAY_ACCESSOR_INDEX_PROBE'];
      Object.defineProperty(arrayAccessorProbe, 'secret', {
        enumerable: true,
        get() {
          accessorGetterCalls += 1;
          return 'ARRAY_ACCESSOR_MUST_NOT_RUN_PROBE';
        },
      });
      console.warn(arrayAccessorProbe);
      const oversizedHeadersProbe = new Headers();
      for (let index = 0; index < 520; index += 1) {
        oversizedHeadersProbe.append(`x-oversized-standalone-${index}`, `SAFE_${index}`);
      }
      console.error(oversizedHeadersProbe);
      const oversizedRequestHeadersProbe = new Headers();
      for (let index = 0; index < 520; index += 1) {
        oversizedRequestHeadersProbe.append(`x-oversized-request-${index}`, `SAFE_${index}`);
      }
      console.info(new Request(
        `${location.origin}/privacy.html?probe=OVERSIZED_REQUEST_HEADERS_PROBE`,
        { headers: oversizedRequestHeadersProbe }
      ));
      const accessorValue = {};
      Object.defineProperty(accessorValue, 'secret', {
        enumerable: true,
        get() {
          accessorGetterCalls += 1;
          return 'ACCESSOR_GETTER_MUST_NOT_RUN_PROBE';
        },
      });
      console.log(accessorValue);
      const tooDeep = {};
      let deepCursor = tooDeep;
      for (let index = 0; index < 14; index += 1) {
        deepCursor.child = {};
        deepCursor = deepCursor.child;
      }
      console.log(tooDeep);
      const tooWide = {};
      for (let index = 0; index < 520; index += 1) tooWide[`entry${index}`] = index;
      console.log(tooWide);

      await drain();
      snapshot = {
        storage: state.storage.slice(),
        cache: state.cache.slice(),
        idb: state.idb.slice(),
        console: state.console.slice(),
      };
    } finally {
      await drain();
      if (database) database.close();
      cacheDeleted = await caches.delete(cacheName);
      cacheHasAfterDelete = await caches.has(cacheName);
      databaseDeleted = await deleteDatabase(databaseName);
      if (typeof indexedDB.databases === 'function') {
        databaseHasAfterDelete = (await indexedDB.databases())
          .some((entry) => entry && entry.name === databaseName);
      }
      await drain();
      state.storage.length = 0;
      state.cache.length = 0;
      state.idb.length = 0;
      state.console.length = 0;
    }
    return {
      snapshot,
      cacheDeleted,
      cacheHasAfterDelete,
      databaseDeleted,
      databaseHasAfterDelete,
      storageKeyCoercions,
      storageValueCoercions,
      storedCoercedValue,
      storageZeroArgErrorName,
      storageOneArgErrorName,
      storageZeroArgStoredValue,
      storageOneArgStoredValue,
      storageExtraArgCoercions,
      storageExtraArgStoredValue,
      boundaryCoercions,
      boundaryNativeReceipts,
      accessorGetterCalls,
      fileListSupported,
    };
  }, { sinkName, awaitName, label });
  const {
    snapshot,
    cacheDeleted,
    cacheHasAfterDelete,
    databaseDeleted,
    databaseHasAfterDelete,
    storageKeyCoercions,
    storageValueCoercions,
    storedCoercedValue,
    storageZeroArgErrorName,
    storageOneArgErrorName,
    storageZeroArgStoredValue,
    storageOneArgStoredValue,
    storageExtraArgCoercions,
    storageExtraArgStoredValue,
    boundaryCoercions,
    boundaryNativeReceipts,
    accessorGetterCalls,
    fileListSupported,
  } = result;
  const storageText = JSON.stringify(snapshot.storage);
  const cacheText = JSON.stringify(snapshot.cache);
  const idbText = JSON.stringify(snapshot.idb);
  const consoleText = JSON.stringify(snapshot.console);
  assert.equal(storageKeyCoercions, 1, `${label} Storage key was not coerced exactly once`);
  assert.equal(storageValueCoercions, 1, `${label} Storage value was not coerced exactly once`);
  assert.equal(storedCoercedValue, 'TEST_NAME_XSS', `${label} Storage original did not receive the inspected string`);
  assert.equal(storageZeroArgErrorName, 'TypeError', `${label} Storage zero-argument TypeError was not preserved`);
  assert.equal(storageOneArgErrorName, 'TypeError', `${label} Storage one-argument TypeError was not preserved`);
  assert.equal(storageZeroArgStoredValue, null, `${label} Storage zero-argument call wrote a value`);
  assert.equal(storageOneArgStoredValue, null, `${label} Storage one-argument call wrote a value`);
  assert.equal(storageExtraArgCoercions, 0, `${label} Storage coerced an ignored extra argument`);
  assert.equal(
    storageExtraArgStoredValue,
    'STORAGE_EXTRA_ARG_VALUE_PROBE',
    `${label} Storage two-plus-argument call changed the first two arguments`
  );
  for (const [boundary, count] of Object.entries(boundaryCoercions)) {
    assert.equal(
      count,
      boundary === 'idbInvalidKey' ? 0 : 1,
      `${label} ${boundary} inspector invoked a coercion hook or native coercion count changed`
    );
  }
  for (const [boundary, received] of Object.entries(boundaryNativeReceipts)) {
    assert.equal(received, true, `${label} ${boundary} native boundary did not receive the original argument`);
  }
  assert.equal(storageText.includes('TEST_NAME_XSS'), true, `${label} Storage coercion result was not inspected`);
  assert.equal(containsPii(snapshot.cache), true, `${label} Cache.put Response body inspection missed PII`);
  for (const marker of [
    'CACHE_STORAGE_NAME_PROBE',
    'CACHE_PUT_REQUEST_URL_PROBE',
    'CACHE_ADD_REQUEST_URL_PROBE',
    'CACHE_ADD_ALL_REQUEST_URL_PROBE',
    'CACHE_MUTABLE_REQUEST_PROBE',
    'CACHE_CALL_TIME_HEADER_PROBE',
  ]) {
    assert.equal(cacheText.includes(marker), true, `${label} Cache inspection missed ${marker}`);
  }
  assert.equal(
    cacheText.includes('CACHE_RESPONSE_URL_PROBE'),
    true,
    `${label} Cache Response URL inspection missed local fetched response URL`
  );
  assert.equal(
    cacheText.includes('CACHE_REQUEST_HEADER_PROBE'),
    true,
    `${label} Cache Request header inspection missed marker`
  );
  assert.equal(
    cacheText.includes('CACHE_RESPONSE_HEADER_PROBE'),
    true,
    `${label} Cache Response header inspection missed marker`
  );
  assert.equal(
    privacyAuditReasons(snapshot.cache).includes('domstring-coercion-ambiguity:CacheStorage.open:cacheName'),
    true,
    `${label} CacheStorage.open coercion ambiguity did not fail closed`
  );
  assert.equal(
    privacyAuditReasons(snapshot.cache).includes('domstring-coercion-ambiguity:Cache.put:request'),
    true,
    `${label} Cache.put request coercion ambiguity did not fail closed`
  );
  for (const marker of [
    'IDB_DATABASE_NAME_PROBE',
    'IDB_STORE_NAME_PROBE',
    'IDB_STORE_KEYPATH_PROBE',
    'IDB_WRITE_STORE_PROBE',
    'IDB_INDEX_NAME_PROBE',
    'IDB_INDEX_KEYPATH_PROBE',
    'IDB_ADD_OUT_OF_LINE_KEY_PROBE',
    'IDB_PUT_OUT_OF_LINE_KEY_PROBE',
    'IDB_MAP_KEY_PROBE',
    'IDB_MAP_VALUE_PROBE',
    'IDB_PLAIN_OBJECT_PROBE',
    'IDB_ARRAY_PROBE',
    'IDB_SET_VALUE_PROBE',
    'IDB_BLOB_TEXT_PROBE',
    'application/x-idb-blob-probe',
    'IDB_CURSOR_UPDATE_VALUE_PROBE',
    'IDB_CALL_TIME_MARKER_PROBE',
    'IDB_REGEXP_SOURCE_PROBE',
    'IDB_DATE_KEY_PROBE',
    'IDB_DOMEXCEPTION_MESSAGE_PROBE',
    'IDB_DOMEXCEPTION_NAME_PROBE',
    'IDB_DOMEXCEPTION_METADATA_PROBE',
    'IDB_CUSTOM_CLASS_OWN_FIELD_PROBE',
  ]) {
    assert.equal(idbText.includes(marker), true, `${label} IndexedDB inspection missed ${marker}`);
  }
  const openEntry = snapshot.idb.find(([method, values]) => (
    method === 'indexedDB.open' && JSON.stringify(values).includes('IDB_DATABASE_NAME_PROBE')
  ));
  assert.equal(openEntry && openEntry[1][1], 1, `${label} indexedDB.open version was not inspected`);
  const createStoreEntry = snapshot.idb.find(([method, values]) => (
    method === 'createObjectStore' && JSON.stringify(values).includes('IDB_STORE_NAME_PROBE')
  ));
  assert.equal(createStoreEntry && createStoreEntry[1][1].kind, 'Object', `${label} object-store options were not richly inspected`);
  const createIndexEntry = snapshot.idb.find(([method, values]) => (
    method === 'createIndex' && JSON.stringify(values).includes('IDB_INDEX_NAME_PROBE')
  ));
  assert.equal(createIndexEntry && createIndexEntry[1][2].kind, 'Object', `${label} index options were not richly inspected`);
  const addEntry = snapshot.idb.find(([method]) => method === 'add');
  assert.equal(addEntry && addEntry[1][0].kind, 'Map', `${label} IDB add Map value was not richly inspected`);
  const putEntry = snapshot.idb.find(([method, values]) => (
    method === 'put' && JSON.stringify(values).includes('IDB_PLAIN_OBJECT_PROBE')
  ));
  assert.equal(putEntry && putEntry[1][0].kind, 'Object', `${label} IDB put object value was not richly inspected`);
  assert.equal(idbText.includes('"kind":"Set"'), true, `${label} IDB Set value was not richly inspected`);
  assert.equal(idbText.includes('"kind":"Blob"'), true, `${label} IDB Blob value was not richly inspected`);
  assert.equal(idbText.includes('"kind":"RegExp"'), true, `${label} IDB RegExp was not richly inspected`);
  assert.equal(idbText.includes('"kind":"Date"'), true, `${label} IDB Date was not richly inspected`);
  assert.equal(idbText.includes('"kind":"DOMException"'), true, `${label} IDB DOMException was not richly inspected`);
  assert.equal(idbText.includes('"kind":"FileList"'), fileListSupported, `${label} IDB FileList support was not inspected`);
  for (const reason of [
    'domstring-coercion-ambiguity:indexedDB.open:name',
    'domstring-coercion-ambiguity:createObjectStore:name',
    'domstring-coercion-ambiguity:createObjectStore:keyPath',
    'domstring-coercion-ambiguity:createIndex:name',
    'domstring-coercion-ambiguity:createIndex:keyPath',
    'idb-key-type-ambiguity:put:key',
  ]) {
    assert.equal(
      privacyAuditReasons(snapshot.idb).includes(reason),
      true,
      `${label} IndexedDB boundary did not fail closed for ${reason}`
    );
  }
  for (const marker of [
    'CONSOLE_ERROR_NAME_PROBE',
    '010-1234-5678',
    'CONSOLE_ERROR_STACK_PROBE',
    'CONSOLE_ERROR_CAUSE_PROBE',
    'CONSOLE_ERROR_METADATA_PROBE',
    'CONSOLE_AGGREGATE_NESTED_ERROR_PROBE',
    'CONSOLE_AGGREGATE_MESSAGE_PROBE',
    'CONSOLE_MAP_KEY_PROBE',
    'CONSOLE_MAP_VALUE_PROBE',
    'CONSOLE_SET_VALUE_PROBE',
    'CONSOLE_BLOB_TEXT_PROBE',
    'application/x-console-blob-probe',
    'CONSOLE_FILE_TEXT_PROBE',
    'CONSOLE_FILE_NAME_PROBE',
    'application/x-console-file-probe',
    'CONSOLE_ARRAYBUFFER_PROBE',
    'CONSOLE_VIEW_PROBE',
    'CONSOLE_URL_PROBE',
    'CONSOLE_URL_PARAMS_PROBE',
    'CONSOLE_ARRAY_PROBE',
    'CONSOLE_PLAIN_OBJECT_PROBE',
    'CONSOLE_CYCLE_PROBE',
    '[circular]',
    'CONSOLE_HEADERS_VALUE_PROBE',
    'CONSOLE_FORMDATA_KEY_PROBE',
    'CONSOLE_FORMDATA_VALUE_PROBE',
  ]) {
    assert.equal(consoleText.includes(marker), true, `${label} console rich inspection missed ${marker}`);
  }
  const errorEntry = snapshot.console.find(([method, values]) => (
    method === 'error' && JSON.stringify(values).includes('CONSOLE_ERROR_NAME_PROBE')
  ));
  assert.equal(errorEntry && errorEntry[1][0].kind, 'Error', `${label} console Error was not richly inspected`);
  const warnEntry = snapshot.console.find(([method, values]) => (
    method === 'warn' && JSON.stringify(values).includes('CONSOLE_MAP_KEY_PROBE')
  ));
  assert.equal(warnEntry && warnEntry[1][0].kind, 'Map', `${label} console Map was not richly inspected`);
  assert.equal(warnEntry && warnEntry[1][1].kind, 'Set', `${label} console Set was not richly inspected`);
  const infoEntry = snapshot.console.find(([method, values]) => (
    method === 'info' && JSON.stringify(values).includes('CONSOLE_BLOB_TEXT_PROBE')
  ));
  for (const [index, kind] of [
    [0, 'Blob'],
    [1, 'File'],
    [2, 'ArrayBuffer'],
    [3, 'Uint8Array'],
    [4, 'URL'],
    [5, 'URLSearchParams'],
  ]) {
    assert.equal(infoEntry && infoEntry[1][index].kind, kind, `${label} console ${kind} was not richly inspected`);
  }
  assert.equal(infoEntry && infoEntry[1][6].kind, 'Array', `${label} console Array was not richly inspected`);
  assert.equal(infoEntry && infoEntry[1][6].items[1].kind, 'Object', `${label} console nested object was not richly inspected`);
  assert.equal(infoEntry && infoEntry[1][7].kind, 'Object', `${label} console cyclic object was not richly inspected`);
  assert.equal(consoleText.includes('"kind":"AggregateError"'), true, `${label} console AggregateError was not richly inspected`);
  assert.equal(consoleText.includes('"kind":"Headers"'), true, `${label} console Headers were not richly inspected`);
  assert.equal(consoleText.includes('"kind":"FormData"'), true, `${label} console FormData was not richly inspected`);
  const arrayOwnPropertyEntry = snapshot.console.find(([, values]) => (
    JSON.stringify(values).includes('ARRAY_OWN_PROPERTY_PROBE')
  ));
  assert.deepEqual(
    arrayOwnPropertyEntry && arrayOwnPropertyEntry[1][0].items,
    ['[empty]', 'ARRAY_ORDERED_INDEX_PROBE', '[empty]'],
    `${label} array indexed order or holes were not preserved`
  );
  assert.deepEqual(
    arrayOwnPropertyEntry && arrayOwnPropertyEntry[1][0].properties,
    [['secret', 'ARRAY_OWN_PROPERTY_PROBE']],
    `${label} array non-index data property was not retained`
  );
  const arrayAccessorEntry = snapshot.console.find(([method, values]) => (
    method === 'warn' && privacyAuditReasons(values).includes('array-accessor-property:secret')
  ));
  assert.ok(arrayAccessorEntry, `${label} array non-index accessor did not fail closed`);
  const oversizedHeadersEntry = snapshot.console.find(([method, values]) => (
    method === 'error' && privacyAuditReasons(values).includes('entry-limit')
  ));
  assert.ok(oversizedHeadersEntry, `${label} oversized standalone Headers did not fail closed`);
  const oversizedRequestEntry = snapshot.console.find(([method, values]) => (
    method === 'info'
      && JSON.stringify(values).includes('OVERSIZED_REQUEST_HEADERS_PROBE')
      && privacyAuditReasons(values).includes('entry-limit')
  ));
  assert.ok(oversizedRequestEntry, `${label} oversized Request headers did not fail closed`);
  assert.equal(accessorGetterCalls, 0, `${label} privacy inspection invoked an accessor getter`);
  const auditReasons = privacyAuditReasons(snapshot);
  for (const reason of ['accessor-property', 'depth-limit', 'entry-limit']) {
    assert.equal(auditReasons.includes(reason), true, `${label} did not fail closed for ${reason}`);
  }
  assert.equal(cacheDeleted, true, `${label} Cache probe cleanup did not delete the probe cache`);
  assert.equal(cacheHasAfterDelete, false, `${label} Cache probe cleanup left the probe cache behind`);
  assert.equal(databaseDeleted, true, `${label} IndexedDB probe cleanup did not delete the probe database`);
  assert.equal(databaseHasAfterDelete, false, `${label} IndexedDB probe cleanup left the probe database behind`);
}

async function assertNoPersistentPii(handle) {
  const state = await handle.page.evaluate(async (legacyKey) => {
    await window.__leadAwaitPrivacyInspections();
    return {
      local: Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
      session: Object.fromEntries(Object.keys(sessionStorage).map((key) => [key, sessionStorage.getItem(key)])),
      legacy: localStorage.getItem(legacyKey),
      sinks: window.__leadSinks,
      xss: window.__xss,
    };
  }, LEGACY_KEY);
  assert.equal(state.legacy, null);
  assert.equal(containsPii(state.local), false, 'localStorage retained inquiry PII');
  assert.equal(containsPii(state.session), false, 'sessionStorage retained inquiry PII');
  for (const sink of ['storage', 'idb', 'cache', 'console', 'urls']) {
    assert.equal(containsPii(state.sinks[sink]), false, `${sink} sink retained inquiry PII`);
    assert.deepEqual(
      privacyAuditReasons(state.sinks[sink]),
      [],
      `${sink} sink contained a privacy audit failure`
    );
  }
  assert.equal(containsPii(handle.controller.urls), false, 'network request URL contained inquiry PII');
  assert.equal(containsPii(handle.page.url()), false, 'page URL contained inquiry PII');
  assert.equal(state.xss, 0, 'untrusted inquiry text executed as HTML');
}

async function assertNoPersistentReference(handle) {
  const state = await handle.page.evaluate(async () => {
    await window.__leadAwaitPrivacyInspections();
    return {
      local: Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
      session: Object.fromEntries(Object.keys(sessionStorage).map((key) => [key, sessionStorage.getItem(key)])),
      sinks: window.__leadSinks,
    };
  });
  assert.equal(containsReference(state.local), false, 'localStorage retained the case reference');
  assert.equal(containsReference(state.session), false, 'sessionStorage retained the case reference');
  for (const sink of ['storage', 'idb', 'cache', 'console']) {
    assert.equal(containsReference(state.sinks[sink]), false, `${sink} retained the case reference`);
  }
}

test('전송 실패 시 두 폼 모두 PII를 저장하지 않고 현재 탭 재시도와 직접 연락 행동을 제공한다', async () => {
  const probe = await openForm('general');
  try {
    await assertPrivacyInspectionCoverage(
      probe.page,
      '__leadSinks',
      '__leadAwaitPrivacyInspections',
      'public'
    );
  } finally {
    await closeForm(probe);
  }

  for (const kind of ['general', 'leak']) {
    const handle = await openForm(kind, {
      viewport: { width: 390, height: 844 },
      responses: [json({ ok: false })],
    });
    try {
      await prepare(handle);
      await submit(handle);
      const text = await assertNotDelivered(handle);
      assert.match(text, /현재 탭/);
      assert.match(text, /새로고침|탭.*닫/);
      await assertNoPersistentPii(handle);

      const ids = kind === 'general'
        ? ['#doneRetry', '#doneCopy']
        : ['#lkRetry', '#lkCopy'];
      for (const selector of ids) assert.equal(await handle.page.locator(selector).count(), 1, `${kind} missing ${selector}`);
      assert.equal(await handle.page.locator('a[href^="tel:"]').count() > 0, true);
      assert.equal(await handle.page.locator('a[href^="sms:"]').count() > 0, true);
      assert.equal(
        kind === 'general'
          ? await handle.page.locator('#doneKakao').count()
          : await handle.page.locator('a[href*="chat.test.invalid"]').count(),
        1,
        `${kind} missing Kakao action`
      );

      const copySelector = kind === 'general' ? '#doneCopy' : '#lkCopy';
      await handle.page.click(copySelector);
      assert.equal(await handle.page.evaluate(() => window.__leadSinks.clipboard.some((text) => text.includes('TEST_NAME_XSS'))), true);
      await assertNotDelivered(handle);

      const resultRoot = kind === 'general' ? '.inquiry-done' : '#lkDone';
      await handle.page.locator(`${resultRoot} a[href^="tel:"]`).first().click();
      await assertNotDelivered(handle);
      await handle.page.locator(`${resultRoot} a[href^="sms:"]`).first().click();
      await assertNotDelivered(handle);
      if (kind === 'general') await handle.page.click('#doneKakao');
      else await handle.page.locator(`${resultRoot} a[href*="chat.test.invalid"]`).click();
      await assertNotDelivered(handle);
      assert.equal(await handle.page.evaluate(() => window.__successTransitions), 0);
      const recordedActions = await handle.page.evaluate(() => window.__leadSinks.actions.slice());
      assert.equal(recordedActions.some((entry) => String(entry[1]).startsWith('tel:')), true);
      assert.equal(recordedActions.some((entry) => String(entry[1]).startsWith('sms:')), true);
      assert.equal(recordedActions.some((entry) => String(entry[1]).includes('chat.test.invalid')), true);
      assert.equal(
        recordedActions.filter((entry) => containsPii(entry)).every((entry) => String(entry[1]).startsWith('sms:')),
        true,
        'only the intentional SMS body may contain inquiry PII in a launched action URL'
      );
      await assertNoPersistentPii(handle);

      const mobile = await handle.page.evaluate((selectors) => {
        const controls = selectors.map((selector) => document.querySelector(selector)).filter(Boolean);
        return {
          innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          controls: controls.map((el) => ({
            height: el.getBoundingClientRect().height,
            width: el.getBoundingClientRect().width,
            label: el.textContent.trim(),
            whiteSpace: getComputedStyle(el).whiteSpace,
          })),
        };
      }, ids);
      assert.equal(mobile.scrollWidth <= mobile.innerWidth, true, `${kind} has horizontal overflow`);
      for (const control of mobile.controls) {
        assert.equal(control.height >= 44, true, `${kind} action shorter than 44px`);
        assert.equal(control.width > 0, true);
        assert.equal(control.label.length > 0, true);
        assert.notEqual(control.whiteSpace, 'nowrap', `${kind} action label cannot wrap`);
      }

      const smsHrefs = await handle.page.locator('a[href^="sms:"]').evaluateAll((links) => links.map((link) => link.href));
      assert.equal(smsHrefs.some((href) => decodeURIComponent(href).includes('TEST_NAME_XSS')), true, 'SMS body is the intentional URL exception');
      const otherPiiUrls = await handle.page.locator('a[href]:not([href^="sms:"])').evaluateAll((links, markers) => (
        links.map((link) => link.href).filter((href) => markers.some((marker) => decodeURIComponent(href).includes(marker)))
      ), PII_MARKERS);
      assert.deepEqual(otherPiiUrls, []);
    } finally {
      await closeForm(handle);
    }
  }
});

test('공개 누수 사례 참조만 화면·n8n JSON·Web3Forms message·실패 복사에 전달한다', async () => {
  const caseIndex = { version: 1, cases: [PUBLIC_LEAK_CASE, INTERIOR_CASE, DRAFT_LEAK_CASE] };
  const n8n = await openForm('leak', {
    case: PUBLIC_LEAK_CASE.slug,
    caseIndex,
    config: n8nConfig(),
    responses: [json({ ok: true })],
  });
  try {
    await n8n.page.locator('#lkCaseReference').waitFor({ state: 'visible' });
    assert.match(await n8n.page.locator('#lkCaseReference').innerText(), new RegExp(PUBLIC_LEAK_CASE.title));
    assert.equal(n8n.controller.urls.some((value) => new URL(value).pathname === '/data/leak-case-index.json'), true,
      '누수 사례 참조는 경량 색인을 요청해야 한다');
    assert.equal(n8n.controller.urls.some((value) => new URL(value).pathname === '/data/site.json'), false,
      '누수 접수에서 전체 site.json을 다운로드하면 안 된다');
    await prepare(n8n);
    await submit(n8n);
    await waitForRequestCount(n8n, 1);
    assert.equal(JSON.parse(n8n.controller.requests[0].body).referenceCase, PUBLIC_LEAK_CASE.slug);
    await assertNoPersistentPii(n8n);
    await assertNoPersistentReference(n8n);
  } finally {
    await closeForm(n8n);
  }

  const forms = await openForm('leak', {
    case: PUBLIC_LEAK_CASE.slug,
    caseIndex,
    config: formsConfig('web3forms'),
    responses: [json({ success: true })],
  });
  try {
    await prepare(forms);
    await submit(forms);
    await waitForRequestCount(forms, 1);
    const body = JSON.parse(forms.controller.requests[0].body);
    assert.equal(body.referenceCase, PUBLIC_LEAK_CASE.slug);
    assert.doesNotMatch(body.message, new RegExp(PUBLIC_LEAK_CASE.title));
    assert.match(body.message, new RegExp(PUBLIC_LEAK_CASE.slug));
  } finally {
    await closeForm(forms);
  }

  const failed = await openForm('leak', {
    case: PUBLIC_LEAK_CASE.slug,
    caseIndex,
    config: n8nConfig(),
    responses: [json({ ok: false })],
  });
  try {
    await prepare(failed);
    await submit(failed);
    await assertNotDelivered(failed);
    await failed.page.click('#lkCopy');
    const copied = await failed.page.evaluate(() => window.__leadSinks.clipboard.slice());
    assert.equal(copied.some((text) => text.includes(PUBLIC_LEAK_CASE.slug) && !text.includes(PUBLIC_LEAK_CASE.title)), true);
    await assertNoPersistentPii(failed);
    await assertNoPersistentReference(failed);
  } finally {
    await closeForm(failed);
  }
});

test('알 수 없거나 신뢰되지 않은 사례 query는 화면·전송·복사에 넣지 않고 URL을 다시 쓰지 않는다', async () => {
  const caseIndex = { version: 1, cases: [PUBLIC_LEAK_CASE, INTERIOR_CASE, DRAFT_LEAK_CASE] };
  const rejected = [
    'unknown-case',
    '<img src=x data-untrusted-case="CASE_QUERY_XSS">',
    INTERIOR_CASE.slug,
    DRAFT_LEAK_CASE.slug,
  ];
  for (const caseValue of rejected) {
    const handle = await openForm('leak', {
      case: caseValue, caseIndex, config: n8nConfig(), responses: [json({ ok: false })],
    });
    try {
      assert.equal(await handle.page.locator('#lkCaseReference').isHidden(), true, `${caseValue} was displayed`);
      await prepare(handle);
      await submit(handle);
      await waitForRequestCount(handle, 1);
      const body = JSON.parse(handle.controller.requests[0].body);
      assert.equal(Object.hasOwn(body, 'referenceCase'), false, `${caseValue} reached n8n payload`);
      await assertNotDelivered(handle);
      await handle.page.click('#lkCopy');
      const copied = await handle.page.evaluate(() => window.__leadSinks.clipboard.slice());
      assert.equal(copied.some((text) => text.includes(caseValue)), false, `${caseValue} reached failure copy`);
      const state = await handle.page.evaluate(() => ({
        local: Object.keys(localStorage), session: Object.keys(sessionStorage),
        urlWrites: window.__leadSinks.urls.filter((entry) => /history\.|location/.test(String(entry[0]))),
        xss: window.__xss,
      }));
      assert.deepEqual(state.local, []);
      assert.deepEqual(state.session, []);
      assert.deepEqual(state.urlWrites, []);
      assert.equal(state.xss, 0);
      await assertNoPersistentPii(handle);
    } finally {
      await closeForm(handle);
    }
  }
});

test('중복 사례와 사례 목록 abort·500·malformed는 사례 없이 일반 접수를 계속한다', async () => {
  const fixtures = [
    {
      label: 'duplicate',
      response: json({ version: 1, cases: [PUBLIC_LEAK_CASE, { ...PUBLIC_LEAK_CASE }] }),
    },
    { label: 'abort', response: { kind: 'abort' } },
    { label: '500', response: raw('{"error":"server"}', 500) },
    { label: 'malformed', response: raw('{not-json') },
  ];
  for (const fixture of fixtures) {
    const handle = await openForm('leak', {
      case: PUBLIC_LEAK_CASE.slug,
      caseIndexResponse: fixture.response,
      config: n8nConfig(),
      responses: [json({ ok: true })],
    });
    try {
      assert.equal(await handle.page.locator('#lkCaseReference').isHidden(), true, `${fixture.label} displayed a reference`);
      await prepare(handle);
      await submit(handle);
      await waitForRequestCount(handle, 1);
      assert.equal(Object.hasOwn(JSON.parse(handle.controller.requests[0].body), 'referenceCase'), false,
        `${fixture.label} reached the provider payload`);
      await assertNoPersistentReference(handle);
    } finally {
      await closeForm(handle);
    }
  }
});

test('사례 목록 조회가 멈춰도 짧은 제한 후 일반 접수를 한 번만 전송한다', async () => {
  const pendingCaseIndex = deferredResponse();
  const handle = await openForm('leak', {
    case: PUBLIC_LEAK_CASE.slug,
    caseIndexResponse: pendingCaseIndex,
    waitUntil: 'load',
    config: n8nConfig(),
    responses: [json({ ok: true }), json({ ok: true })],
  });
  try {
    await prepare(handle);
    const started = Date.now();
    await handle.page.evaluate(() => {
      const form = document.querySelector('#leakForm');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await waitForRequestCount(handle, 1);
    assert.equal(Date.now() - started < 3500, true, 'hung case lookup blocked the general inquiry');
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(handle.controller.requests.length, 1, 'double submit sent duplicate inquiries');
    assert.equal(Object.hasOwn(JSON.parse(handle.controller.requests[0].body), 'referenceCase'), false);
    assert.equal(await handle.page.locator('#lkCaseReference').isHidden(), true);
    pendingCaseIndex.resolve(json({ version: 1, cases: [PUBLIC_LEAK_CASE] }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(await handle.page.locator('#lkCaseReference').isHidden(), true, 'late case lookup changed the page');
    assert.equal(Object.hasOwn(JSON.parse(handle.controller.requests[0].body), 'referenceCase'), false,
      'late case lookup changed the submitted payload');
    await assertNoPersistentReference(handle);
  } finally {
    await closeForm(handle);
  }
});

test('누수 폼은 설정 조회가 1초 안에 늦게 완료돼도 첫 제출을 n8n에 한 번만 전송한다', async () => {
  const pendingConfig = deferredResponse();
  const handle = await openForm('leak', {
    waitUntil: 'load',
    config: n8nConfig(),
    configResponse: pendingConfig,
    responses: [json({ ok: true }), json({ ok: true })],
  });
  try {
    await waitForConfigRequest(handle);
    await prepare(handle);
    await handle.page.evaluate(() => {
      const form = document.querySelector('#leakForm');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    pendingConfig.resolve(json(n8nConfig()));

    await waitForRequestCount(handle, 1);
    const text = await resultText(handle);
    assert.match(text, /접수됐습니다\./);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(handle.controller.requests.length, 1, 'consecutive submits duplicated the n8n delivery');
  } finally {
    pendingConfig.resolve(json({}));
    await closeForm(handle);
  }
});

test('누수 폼은 설정 조회가 계속 멈추면 약 1.5초 안에 직접 연락 실패 화면으로 끝내고 provider에 전송하지 않는다', async () => {
  const pendingConfig = deferredResponse();
  const handle = await openForm('leak', {
    waitUntil: 'load',
    config: n8nConfig(),
    configResponse: pendingConfig,
    responses: [json({ ok: true })],
  });
  try {
    await waitForConfigRequest(handle);
    await prepare(handle);
    const started = Date.now();
    await handle.page.locator('#leakForm').dispatchEvent('submit');
    const text = await assertNotDelivered(handle, 2800);
    const elapsed = Date.now() - started;
    assert.equal(elapsed >= 1200 && elapsed < 2300, true, `config timeout took ${elapsed}ms instead of about 1.5s`);
    assert.match(text, /홈페이지 설정을 잠시 못 읽어/);
    assert.equal(await handle.page.locator('#lkDone a[href^="tel:"]').count() > 0, true);
    assert.equal(handle.controller.requests.length, 0, 'a stuck config lookup reached the provider');
  } finally {
    pendingConfig.resolve(json({}));
    await closeForm(handle);
  }
});

test('허니팟 제출은 전송·기억 없이 미전송 안내와 직접 연락 경로만 남긴다', async () => {
  for (const kind of ['general', 'leak']) {
    const handle = await openForm(kind, { responses: [json({ ok: true })] });
    try {
      await prepare(handle, { honeypot: true });
      await submit(handle);
      const text = await assertNotDelivered(handle);
      assert.match(text, /저장되지|보관하지/);
      assert.equal(handle.controller.requests.length, 0);
      assert.equal(await handle.page.evaluate(() => window.__retryCallCount), 0);
      await assertNoPersistentPii(handle);
    } finally {
      await closeForm(handle);
    }
  }
});

test('자동 접수 경로가 없을 때도 현재 탭 한 건만 기억하고 직접 연락 행동을 제공한다', async () => {
  const unavailableConfig = {
    demoMode: false,
    n8n: { enabled: false, inquiryWebhookUrl: '' },
    forms: { enabled: false, provider: '', endpoint: '', accessKey: '' },
    kakao: { ready: true, chatUrl: 'https://chat.test.invalid/channel' },
  };
  for (const kind of ['general', 'leak']) {
    const handle = await openForm(kind, { config: unavailableConfig, responses: [] });
    try {
      await prepare(handle);
      await submit(handle);
      const text = await assertNotDelivered(handle);
      assert.match(text, /현재 탭/);
      assert.equal(handle.controller.requests.length, 0);
      assert.equal(await handle.page.locator(kind === 'general' ? '#doneRetry' : '#lkRetry').count(), 0);
      assert.equal(await handle.page.locator(kind === 'general' ? '#doneCopy' : '#lkCopy').count(), 1);
      await assertNoPersistentPii(handle);
    } finally {
      await closeForm(handle);
    }
  }
});

test('IndexedDB cursor update도 개인정보 쓰기 계측 경로에 포함된다', async () => {
  const handle = await openForm('general', { responses: [] });
  try {
    const captured = await handle.page.evaluate(async () => {
      const request = indexedDB.open('task3-safe-instrumentation', 1);
      const db = await new Promise((resolve, reject) => {
        request.onupgradeneeded = () => request.result.createObjectStore('items', { keyPath: 'id' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('items', 'readwrite');
        tx.objectStore('items').put({ id: 1, value: 'SAFE_BEFORE' });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('items', 'readwrite');
        const cursorRequest = tx.objectStore('items').openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) cursor.update({ id: 1, value: 'SAFE_AFTER' });
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      indexedDB.deleteDatabase('task3-safe-instrumentation');
      await window.__leadAwaitPrivacyInspections();
      return window.__leadSinks.idb.slice();
    });
    assert.equal(captured.some((entry) => (
      entry[0] === 'cursor.update' && JSON.stringify(entry[1]).includes('SAFE_AFTER')
    )), true);
  } finally {
    await closeForm(handle);
  }
});

test('진행 중인 유효 제출 뒤의 유효성 실패 제출은 기존 epoch를 무효화하지 않는다', async () => {
  for (const kind of ['general', 'leak']) {
    const pending = deferredResponse();
    const handle = await openForm(kind, { responses: [pending] });
    try {
      await prepare(handle);
      await submit(handle);
      await waitForRequestCount(handle, 1);

      await handle.page.locator(kind === 'general' ? '#iPhone' : '#lkPhone').evaluate((input) => {
        input.value = '1';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await handle.page.locator(kind === 'general' ? '#inquiryForm' : '#leakForm').dispatchEvent('submit');
      assert.equal(handle.controller.requests.length, 1, 'invalid submission sent another request');
      assert.equal(await handle.page.locator(kind === 'general' ? '#submitInquiry' : '#lkSubmit').isDisabled(), true);

      pending.resolve(json({ ok: true }));
      const text = await resultText(handle);
      assert.match(text, /상담 신청이 전달되었습니다|접수됐습니다\./);
      assert.equal(await handle.page.locator(kind === 'general' ? '#submitInquiry' : '#lkSubmit').isDisabled(), false);
      assert.equal(await handle.page.evaluate(() => window.__successTransitions), 1);
    } finally {
      pending.resolve(json({ ok: false }));
      await closeForm(handle);
    }
  }
});

test('진행 중 제출 뒤 허니팟 제출은 이전 epoch를 무효화하고 기억 없이 미전송 상태를 유지한다', async () => {
  for (const kind of ['general', 'leak']) {
    const pending = deferredResponse();
    const handle = await openForm(kind, { responses: [pending] });
    try {
      await prepare(handle);
      await submit(handle);
      await waitForRequestCount(handle, 1);

      const honeypotWasSet = await handle.page.evaluate(({ honeypotSelector, formSelector }) => {
        const honeypot = document.querySelector(honeypotSelector);
        const form = document.querySelector(formSelector);
        if (!honeypot || !form) return false;
        honeypot.value = 'https://bot.invalid';
        honeypot.dispatchEvent(new Event('input', { bubbles: true }));
        if (!honeypot.value) return false;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        return true;
      }, {
        honeypotSelector: kind === 'general' ? '#iCompanyUrl' : '#lkCompanyUrl',
        formSelector: kind === 'general' ? '#inquiryForm' : '#leakForm',
      });
      assert.equal(honeypotWasSet, true, `${kind} honeypot precondition was not established`);
      await assertNotDelivered(handle);
      assert.equal(handle.controller.requests.length, 1, 'honeypot submission sent another request');
      assert.equal(await handle.page.evaluate(() => window.__rememberCallCount), 0);
      assert.equal(await handle.page.locator(kind === 'general' ? '#submitInquiry' : '#lkSubmit').isDisabled(), false);

      pending.resolve(json({ ok: true }));
      await new Promise((resolve) => setTimeout(resolve, 120));
      await assertNotDelivered(handle);
      assert.equal(await handle.page.evaluate(() => window.__successTransitions), 0);
    } finally {
      pending.resolve(json({ ok: false }));
      await closeForm(handle);
    }
  }
});

test('수동 재시도·온라인 이벤트·연속 클릭은 한 요청과 한 성공 전환만 만든다', async () => {
  for (const kind of ['general', 'leak']) {
    const retry = deferredResponse();
    const handle = await openForm(kind, { responses: [json({ ok: false }), retry] });
    try {
      await prepare(handle);
      await submit(handle);
      await assertNotDelivered(handle);
      const selector = kind === 'general' ? '#doneRetry' : '#lkRetry';
      await handle.page.evaluate((buttonSelector) => {
        const button = document.querySelector(buttonSelector);
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        window.dispatchEvent(new Event('online'));
      }, selector);
      await waitForRequestCount(handle, 2);
      assert.equal(await handle.page.evaluate(() => window.__retryCallCount >= 3), true, 'manual and online paths must call shared retryLatest');
      retry.resolve(json({ ok: true }));
      const text = await resultText(handle);
      assert.match(text, /상담 신청이 전달되었습니다|접수됐습니다\./);
      assert.equal(await handle.page.evaluate(() => window.__successTransitions), 1);
      assert.equal(handle.controller.requests.length, 2, 'overlapping retries created duplicate requests');
    } finally {
      retry.resolve(json({ ok: false }));
      await closeForm(handle);
    }
  }
});

test('늦은 직접 성공은 더 최신 실패 화면을 덮거나 누수 제출 버튼을 조기에 다시 켜지 않는다', async () => {
  for (const kind of ['general', 'leak']) {
    const first = deferredResponse();
    const second = deferredResponse();
    const handle = await openForm(kind, { responses: [first, second] });
    try {
      await prepare(handle);
      await submit(handle);
      await waitForRequestCount(handle, 1);
      await handle.page.locator(kind === 'general' ? '#inquiryForm' : '#leakForm').dispatchEvent('submit');
      await waitForRequestCount(handle, 2);

      first.resolve(json({ ok: true }));
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (kind === 'leak') {
        assert.equal(await handle.page.locator('#lkSubmit').isDisabled(), true, 'older finally re-enabled the leak button');
      }

      second.resolve(json({ ok: false }));
      await assertNotDelivered(handle);
      assert.equal(await handle.page.evaluate(() => window.__successTransitions), 0);
    } finally {
      first.resolve(json({ ok: false }));
      second.resolve(json({ ok: false }));
      await closeForm(handle);
    }
  }
});

test('오래된 재시도 성공과 세대가 맞지 않는 직접 성공은 최신 실패를 지우지 않는다', async () => {
  for (const kind of ['general', 'leak']) {
    const retry = deferredResponse();
    const direct = deferredResponse();
    const handle = await openForm(kind, { responses: [json({ ok: false }), retry, json({ ok: false }), direct] });
    try {
      await prepare(handle);
      await submit(handle);
      await assertNotDelivered(handle);
      const retrySelector = kind === 'general' ? '#doneRetry' : '#lkRetry';
      await handle.page.locator(retrySelector).dispatchEvent('click');
      await waitForRequestCount(handle, 2);

      // A new direct failure becomes the visible generation while the older retry is still in flight.
      await handle.page.evaluate((formSelector) => {
        const form = document.querySelector(formSelector);
        form.hidden = false;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }, kind === 'general' ? '#inquiryForm' : '#leakForm');
      await waitForRequestCount(handle, 3);
      await assertNotDelivered(handle);
      retry.resolve(json({ ok: true }));
      await new Promise((resolve) => setTimeout(resolve, 120));
      await assertNotDelivered(handle);

      // A direct success captured the visible generation before this still-newer failure was created.
      await handle.page.evaluate((formSelector) => {
        const form = document.querySelector(formSelector);
        form.hidden = false;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }, kind === 'general' ? '#inquiryForm' : '#leakForm');
      await waitForRequestCount(handle, 4);
      const newestGeneration = await handle.page.evaluate(() => window.ManmulLead.rememberFailure({
        source: 'test-only-newest-generation', name: 'SAFE_NEWEST', phone: '0000000000',
      }));
      assert.equal(newestGeneration >= 3, true);
      direct.resolve(json({ ok: true }));
      await new Promise((resolve) => setTimeout(resolve, 120));
      const clearArgs = await handle.page.evaluate(() => window.__clearFailureArgs.slice());
      assert.equal(clearArgs.includes(newestGeneration), false, 'direct success cleared a generation created after it started');
      assert.equal(clearArgs.some((generation) => generation > 0 && generation < newestGeneration), true, 'direct success did not use its captured generation');
      assert.equal(
        await handle.page.evaluate((generation) => window.ManmulLead.clearFailure(generation), newestGeneration),
        true,
        'the newest failure generation did not remain after the older captured generation was cleared'
      );
    } finally {
      retry.resolve(json({ ok: false }));
      direct.resolve(json({ ok: false }));
      await closeForm(handle);
    }
  }
});

test('실패 후 새로고침은 재시도를 호출하지 않고 문의 초안을 복원하지 않는다', async () => {
  for (const kind of ['general', 'leak']) {
    const handle = await openForm(kind, { responses: [json({ ok: false }), json({ ok: true })] });
    try {
      await prepare(handle);
      await submit(handle);
      await assertNotDelivered(handle);
      await handle.page.reload({ waitUntil: 'networkidle' });
      if (kind === 'general') {
        await handle.page.waitForFunction(() => window.MANMUL && document.querySelectorAll('#worksGroup input').length > 0);
        assert.equal(await handle.page.inputValue('#iName'), '');
        assert.equal(await handle.page.inputValue('#iPhone'), '');
      } else {
        assert.equal(await handle.page.inputValue('#lkName'), '');
        assert.equal(await handle.page.inputValue('#lkPhone'), '');
      }
      await new Promise((resolve) => setTimeout(resolve, 3300));
      assert.equal(handle.controller.requests.length, 1, 'reload automatically retried the failed inquiry');
      assert.equal(await handle.page.evaluate(() => window.__retryCallCount), 0, 'page load called retryLatest');
    } finally {
      await closeForm(handle);
    }
  }
});

test('명시적 거절·빈 본문·잘못된 JSON·네트워크 오류는 성공 안내를 만들지 않는다', async () => {
  const failures = [
    json({ ok: false, success: false }),
    raw(''),
    raw('{broken'),
    { kind: 'abort' },
  ];
  for (const kind of ['general', 'leak']) {
    for (const response of failures) {
      const handle = await openForm(kind, { responses: [response] });
      try {
        await prepare(handle);
        await submit(handle);
        await assertNotDelivered(handle);
        assert.equal(await handle.page.evaluate(() => window.__successTransitions), 0);
      } finally {
        await closeForm(handle);
      }
    }
  }
});

test('요청 시간 초과 뒤 늦은 성공도 두 폼 모두 제출 완료로 바뀌지 않는다', { timeout: 45000 }, async () => {
  for (const kind of ['general', 'leak']) {
    const late = deferredResponse();
    const handle = await openForm(kind, { responses: [late] });
    try {
      await prepare(handle);
      await submit(handle);
      await waitForRequestCount(handle, 1);
      await assertNotDelivered(handle, 14000);
      late.resolve(json({ ok: true }));
      await new Promise((resolve) => setTimeout(resolve, 150));
      await assertNotDelivered(handle);
      assert.equal(await handle.page.evaluate(() => window.__successTransitions), 0);
    } finally {
      late.resolve(json({ ok: false }));
      await closeForm(handle);
    }
  }
});

test('n8n·Web3Forms·generic·formspree의 허용 응답만 두 폼에서 성공 처리된다', async () => {
  const accepted = [
    { config: n8nConfig(), body: { ok: true } },
    { config: n8nConfig(), body: { success: true } },
    { config: formsConfig('web3forms'), body: { success: true } },
    { config: formsConfig('generic'), body: { ok: true } },
    { config: formsConfig('formspree'), body: { success: true } },
  ];
  for (const kind of ['general', 'leak']) {
    for (const entry of accepted) {
      const handle = await openForm(kind, { config: entry.config, responses: [json(entry.body)] });
      try {
        await prepare(handle);
        await submit(handle);
        const text = await resultText(handle);
        assert.match(text, /상담 신청이 전달되었습니다|접수됐습니다\./);
        assert.deepEqual(
          await handle.page.evaluate(() => window.__clearFailureArgs.slice()),
          [],
          'a fresh direct success must not clear an unrelated failure generation'
        );
        await assertNoPersistentPii(handle);
      } finally {
        await closeForm(handle);
      }
    }
  }

  const rejected = await openForm('general', {
    config: formsConfig('web3forms'),
    responses: [json({ ok: true })],
  });
  try {
    await prepare(rejected);
    await submit(rejected);
    await assertNotDelivered(rejected);
  } finally {
    await closeForm(rejected);
  }
});

test('관리자 첫 진입은 transport를 먼저 한 번만 실행하고 로컬 문의 UI·reader 없이 legacy PII를 제거한다', async () => {
  const probe = await openAdmin({ seedLegacy: false });
  try {
    await assertPrivacyInspectionCoverage(
      probe.page,
      '__adminPrivacy',
      '__adminAwaitPrivacyInspections',
      'admin'
    );
  } finally {
    await closeAdmin(probe);
  }

  const handle = await openAdmin();
  try {
    const scripts = await handle.page.locator('script[src]').evaluateAll((nodes) => nodes
      .map((node) => ({
        file: new URL(node.src).pathname.split('/').pop(),
        async: node.async,
        defer: node.defer,
      }))
      .filter((item) => ['lead-transport.js', 'admin.js', 'content-editor.js'].includes(item.file)));
    assert.deepEqual(scripts, [
      { file: 'lead-transport.js', async: false, defer: false },
      { file: 'admin.js', async: false, defer: false },
      { file: 'content-editor.js', async: false, defer: false },
    ]);

    for (const selector of [
      'a[href="#inquiryPanel"]', '#kpiRow', '#inquiryPanel', '#inqCount',
      '#statusFilter', '#seedBtn', '#inquiryList', '#emptyNote',
    ]) {
      assert.equal(await handle.page.locator(selector).count(), 0, `removed admin UI returned: ${selector}`);
    }

    const snapshot = await adminPrivacySnapshot(handle);
    assert.equal(snapshot.state.removeAttempts, 1, 'admin did not run exactly one cleanup initialization');
    assert.equal(snapshot.hasLegacy, false, 'admin-first cleanup left the legacy key behind');
    assertAdminNoPii(snapshot, handle.controller, handle.page.url());
    assert.deepEqual(handle.pageErrors, []);

    const adminSource = fs.readFileSync(path.join(ROOT, 'js', 'admin.js'), 'utf8');
    assert.equal(adminSource.includes(LEGACY_KEY), false, 'admin source still names the legacy inquiry key');
    assert.doesNotMatch(adminSource, /localStorage\s*\.\s*(?:getItem|setItem)\s*\(/, 'admin source still has a local reader/writer');
    assert.doesNotMatch(adminSource, /function\s+seed\s*\(/, 'admin source still has sample inquiry generation');
  } finally {
    await closeAdmin(handle);
  }
});

test('관리자 외부 접수 상태·비파괴 설정 확인·콘텐츠 편집기는 실제로 계속 동작한다', async () => {
  const handle = await openAdmin({ seedLegacy: false });
  try {
    await handle.page.locator('[data-content-path="company.name"]').waitFor({ state: 'visible' });
    assert.equal(await handle.page.locator('#pipelinePanel').isVisible(), true);
    assert.equal(await handle.page.locator('#connGrid .conn-item').count() > 0, true);
    assert.doesNotMatch(await handle.page.locator('#pipelineStatus').innerText(), /확인 중/);

    await handle.page.click('[data-content-tab="services"]');
    const serviceTitle = handle.page.locator('[data-content-path="services.0.title"]');
    await serviceTitle.waitFor({ state: 'visible' });
    await serviceTitle.fill('SAFE EDITED SERVICE');
    assert.match(await handle.page.locator('#contentState').innerText(), /저장 안 된/);

    assert.equal(handle.controller.requests.length, 0);
    await handle.page.click('#connTest');
    await handle.page.waitForFunction(() => document.querySelector('#connResult')?.textContent.trim().length > 0);
    assert.equal(handle.controller.requests.length, 0, 'configuration check sent a real test request');
    assert.match(await handle.page.locator('#connResult').innerText(), /설정|접수 경로/);
    assert.deepEqual(handle.pageErrors, []);
  } finally {
    await closeAdmin(handle);
  }
});

test('관리자 route 상태는 n8n 우선과 명시적 지원 provider 계약을 transport와 같이 따른다', async () => {
  const blankProvider = adminConfig({ provider: 'web3forms' });
  blankProvider.forms.provider = '';
  const cases = [
    { config: adminConfig({ n8n: true }), on: true, via: 'n8n' },
    { config: adminConfig({ provider: 'web3forms' }), on: true, via: 'forms' },
    { config: adminConfig({ provider: 'generic' }), on: true, via: 'forms' },
    { config: adminConfig({ provider: 'formspree' }), on: true, via: 'forms' },
    { config: adminConfig({ provider: ' Formspree ' }), on: true, via: 'forms' },
    { config: adminConfig({ provider: 'unknown-provider' }), on: false, via: '' },
    { config: blankProvider, on: false, via: '' },
    { config: adminConfig({ both: true }), on: true, via: 'n8n' },
  ];

  for (const entry of cases) {
    const handle = await openAdmin({ seedLegacy: false, config: entry.config });
    try {
      const status = await handle.page.locator('#pipelineStatus').innerText();
      const badge = await handle.page.locator('#connBadge').innerText();
      const routeRow = handle.page.locator('#connGrid .conn-item').first();
      if (!entry.on) {
        assert.match(status, /없음|전달되지/);
        assert.match(badge, /없음/);
        assert.equal(await routeRow.evaluate((node) => node.classList.contains('no')), true);
      } else if (entry.via === 'n8n') {
        assert.match(status, /n8n/i);
        assert.match(badge, /n8n/i);
        assert.equal(await routeRow.evaluate((node) => node.classList.contains('ok')), true);
      } else {
        assert.match(status, /폼 서비스/);
        assert.match(badge, /폼 서비스/);
        assert.equal(await routeRow.evaluate((node) => node.classList.contains('ok')), true);
      }
      assert.equal(handle.controller.requests.length, 0);
      assert.deepEqual(handle.pageErrors, []);
    } finally {
      await closeAdmin(handle);
    }
  }
});

test('관리자 공개 DOM·URL·console은 합성 endpoint와 accessKey 값을 노출하지 않는다', async () => {
  const cases = [
    {
      label: 'n8n',
      expectedRoute: /n8n/i,
      config: {
        demoMode: false,
        n8n: { enabled: true, inquiryWebhookUrl: `${origin}/__admin/${ADMIN_CONFIG_MARKERS[0]}` },
        forms: { enabled: false, provider: '', endpoint: '', accessKey: '' },
        kakao: { ready: false, chatUrl: '', channelAddUrl: '', channelPublicId: '' },
        hyeonjang: { appUrl: '' },
      },
    },
    {
      label: 'forms',
      expectedRoute: /formspree/i,
      config: {
        demoMode: false,
        n8n: { enabled: false, inquiryWebhookUrl: '' },
        forms: {
          enabled: true,
          provider: 'formspree',
          endpoint: `${origin}/__admin/${ADMIN_CONFIG_MARKERS[1]}`,
          accessKey: ADMIN_CONFIG_MARKERS[2],
        },
        kakao: { ready: false, chatUrl: '', channelAddUrl: '', channelPublicId: '' },
        hyeonjang: { appUrl: '' },
      },
    },
  ];
  const disclosures = [];

  for (const entry of cases) {
    const handle = await openAdmin({ seedLegacy: false, config: entry.config });
    try {
      const routeState = [
        await handle.page.locator('#pipelineStatus').innerText(),
        await handle.page.locator('#pipeNote').innerText(),
        await handle.page.locator('#connGrid').innerText(),
      ].join('\n');
      assert.match(routeState, entry.expectedRoute);
      assert.match(routeState, /설정됨/);

      const surface = await handle.page.evaluate(() => ({
        bodyInnerHtml: document.body ? document.body.innerHTML : '',
        bodyTextContent: document.body ? document.body.textContent : '',
        attributes: Array.from(document.querySelectorAll('*')).flatMap((node) =>
          Array.from(node.attributes || [], (attribute) => [attribute.name, attribute.value])),
        pageUrl: location.href,
        console: window.__adminPrivacy.console.slice(),
        instrumentedUrls: window.__adminPrivacy.urls.slice(),
      }));
      surface.requestUrls = handle.controller.urls.slice();

      for (const [sink, value] of Object.entries(surface)) {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        if (ADMIN_CONFIG_MARKERS.some((marker) => serialized.includes(marker))) {
          disclosures.push(`${entry.label}:${sink}`);
        }
      }
      assert.deepEqual(handle.pageErrors, []);
    } finally {
      await closeAdmin(handle);
    }
  }

  assert.deepEqual(disclosures, [], 'admin exposed a configured secret marker in a public surface');
});

test('cleanup 첫 remove가 throw해도 같은 문서에서는 한 번만 시도하고 다음 문서에서 제거한다', async () => {
  const handle = await openAdmin({ throwOnce: true });
  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const first = await adminPrivacySnapshot(handle);
    assert.equal(first.state.removeAttempts, 1, 'first admin document retried cleanup immediately');
    assert.equal(first.hasLegacy, true, 'the injected first remove unexpectedly succeeded');
    assertAdminNoPii(first, handle.controller, handle.page.url());
    assert.equal(await handle.page.locator('#pipelinePanel').isVisible(), true);
    await handle.page.locator('[data-content-path="company.name"]').waitFor({ state: 'visible' });
    assert.deepEqual(handle.pageErrors, []);

    await handle.page.reload({ waitUntil: 'networkidle' });
    await handle.page.locator('[data-content-path="company.name"]').waitFor({ state: 'visible' });
    const second = await adminPrivacySnapshot(handle);
    assert.equal(second.state.removeAttempts, 1, 'second admin document did not make exactly one cleanup attempt');
    assert.equal(second.hasLegacy, false, 'second document did not remove the legacy key');
    assertAdminNoPii(second, handle.controller, handle.page.url());
    assert.equal(await handle.page.locator('#pipelinePanel').isVisible(), true);
    assert.deepEqual(handle.pageErrors, []);
  } finally {
    await closeAdmin(handle);
  }
});
