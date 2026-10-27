/**
 * Schemas accept what they should and reject what they should not.
 *
 * Run with `npm test`, or alone: node --test tests/unit/schemas.test.mjs
 */
import { test } from 'node:test';
import { join } from 'node:path';
import validate from '../../bin/lib/schema.mjs';
import { FAILURE_CLASSES } from '../../bin/lib/pipeline.mjs';
import { assert, goodDefect, readSchema, templateProject } from '../helpers.mjs';

test('gate-result: a well-formed gate passes', () => {
  const gate = {
    gate: 'traceability', passed: true, blocking: [], coverage: 100,
    evidence: 'Read 14 test symbols in tests/, matched all intent ids from qa-test-intents.json',
    confidence: 'high', produced_at: '2026-09-06', produced_by: 'qa-lead'
  };
  const errors = validate(gate, readSchema('gate-result'));
  assert(!errors.length, errors.join('\n'));
  return 'valid gate accepted';
});

test('gate-result: prose instead of a verdict is rejected', () => {
  const gate = { gate: 'traceability', passed: 'looks good to me', blocking: [], evidence: 'x', confidence: 'high', produced_at: '2026-09-06' };
  const errors = validate(gate, readSchema('gate-result'));
  assert(errors.some((e) => e.includes('expected boolean')), 'a non-boolean verdict was accepted');
  return 'string-matched verdicts blocked';
});

test('gate-result: thin evidence is rejected', () => {
  const gate = { gate: 'execution', passed: true, blocking: [], evidence: 'ok', confidence: 'high', produced_at: '2026-09-06' };
  const errors = validate(gate, readSchema('gate-result'));
  assert(errors.some((e) => e.includes('minLength')), 'a gate with no real evidence was accepted');
  return 'evidence minimum enforced';
});

test('test-intent: an intent without an oracle is rejected', () => {
  const doc = {
    project: 'demo', generated_at: '2026-09-06',
    intents: [{
      id: 'TI-001', behaviour: 'Locked account cannot authenticate', actor: 'locked user',
      trigger: 'submits valid credentials', expected_outcome: 'access denied with a generic message',
      risk: { level: 'high' }, layer: 3, coverage: { existing: [] },
      outcome: 'API_TEST_PREFERRED', confidence: 'high', evidence: 'derived from R-004'
    }]
  };
  const errors = validate(doc, readSchema('test-intent'));
  assert(errors.some((e) => e.includes('oracle')), 'an intent with no oracle was accepted');
  return 'oracle is mandatory';
});

test('test-intent: an invented outcome is rejected', () => {
  const doc = {
    project: 'demo', generated_at: '2026-09-06',
    intents: [{
      id: 'TI-001', behaviour: 'Locked account cannot authenticate', actor: 'locked user',
      trigger: 'submits valid credentials', expected_outcome: 'access denied',
      risk: { level: 'high' }, layer: 3, oracle: { kind: 'business-rule', detail: 'locked accounts never authenticate' },
      coverage: { existing: [] }, outcome: 'PROBABLY_FINE', confidence: 'high', evidence: 'derived from R-004'
    }]
  };
  const errors = validate(doc, readSchema('test-intent'));
  assert(errors.length > 0, 'an outcome outside the vocabulary was accepted');
  return 'outcome vocabulary enforced';
});

test('knowledge-record: provenance is mandatory', () => {
  const rec = {
    id: 'K-combobox-select', type: 'interaction-pattern', subject: 'Customer field',
    statement: 'Typing alone does not commit a value; the option must be selected with ArrowDown then Enter.',
    quality: 'VERIFIED', confidence: 'high', evidence: 'observed in browser 2026-09-06', scope: 'DURABLE'
  };
  const errors = validate(rec, readSchema('knowledge-record'));
  assert(errors.some((e) => e.includes('verified_against')) && errors.some((e) => e.includes('last_verified')),
    `expected staleness fields to be required, got: ${errors.join('; ')}`);
  return 'staleness detection cannot be skipped';
});

/** Minimal register that must validate. Mutations below prove each rule bites. */

test('defect-record: a confirmed, evidenced defect validates', () => {
  const errors = validate(goodDefect(), readSchema('defect-record'));
  assert(!errors.length, errors.join('\n'));
  return 'register accepted';
});

test('defect-record: a vague title is rejected', () => {
  const doc = goodDefect();
  doc.defects[0].title = 'Customer issue';
  const errors = validate(doc, readSchema('defect-record'));
  assert(errors.some((e) => e.includes('minLength')), 'the title "Customer issue" was accepted');
  return 'titles must identify the failure';
});

test('defect-record: a defect with no evidence is rejected', () => {
  const doc = goodDefect();
  doc.defects[0].evidence = [];
  const errors = validate(doc, readSchema('defect-record'));
  assert(errors.some((e) => e.includes('at least')), 'an unevidenced defect was accepted');
  return 'evidence is mandatory';
});

test('defect-record: an unjustified severity is rejected', () => {
  const doc = goodDefect();
  doc.defects[0].severity_rationale = 'bad';
  const errors = validate(doc, readSchema('defect-record'));
  assert(errors.some((e) => e.includes('minLength')), 'a severity with no impact rationale was accepted');
  return 'severity needs an impact rationale';
});

test('defect-record: an invented regression decision is rejected', () => {
  const doc = goodDefect();
  doc.defects[0].regression_decision = 'ADD_LOTS_OF_UI_TESTS';
  const errors = validate(doc, readSchema('defect-record'));
  assert(errors.some((e) => e.includes('not one of')), 'an invented regression decision was accepted');
  return 'vocabulary enforced';
});

test('test-inventory: an invented regression classification is rejected', () => {
  const doc = {
    project: 'demo-project', generated_at: '2026-09-07',
    tests: [{ case_id: 'TC-3001', test_ref: 'tests/api/x.spec.ts', layer: 3,
              classification: ['RUN_IT_ALWAYS'], tier: 1, status: 'HEALTHY', automation_status: 'AUTOMATED' }]
  };
  const errors = validate(doc, readSchema('test-inventory'));
  assert(errors.some((e) => e.includes('not one of')), 'an invented classification was accepted');
  return 'classification vocabulary enforced';
});

test('test-inventory: a tier above 4 is rejected', () => {
  const doc = {
    project: 'demo-project', generated_at: '2026-09-07',
    tests: [{ case_id: 'TC-3001', test_ref: 'tests/api/x.spec.ts', layer: 3,
              classification: ['SMOKE'], tier: 7, status: 'HEALTHY', automation_status: 'AUTOMATED' }]
  };
  const errors = validate(doc, readSchema('test-inventory'));
  assert(errors.some((e) => e.includes('maximum')), 'tier 7 was accepted; tiers are 0 to 4');
  return 'five tiers only';
});

test('hotspot-model: a signal without evidence is rejected', () => {
  const doc = {
    project: 'demo-project', generated_at: '2026-09-07',
    components: [{ component: 'TransferService', risk: 'CRITICAL',
                   signals: [{ signal: 'WEAK_COVERAGE' }], focus: ['negative amounts'] }]
  };
  const errors = validate(doc, readSchema('hotspot-model'));
  assert(errors.some((e) => e.includes('evidence')), 'an unevidenced risk signal was accepted');
  return 'risk ratings need evidence';
});

test('hotspot-model: an invented blast radius is rejected', () => {
  const doc = {
    project: 'demo-project', generated_at: '2026-09-07', components: [],
    change_impact: { blast_radius: 'PROBABLY_FINE' }
  };
  const errors = validate(doc, readSchema('hotspot-model'));
  assert(errors.some((e) => e.includes('not one of')), 'an invented blast radius was accepted');
  return 'blast radius vocabulary enforced';
});

test('gate-result: an invented release assessment is rejected', () => {
  const gate = { gate: 'reporting', passed: true, blocking: [], release_assessment: 'LOOKS_GOOD_TO_ME',
                 evidence: 'read results-summary.json and the defect register', confidence: 'high',
                 produced_at: '2026-09-07' };
  const errors = validate(gate, readSchema('gate-result'));
  assert(errors.some((e) => e.includes('not one of')), 'an invented release verdict was accepted');
  return 'release verdict vocabulary enforced';
});

test('template stack is flagged as a placeholder, not a decision', () => {
  const fw = templateProject().framework;
  assert(fw._placeholder === true,
    'the template stack carries no _placeholder flag, so every new project silently inherits it');
  return 'nothing inherits a stack by accident';
});

test('project schema demands a decided stack or an explicit placeholder', () => {
  const data = templateProject();
  delete data.framework._placeholder;
  const errors = validate(data, readSchema('project'));
  assert(errors.some((e) => e.includes('oneOf')),
    'a framework block with neither _placeholder nor selection was accepted');
  return 'placeholder XOR selection enforced';
});

test('project schema rejects a stack selection with no evidence', () => {
  const data = templateProject();
  delete data.framework._placeholder;
  data.framework.selection = { decision: 'NEW_FRAMEWORK_REQUIRED', reason: 'it is modern', discovered_from: [] };
  const errors = validate(data, readSchema('project'));
  assert(errors.some((e) => e.includes('minLength')), 'a one-clause reason was accepted');
  assert(errors.some((e) => e.includes('at least')), 'an empty discovered_from was accepted');
  return 'reason and discovered_from both enforced';
});

test('project schema rejects an invented stack decision', () => {
  const data = templateProject();
  delete data.framework._placeholder;
  data.framework.selection = {
    decision: 'USE_WHAT_I_KNOW',
    reason: 'the model is most familiar with this toolchain',
    discovered_from: ['package.json']
  };
  const errors = validate(data, readSchema('project'));
  assert(errors.some((e) => e.includes('not one of')), 'an invented stack decision was accepted');
  return 'decision vocabulary enforced';
});

test('project schema carries the languages the amendment requires', () => {
  const langs = readSchema('project').properties.framework.properties.language.enum;
  for (const l of ['typescript', 'javascript', 'python', 'csharp', 'java', 'kotlin', 'go', 'ruby'])
    assert(langs.includes(l), `language enum omits ${l}`);
  return `${langs.length} languages`;
});

test('test-inventory: an invented oracle strength is rejected', () => {
  const doc = {
    project: 'demo-project', generated_at: '2026-09-07',
    tests: [{ case_id: 'TC-3001', test_ref: 'tests/api/x.spec.ts', layer: 3, classification: ['SMOKE'],
              tier: 0, status: 'HEALTHY', automation_status: 'AUTOMATED', oracle_strength: 'PROBABLY_FINE' }]
  };
  const errors = validate(doc, readSchema('test-inventory'));
  assert(errors.some((e) => e.includes('not one of')), 'an invented oracle strength was accepted');
  return 'STRONG, ADEQUATE, WEAK, MISSING only';
});

test('test-inventory: debt needs a type from the vocabulary and a real summary', () => {
  const base = {
    project: 'demo-project', generated_at: '2026-09-07',
    tests: [{ case_id: 'TC-3001', test_ref: 'tests/api/x.spec.ts', layer: 3, classification: ['SMOKE'],
              tier: 0, status: 'HEALTHY', automation_status: 'AUTOMATED', debt: [] }]
  };
  const bogus = JSON.parse(JSON.stringify(base));
  bogus.tests[0].debt = [{ type: 'ITS_A_BIT_RUBBISH', summary: 'this test is not great at all' }];
  assert(validate(bogus, readSchema('test-inventory')).some((e) => e.includes('not one of')),
    'an invented debt type was accepted');

  const thin = JSON.parse(JSON.stringify(base));
  thin.tests[0].debt = [{ type: 'WEAK_ORACLE', summary: 'bad' }];
  assert(validate(thin, readSchema('test-inventory')).some((e) => e.includes('minLength')),
    'a three-character debt summary was accepted');
  return '12 debt types, summary enforced';
});

test('test-inventory: layers_verified rejects an invented layer', () => {
  const doc = {
    project: 'demo-project', generated_at: '2026-09-07',
    tests: [{ case_id: 'TC-3001', test_ref: 'tests/api/x.spec.ts', layer: 3, classification: ['SMOKE'],
              tier: 0, status: 'HEALTHY', automation_status: 'AUTOMATED', layers_verified: ['VIBES'] }]
  };
  const errors = validate(doc, readSchema('test-inventory'));
  assert(errors.some((e) => e.includes('not one of')), 'an invented verification layer was accepted');
  return 'layers of truth are a closed set';
});

test('defect-record: a silent cross-layer failure is expressible', () => {
  const doc = goodDefect();
  const d = doc.defects[0];
  d.discovery_method = 'SILENT_FAILURE_DETECTION';
  d.silent = true;
  d.cross_layer = {
    ui: 'Transfer complete banner shown',
    api: 'POST /transfer returned 500',
    database: 'no ledger row written',
    events: 'no TransferCompleted event published',
    correlation_id: 'abc-123',
    consistent: false,
    divergence: 'UI reported success; API failed; nothing persisted. The user believes the money moved.'
  };
  const errors = validate(doc, readSchema('defect-record'));
  assert(!errors.length, errors.join('\n'));
  return 'UI-says-success, backend-failed is recordable';
});

test('defect-record: cross_layer rejects an undeclared layer', () => {
  const doc = goodDefect();
  doc.defects[0].cross_layer = { ui: 'looked fine', vibes: 'off' };
  const errors = validate(doc, readSchema('defect-record'));
  assert(errors.some((e) => e.includes('unexpected property')), 'an undeclared cross-layer field was accepted');
  return 'cross-layer evidence is structured';
});

test('failure classes cover the three environment causes', () => {
  for (const c of ['DEPLOYMENT_MISMATCH', 'CONFIGURATION_FAILURE', 'FEATURE_FLAG_MISMATCH']) {
    assert(FAILURE_CLASSES.includes(c), `FAILURE_CLASSES is missing ${c}`);
    const schema = readSchema('defect-record');
    assert(JSON.stringify(schema).includes(c), `defect-record.failure_class is missing ${c}`);
  }
  return '3 causes distinguishable from ENVIRONMENT_FAILURE';
});

test('inventory records automation tool and language', () => {
  const props = readSchema('test-inventory').$defs.test.properties;
  assert(props.automation_tool, 'test-inventory cannot record the automation tool');
  assert(props.language, 'test-inventory cannot record the programming language');
  return 'multi-stack repositories are representable';
});

test('intent outcome can express moving to a lower layer', () => {
  const schema = JSON.stringify(readSchema('test-intent'));
  assert(schema.includes('MOVE_TO_LOWER_LAYER'), 'MOVE_TO_LOWER_LAYER absent from the outcome vocabulary');
  return 'section 15 outcome available';
});
