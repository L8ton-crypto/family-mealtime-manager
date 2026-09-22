import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safeNext';

describe('safeNextPath', () => {
  it.each([
    ['/table', '/table'],
    ['/menu?x=1', '/menu?x=1'],
    ['/', '/'],
    ['/table/deep/path?a=1&b=2', '/table/deep/path?a=1&b=2'],
  ])('accepts a same-site relative path: %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    ['https://evil.com', 'absolute URL'],
    ['//evil.com', 'protocol-relative URL'],
    ['/\\evil.com', 'backslash trick'],
    ['javascript:alert(1)', 'javascript: protocol'],
    ['http://evil.com', 'absolute http URL'],
    ['data:text/html,evil', 'data: protocol'],
    ['/\t/evil.com', 'tab-smuggled protocol-relative URL'],
    ['relative-no-leading-slash', 'no leading slash'],
    ['', 'empty string'],
    [null, 'null'],
    [undefined, 'undefined'],
  ])('rejects and falls back to "/" for: %s (%s)', (input) => {
    expect(safeNextPath(input)).toBe('/');
  });
});
