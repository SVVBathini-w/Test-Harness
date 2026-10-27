/**
 * Minimal JSON Schema validator — the subset Testharness schemas actually use.
 *
 * Supported: type (incl. union arrays), required, properties, additionalProperties,
 * enum, const, items, minItems, maxItems, uniqueItems, minLength, maxLength, minimum, maximum,
 * pattern, $ref to local #/$defs, $defs, anyOf, oneOf, not.
 *
 * Deliberately dependency-free: the harness must self-test on a machine with no
 * network and no node_modules.
 */

const typeOf = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
};

const typeMatches = (value, expected) => {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  if (expected === 'integer') return actual === 'integer';
  return actual === expected;
};

function resolveRef(ref, root) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref: ${ref}`);
  return ref
    .slice(2)
    .split('/')
    .reduce((node, key) => {
      if (node === undefined) throw new Error(`Unresolvable $ref: ${ref}`);
      return node[key.replace(/~1/g, '/').replace(/~0/g, '~')];
    }, root);
}

function walk(value, schema, root, path, errors) {
  if (schema === true || schema === undefined) return;
  if (schema === false) {
    errors.push(`${path}: schema forbids any value here`);
    return;
  }

  if (schema.$ref) {
    walk(value, resolveRef(schema.$ref, root), root, path, errors);
    return;
  }

  if (schema.type !== undefined) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.some((t) => typeMatches(value, t))) {
      errors.push(`${path}: expected ${expected.join(' or ')}, got ${typeOf(value)}`);
      return; // further keyword checks would only produce noise
    }
  }

  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  }

  if (schema.enum && !schema.enum.some((c) => JSON.stringify(c) === JSON.stringify(value))) {
    errors.push(`${path}: ${JSON.stringify(value)} is not one of [${schema.enum.join(', ')}]`);
  }

  const kind = typeOf(value);

  if (kind === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      errors.push(`${path}: shorter than minLength ${schema.minLength} (got ${value.length})`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      errors.push(`${path}: longer than maxLength ${schema.maxLength} (got ${value.length})`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      errors.push(`${path}: does not match pattern ${schema.pattern}`);
  }

  if (kind === 'number' || kind === 'integer') {
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push(`${path}: ${value} is below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push(`${path}: ${value} is above maximum ${schema.maximum}`);
  }

  if (kind === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      errors.push(`${path}: needs at least ${schema.minItems} items (got ${value.length})`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      errors.push(`${path}: allows at most ${schema.maxItems} items (got ${value.length})`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length)
      errors.push(`${path}: items must be unique`);
    if (schema.items) value.forEach((item, i) => walk(item, schema.items, root, `${path}[${i}]`, errors));
  }

  if (kind === 'object') {
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path}: missing required property "${key}"`);
    }
    const declared = schema.properties || {};
    for (const [key, sub] of Object.entries(declared)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        walk(value[key], sub, root, `${path}.${key}`, errors);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(declared, key)) errors.push(`${path}: unexpected property "${key}"`);
      }
    } else if (typeof schema.additionalProperties === 'object') {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(declared, key))
          walk(value[key], schema.additionalProperties, root, `${path}.${key}`, errors);
      }
    }
  }

  if (schema.anyOf && !schema.anyOf.some((s) => validateAgainst(value, s, root).length === 0)) {
    errors.push(`${path}: matches none of the anyOf branches`);
  }

  if (schema.oneOf) {
    const hits = schema.oneOf.filter((s) => validateAgainst(value, s, root).length === 0).length;
    if (hits !== 1) errors.push(`${path}: must match exactly one oneOf branch, matched ${hits}`);
  }

  if (schema.not && validateAgainst(value, schema.not, root).length === 0) {
    errors.push(`${path}: must not match the "not" schema`);
  }
}

function validateAgainst(value, schema, root) {
  const errors = [];
  walk(value, schema, root, '$', errors);
  return errors;
}

/** Returns an array of human-readable error strings. Empty means valid. */
export function validate(data, schema) {
  return validateAgainst(data, schema, schema);
}

export default validate;
