'use strict';

exports.mixinMochaAssertions = expect =>
  expect
    .addType({
      name: 'RawResult',
      base: 'object',
      identify(v) {
        return (
          this.baseType.identify(v) &&
          typeof v.output === 'string' &&
          'code' in v && // may be null
          Array.isArray(v.args)
        );
      }
    })
    .addType({
      name: 'JSONRunResult',
      base: 'object',
      identify(v) {
        return (
          this.baseType.identify(v) &&
          Object.prototype.toString.call(v.stats) === '[object Object]' &&
          Array.isArray(v.failures) &&
          typeof v.code === 'number'
        );
      }
    })
    .addType({
      name: 'RawRunResult',
      base: 'object',
      identify(v) {
        return (
          this.baseType.identify(v) &&
          typeof v.passing === 'number' &&
          typeof v.failing === 'number' &&
          typeof v.pending === 'number' &&
          typeof v.output === 'string' &&
          typeof v.code === 'number'
        );
      }
    })
    .addType({
      name: 'JSONSerializableMap',
      base: 'Map',
      identify(v) {
        return this.baseType.identify(v) && typeof v.toJSON === 'function';
      }
    })
    .addAssertion('<JSONRunResult> [not] to have (passed|succeeded)', function(
      expect,
      result
    ) {
      expect(result, 'to satisfy', {
        code: expect.it('[not] to be', 0),
        stats: {
          failures: expect.it('[not] to be', 0)
        },
        failures: expect.it('[not] to be empty')
      });
    })
    .addAssertion(
      '<RawRunResult|RawResult> [not] to have (passed|succeeded)',
      (expect, result) => {
        expect(result, '[not] to have property', 'code', 0);
      }
    )
    .addAssertion(
      '<RawRunResult|JSONRunResult> [not] to have completed with [exit] code <number>',
      (expect, result, code) => {
        expect(result.code, '[not] to be', code);
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have passed (with|having) count <number>',
      (expect, result, count) => {
        expect(result, '[not] to pass').and('[not] to satisfy', {
          stats: {passes: expect.it('to be', count)}
        });
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have failed (with|having) count <number>',
      (expect, result, count) => {
        expect(result, '[not] to have failed').and('[not] to satisfy', {
          stats: {failures: expect.it('to be', count)}
        });
      }
    )
    .addAssertion('<JSONRunResult> [not] to have failed', (expect, result) => {
      expect(result, '[not] to satisfy', {
        code: expect.it('to be greater than', 0),
        stats: {
          failures: expect.it('to be greater than', 0)
        },
        failures: expect.it('to be non-empty')
      });
    })
    .addAssertion(
      '<RawRunResult|RawResult> [not] to have failed',
      (expect, result) => {
        expect(result, '[not] to satisfy', {
          code: expect.it('to be greater than', 0)
        });
      }
    )
    .addAssertion(
      '<RawRunResult|RawResult> [not] to have failed (with|having) output <any>',
      (expect, result, output) => {
        expect(result, '[not] to satisfy', {
          code: expect.it('to be greater than', 0),
          output: output
        });
      }
    )
    .addAssertion(
      '<RawRunResult|RawResult> [not] to have passed (with|having) output <any>',
      (expect, result, output) => {
        expect(result, '[not] to satisfy', {
          code: 0,
          output: output
        });
      }
    )
    .addAssertion(
      '<RawRunResult> [not] to have failed [test] count <number>',
      (expect, result, count) => {
        expect(result.failing, '[not] to be', count);
      }
    )
    .addAssertion(
      '<RawRunResult> [not] to have passed [test] count <number>',
      (expect, result, count) => {
        expect(result.passing, '[not] to be', count);
      }
    )
    .addAssertion(
      '<RawRunResult> [not] to have pending [test] count <number>',
      (expect, result, count) => {
        expect(result.pending, '[not] to be', count);
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have test count <number>',
      (expect, result, count) => {
        expect(result.stats.tests, '[not] to be', count);
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have failed [test] count <number>',
      (expect, result, count) => {
        expect(result.stats.failures, '[not] to be', count);
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have passed [test] count <number>',
      (expect, result, count) => {
        expect(result.stats.passes, '[not] to be', count);
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have pending [test] count <number>',
      (expect, result, count) => {
        expect(result.stats.pending, '[not] to be', count);
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have run (test|tests) <string+>',
      (expect, result, ...titles) => {
        titles.forEach(title => {
          expect(
            result,
            '[not] to have a value satisfying',
            expect.it('to have an item satisfying', {title: title})
          );
        });
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have failed (test|tests) <string+>',
      (expect, result, ...titles) => {
        titles.forEach(title => {
          expect(result.failures, '[not] to have an item satisfying', {
            title: title
          });
        });
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have failed with (error|errors) <any+>',
      (expect, result, ...errors) => {
        errors.forEach(error => {
          expect(result, '[not] to have failed').and('[not] to satisfy', {
            failures: expect.it('to have an item satisfying', {
              err: expect
                .it('to satisfy', error)
                .or('to satisfy', {message: error})
            })
          });
        });
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have (error|errors) <any+>',
      (expect, result, ...errors) => {
        errors.forEach(error => {
          expect(result, '[not] to satisfy', {
            failures: expect.it('to have an item satisfying', {
              err: expect
                .it('to satisfy', error)
                .or('to satisfy', {message: error})
            })
          });
        });
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have passed (test|tests) <string+>',
      (expect, result, ...titles) => {
        titles.forEach(title => {
          expect(result.passes, '[not] to have an item satisfying', {
            title: title
          });
        });
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have test order <string> <array>',
      (expect, result, state, titles) => {
        expect(
          result[state].slice(0, titles.length),
          '[not] to satisfy',
          titles.map(function(title) {
            return typeof title === 'string' ? {title: title} : title;
          })
        );
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have passed test order <array>',
      (expect, result, titles) => {
        expect(result, '[not] to have test order', 'passes', titles);
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have passed test order <string+>',
      (expect, result, ...titles) => {
        expect(result, '[not] to have test order', 'passes', titles);
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have failed test order <array>',
      (expect, result, titles) => {
        expect(result, '[not] to have test order', 'failures', titles);
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have failed test order <string+>',
      (expect, result, ...titles) => {
        expect(result, '[not] to have test order', 'failures', titles);
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have pending test order <array>',
      (expect, result, titles) => {
        expect(result, '[not] to have test order', 'pending', titles);
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have pending test order <string+>',
      (expect, result, ...titles) => {
        expect(result, '[not] to have test order', 'pending', titles);
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have pending tests',
      (expect, result) => {
        expect(result.stats.pending, '[not] to be greater than', 0);
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have passed tests',
      (expect, result) => {
        expect(result.stats.passes, '[not] to be greater than', 0);
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have failed tests',
      (expect, result) => {
        expect(result.stats.failed, '[not] to be greater than', 0);
      }
    )
    .addAssertion('<JSONRunResult> [not] to have tests', (expect, result) => {
      expect(result.stats.tests, '[not] to be greater than', 0);
    })
    .addAssertion(
      '<JSONRunResult> [not] to have retried test <string>',
      (expect, result, title) => {
        expect(result.tests, '[not] to have an item satisfying', {
          title: title,
          currentRetry: expect.it('to be positive')
        });
      }
    )
    .addAssertion(
      '<JSONRunResult> [not] to have retried test <string> <number>',
      (expect, result, title, count) => {
        expect(result.tests, '[not] to have an item satisfying', {
          title: title,
          currentRetry: count
        });
      }
    )
    .addAssertion(
      '<RawResult|RawRunResult> [not] to contain [output] <any>',
      (expect, result, output) => {
        expect(result.output, '[not] to satisfy', output);
      }
    )
    .addAssertion(
      '<RawResult|RawRunResult|JSONRunResult> to have [exit] code <number>',
      (expect, result, code) => {
        expect(result.code, 'to be', code);
      }
    )
    .addAssertion(
      '<JSONSerializableMap> as JSON <assertion>',
      (expect, subject) => {
        expect.errorMode = 'nested';
        expect.shift(subject.toJSON());
      }
    );
